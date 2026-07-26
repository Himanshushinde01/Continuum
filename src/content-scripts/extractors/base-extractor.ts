import type { NormalizedConversation, Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { type Result, Ok, Err } from '../../shared/errors/result';
import { logger } from '../../shared/logger/logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;

// Scroll parameters for virtualization forcing
const SCROLL_STEP_PX = 2000;
const SCROLL_WAIT_MS = 400;
const MAX_SCROLL_ITERATIONS = 60; // guard against infinite loops on huge chats

/**
 * Abstract base extractor — shared scroll/wait/retry/completeness-check logic.
 * Subclasses implement ONLY platform-specific DOM queries (findTurnElements, parseTurn).
 * No platform-specific logic is allowed here.
 *
 * SCROLL-TO-LOAD:
 *   Chat UIs virtualize long conversations — messages scrolled out of view may not
 *   exist in the live DOM. Before parsing, we scroll the conversation container from
 *   top to bottom in steps, waiting between each step, until no new turn elements
 *   appear. This forces the full thread into the DOM.
 *
 * COMPLETENESS CHECK:
 *   After extraction, we compare the raw DOM element count (from findTurnElements())
 *   against the parsed turn count (after parseTurn() filtering). If they differ, we
 *   set `conversation.extractedTurnCount` so the popup can warn the user.
 */
export abstract class BaseExtractor {
  abstract readonly platform: NormalizedConversation['sourcePlatform'];

  /**
   * CSS selector for the scrollable conversation container on this platform.
   * Subclasses should override if their scroll container differs from the default.
   * Return null to skip scroll-to-load (e.g. platforms that don't virtualize).
   */
  protected scrollContainerSelector(): string | null {
    return null; // default: no scrolling (tests use JSDOM which has no layout engine)
  }

  /**
   * Template method — scrolls to load all turns, then retries if DOM isn't ready.
   * Subclasses must NOT override this; they implement findTurnElements and parseTurn.
   */
  async extract(): Promise<Result<NormalizedConversation, ExtractionError>> {
    let lastError: ExtractionError | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Force full conversation into DOM before querying
        await this.scrollToLoadAll();

        const domElements = this.findTurnElements();

        if (domElements.length === 0) {
          throw new ExtractionError({
            code: 'EXTRACTION_NO_TURNS_FOUND',
            module: this.platform + '-extractor',
            fn: 'extract',
            message: `No conversation turns found on attempt ${attempt}/${MAX_RETRIES} — page may still be loading`,
            context: { url: window.location.href, attempt },
          });
        }

        const turns: Turn[] = [];
        for (const el of domElements) {
          const turn = this.parseTurn(el);
          if (turn !== null) turns.push(turn);
        }

        if (turns.length === 0) {
          throw new ExtractionError({
            code: 'EXTRACTION_ALL_TURNS_UNPARSEABLE',
            module: this.platform + '-extractor',
            fn: 'extract',
            message: `Found ${domElements.length} turn elements but none parsed successfully`,
            context: { url: window.location.href, elementCount: domElements.length },
          });
        }

        // Completeness check — warn but don't fail if counts mismatch
        const domCount = domElements.length;
        const parsedCount = turns.length;
        if (domCount > parsedCount) {
          logger.warn(
            this.platform + '-extractor',
            'extract',
            `Completeness check: DOM has ${domCount} turn elements but only ${parsedCount} parsed successfully — some turns may have been skipped`,
            { url: window.location.href, domCount, parsedCount }
          );
        }

        const conversation: NormalizedConversation = {
          sourcePlatform: this.platform,
          turns,
          capturedAt: new Date().toISOString(),
          // Always record the DOM count so callers can detect partial captures
          extractedTurnCount: domCount,
        };

        logger.info(
          this.platform + '-extractor',
          'extract',
          `Extracted ${turns.length} turns from ${this.platform}`,
          { url: window.location.href, domCount, parsedCount }
        );

        return Ok(conversation);
      } catch (err) {
        if (err instanceof ExtractionError) {
          lastError = err;
        } else {
          lastError = new ExtractionError({
            code: 'EXTRACTION_UNEXPECTED',
            module: this.platform + '-extractor',
            fn: 'extract',
            message: `Unexpected error on attempt ${attempt}`,
            context: { url: window.location.href, attempt },
            cause: err,
          });
        }

        logger.warn(
          this.platform + '-extractor',
          'extract',
          `Attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
        );

        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    logger.error(
      this.platform + '-extractor',
      'extract',
      `All ${MAX_RETRIES} extraction attempts failed`,
      { url: window.location.href }
    );

    return Err(lastError!);
  }

  /**
   * Scrolls the conversation container from top to bottom in steps, waiting
   * between each step, until no new turn elements appear in the DOM.
   * This forces virtualized chat UIs to load all messages.
   *
   * Gracefully no-ops in environments without layout (JSDOM in tests).
   */
  protected async scrollToLoadAll(): Promise<void> {
    const selector = this.scrollContainerSelector();
    if (!selector) return;

    const container = document.querySelector(selector);
    if (!container || !(container instanceof HTMLElement)) return;

    // First scroll to top so we load from the beginning
    container.scrollTop = 0;
    await delay(SCROLL_WAIT_MS);

    let lastCount = 0;
    let iterations = 0;

    while (iterations < MAX_SCROLL_ITERATIONS) {
      const currentCount = this.findTurnElements().length;

      if (currentCount === lastCount && iterations > 0) {
        // No new elements loaded — we've reached the end
        break;
      }

      lastCount = currentCount;
      container.scrollTop += SCROLL_STEP_PX;
      await delay(SCROLL_WAIT_MS);
      iterations++;
    }

    // Final scroll to bottom to ensure the last few messages are visible
    container.scrollTop = container.scrollHeight;
    await delay(SCROLL_WAIT_MS);
  }

  /** Return all turn-level DOM elements in document order. */
  protected abstract findTurnElements(): Element[];

  /**
   * Parse a single turn element into a typed Turn.
   * Return null if the element is not a real conversation turn
   * (e.g., it's a UI widget, a separator, or otherwise not content).
   */
  protected abstract parseTurn(el: Element): Turn | null;

  /** Shared: extract code blocks from an element's innerHTML. */
  protected extractCodeBlocks(el: Element): import('../../core/models/conversation').CodeBlock[] {
    const preElements = el.querySelectorAll('pre code, pre');
    const blocks: import('../../core/models/conversation').CodeBlock[] = [];

    preElements.forEach((pre) => {
      const codeEl = pre.tagName === 'PRE' ? pre.querySelector('code') ?? pre : pre;
      const langClass = Array.from(codeEl.classList).find((c) => c.startsWith('language-'));
      const language = langClass ? langClass.replace('language-', '') : 'text';
      const content = codeEl.textContent?.trim() ?? '';
      if (content.length > 0) {
        blocks.push({ language, content, keepVerbatim: false });
      }
    });

    return blocks;
  }

  /**
   * Shared: detect and extract file attachment placeholders from an element.
   * Looks for common attachment DOM patterns across platforms.
   * Returns array of "[Attached: filename]" strings — never the raw binary content.
   *
   * Subclasses should call this and pass the result into the Turn's `attachments` field.
   */
  protected extractAttachments(el: Element): string[] {
    const attachments: string[] = [];

    // Generic patterns used across multiple platforms:
    // 1. data-file-name attribute (most reliable)
    el.querySelectorAll('[data-file-name]').forEach((node) => {
      const name = node.getAttribute('data-file-name')?.trim();
      if (name) attachments.push(`[Attached: ${name}]`);
    });

    // 2. aria-label on file attachment containers
    el.querySelectorAll('[class*="attachment"][aria-label], [class*="file"][aria-label]').forEach((node) => {
      const label = node.getAttribute('aria-label')?.trim();
      if (label && !attachments.includes(`[Attached: ${label}]`)) {
        attachments.push(`[Attached: ${label}]`);
      }
    });

    // 3. Explicit file-name span/div inside attachment containers
    el.querySelectorAll('[class*="attachment"] [class*="name"], [class*="file-pill"] [class*="name"]').forEach((node) => {
      const name = node.textContent?.trim();
      if (name && name.length > 0 && !attachments.includes(`[Attached: ${name}]`)) {
        attachments.push(`[Attached: ${name}]`);
      }
    });

    return [...new Set(attachments)]; // deduplicate
  }

  /**
   * Removes attachment elements from a cloned element before text extraction,
   * ensuring attachment text never bleeds into the `content` field.
   */
  protected stripAttachmentElements(clone: Element): void {
    clone.querySelectorAll(
      '[data-file-name], [class*="attachment"], [class*="file-pill"], [class*="file-chip"], [class*="file-upload"]'
    ).forEach((el) => el.remove());
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
