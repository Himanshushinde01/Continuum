import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { logger } from '../../shared/logger/logger';
import { BaseExtractor } from './base-extractor';

/**
 * Gemini DOM extractor (updated July 2026).
 *
 * Confirmed selectors (live console inspection):
 *   user-query           — custom element for user turn
 *   user-query-content   — nested element with user text
 *   model-response       — custom element for assistant turn
 *   message-content      — nested element with real text
 *                          (NOT response-container — that includes action chrome)
 *
 * Attachment detection:
 *   Gemini renders image/file uploads inside user-query as custom elements or
 *   div containers with class names containing "image-upload" or "file-chip".
 *   We extract these as [Attached: name] and strip before text extraction.
 */

const SELECTORS = {
  userTurn: 'user-query',
  assistantTurn: 'model-response',
  userBody: 'user-query-content',
  assistantBody: 'message-content',
  // Gemini attachment elements
  attachmentContainer: '[class*="image-upload"], [class*="file-chip"], [class*="uploaded-file"]',
  attachmentName: '[class*="file-name"], [alt], [aria-label]',
  scrollContainer: 'infinite-scroller, chat-history, .conversation-container, main',
} as const;

const MODULE = 'gemini-extractor';

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  protected override scrollContainerSelector(): string {
    return SELECTORS.scrollContainer;
  }

  protected findTurnElements(): Element[] {
    const nodes = document.querySelectorAll(
      `${SELECTORS.userTurn}, ${SELECTORS.assistantTurn}`
    );

    if (nodes.length === 0) {
      throw new ExtractionError({
        code: 'EXTRACTION_CONTAINER_NOT_FOUND',
        module: MODULE,
        fn: 'findTurnElements',
        message: 'Could not find any conversation turns — Gemini DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [SELECTORS.userTurn, SELECTORS.assistantTurn],
        },
      });
    }

    return Array.from(nodes);
  }

  protected parseTurn(el: Element): Turn | null {
    const tag = el.tagName.toLowerCase();

    // User turn
    if (tag === SELECTORS.userTurn) {
      const attachments = this.extractGeminiAttachments(el);
      const bodyEl = el.querySelector(SELECTORS.userBody) ?? el;
      const content = this.extractTextContent(bodyEl, true);
      if (!content && attachments.length === 0) return null;

      return {
        role: 'user',
        content: content ?? '',
        codeBlocks: this.extractCodeBlocks(bodyEl),
        attachments,
      };
    }

    // Assistant turn — target message-content, NOT response-container
    if (tag === SELECTORS.assistantTurn) {
      const bodyEl = el.querySelector(SELECTORS.assistantBody);
      if (!bodyEl) {
        logger.warn(MODULE, 'parseTurn',
          'model-response found but message-content missing — skipping turn', {
            wrapperOuterHtml: el.outerHTML.slice(0, 200),
          });
        return null;
      }

      const content = this.extractTextContent(bodyEl, false);
      if (!content) return null;

      return {
        role: 'assistant',
        content,
        codeBlocks: this.extractCodeBlocks(bodyEl),
        attachments: [],
      };
    }

    return null;
  }

  /**
   * Gemini-specific attachment extraction.
   * Looks for image uploads and file chips inside user-query elements.
   */
  private extractGeminiAttachments(el: Element): string[] {
    const attachments: string[] = [];

    el.querySelectorAll('[data-file-name]').forEach((node) => {
      const name = node.getAttribute('data-file-name')?.trim();
      if (name) attachments.push(`[Attached: ${name}]`);
    });

    el.querySelectorAll(SELECTORS.attachmentContainer).forEach((container) => {
      // img alt text (for image uploads)
      const img = container.querySelector('img[alt]');
      if (img) {
        const alt = img.getAttribute('alt')?.trim();
        if (alt && !attachments.includes(`[Attached: ${alt}]`)) {
          attachments.push(`[Attached: ${alt}]`);
          return;
        }
      }

      // Named file chip text
      const nameEl = container.querySelector(SELECTORS.attachmentName);
      const name = nameEl?.textContent?.trim() ?? container.getAttribute('aria-label')?.trim();
      if (name && !attachments.includes(`[Attached: ${name}]`)) {
        attachments.push(`[Attached: ${name}]`);
      }
    });

    return [...new Set(attachments)];
  }

  private extractTextContent(el: Element, stripAttachments: boolean): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());

    if (stripAttachments) {
      this.stripAttachmentElements(clone);
      // Also strip Gemini-specific attachment containers
      clone.querySelectorAll(SELECTORS.attachmentContainer).forEach((n) => n.remove());
    }

    const paragraphs = clone.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs)
        .map((p) => p.textContent?.trim())
        .filter(Boolean)
        .join('\n\n');
    }

    return clone.textContent?.trim() ?? '';
  }
}
