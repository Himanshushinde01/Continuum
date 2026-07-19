import type { NormalizedConversation, Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { type Result, Ok, Err } from '../../shared/errors/result';
import { logger } from '../../shared/logger/logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;

/**
 * Abstract base extractor — shared DOM-wait/retry logic and extract() template method.
 * Subclasses implement ONLY the platform-specific DOM queries (findTurnElements, parseTurn).
 * No platform-specific logic is allowed here.
 */
export abstract class BaseExtractor {
  abstract readonly platform: NormalizedConversation['sourcePlatform'];

  /**
   * Template method — retries if the DOM isn't ready yet.
   * Subclasses must NOT override this; they implement findTurnElements and parseTurn.
   */
  async extract(): Promise<Result<NormalizedConversation, ExtractionError>> {
    let lastError: ExtractionError | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const elements = this.findTurnElements();
        if (elements.length === 0) {
          throw new ExtractionError({
            code: 'EXTRACTION_NO_TURNS_FOUND',
            module: this.platform + '-extractor',
            fn: 'extract',
            message: `No conversation turns found on attempt ${attempt}/${MAX_RETRIES} — page may still be loading`,
            context: { url: window.location.href, attempt },
          });
        }

        const turns: Turn[] = [];
        for (const el of elements) {
          const turn = this.parseTurn(el);
          if (turn !== null) turns.push(turn);
        }

        if (turns.length === 0) {
          throw new ExtractionError({
            code: 'EXTRACTION_ALL_TURNS_UNPARSEABLE',
            module: this.platform + '-extractor',
            fn: 'extract',
            message: `Found ${elements.length} turn elements but none parsed successfully`,
            context: { url: window.location.href, elementCount: elements.length },
          });
        }

        const conversation: NormalizedConversation = {
          sourcePlatform: this.platform,
          turns,
          capturedAt: new Date().toISOString(),
        };

        logger.info(
          this.platform + '-extractor',
          'extract',
          `Extracted ${turns.length} turns from ${this.platform}`,
          { url: window.location.href }
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
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
