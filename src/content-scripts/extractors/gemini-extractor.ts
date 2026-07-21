import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { logger } from '../../shared/logger/logger';
import { BaseExtractor } from './base-extractor';

/**
 * Gemini DOM extractor (updated July 2026).
 *
 * Confirmed selectors (live console inspection):
 *   user-query           — custom element wrapping each user turn
 *   user-query-content   — nested element holding the actual user text
 *   model-response       — custom element wrapping each assistant turn
 *   message-content      — nested element holding the actual assistant text
 *                          (do NOT use response-container's textContent — it includes
 *                          surrounding action chrome / regenerate buttons)
 *
 * DOM order preservation: querySelectorAll('user-query, model-response') returns
 * all nodes in document order, so user/assistant turns come out correctly
 * interleaved without any manual sorting.
 */

const SELECTORS = {
  userTurn: 'user-query',
  assistantTurn: 'model-response',
  userBody: 'user-query-content',
  assistantBody: 'message-content',
} as const;

const MODULE = 'gemini-extractor';

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  protected findTurnElements(): Element[] {
    // Combined selector — querySelectorAll preserves DOM order across both custom elements.
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
      // Prefer the dedicated content element; fall back to the wrapper itself.
      // user-query-content is typically a plain text container with no hidden chrome.
      const bodyEl = el.querySelector(SELECTORS.userBody) ?? el;
      const content = this.extractTextContent(bodyEl);
      if (!content) return null;

      return {
        role: 'user',
        content,
        codeBlocks: this.extractCodeBlocks(bodyEl),
      };
    }

    // Assistant turn
    if (tag === SELECTORS.assistantTurn) {
      // MUST target message-content specifically.
      // response-container includes the full component chrome (action buttons, etc.)
      // and must not be used as the text source.
      const bodyEl = el.querySelector(SELECTORS.assistantBody);
      if (!bodyEl) {
        logger.warn(MODULE, 'parseTurn',
          'model-response found but message-content missing — skipping turn', {
            wrapperOuterHtml: el.outerHTML.slice(0, 200),
          });
        return null;
      }

      const content = this.extractTextContent(bodyEl);
      if (!content) return null;

      return {
        role: 'assistant',
        content,
        codeBlocks: this.extractCodeBlocks(bodyEl),
      };
    }

    // Should not happen given the combined selector, but guard anyway
    return null;
  }

  /**
   * Strips <pre> blocks (captured separately as codeBlocks) and returns clean prose text.
   */
  private extractTextContent(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

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
