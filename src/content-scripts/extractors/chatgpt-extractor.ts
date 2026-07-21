import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { logger } from '../../shared/logger/logger';
import { BaseExtractor } from './base-extractor';

/**
 * ChatGPT DOM extractor (updated July 2026).
 *
 * Confirmed selectors (live console inspection):
 *   [data-message-author-role="user"]      — user turn div
 *   [data-message-author-role="assistant"] — assistant turn div
 *   .markdown.prose  (or .markdown alone)  — assistant prose body, nested inside the role div
 *
 * ⚠ DO NOT take roleEl.textContent directly for assistant turns — the wrapper
 *   may include hidden button labels, copy icons, regenerate UI chrome, etc.
 *   Always resolve .markdown within the role node first, then fall back to
 *   the role node's own textContent ONLY when .markdown is absent (user turns
 *   typically have no markdown wrapper).
 *
 * DOM order preservation: a single querySelectorAll('[data-message-author-role]')
 * returns nodes in document order, so no manual sorting is needed.
 */

const SELECTORS = {
  turn: '[data-message-author-role]',
  assistantBody: '.markdown',
} as const;

const MODULE = 'chatgpt-extractor';

export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt' as const;

  protected findTurnElements(): Element[] {
    // Single flat query — returns user AND assistant nodes in document order.
    const nodes = document.querySelectorAll(SELECTORS.turn);

    if (nodes.length === 0) {
      throw new ExtractionError({
        code: 'EXTRACTION_CONTAINER_NOT_FOUND',
        module: MODULE,
        fn: 'findTurnElements',
        message: 'Could not find any conversation turns — ChatGPT DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [SELECTORS.turn],
        },
      });
    }

    return Array.from(nodes);
  }

  protected parseTurn(el: Element): Turn | null {
    const rawRole = el.getAttribute('data-message-author-role');
    if (!rawRole) return null;

    const role: 'user' | 'assistant' = rawRole === 'user' ? 'user' : 'assistant';

    if (role === 'assistant') {
      // Resolve .markdown inside the role node — never use the wrapper's textContent
      // directly, as it may contain UI chrome (copy buttons, regenerate labels, etc.).
      const bodyEl = el.querySelector(SELECTORS.assistantBody);
      if (!bodyEl) {
        logger.warn(MODULE, 'parseTurn',
          'Assistant turn found but .markdown body missing — skipping turn', {
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

    // User turn — no markdown wrapper; take textContent directly.
    const content = this.extractTextContent(el);
    if (!content) return null;

    return {
      role: 'user',
      content,
      codeBlocks: this.extractCodeBlocks(el),
    };
  }

  /**
   * Strips <pre> blocks (captured separately as codeBlocks) and returns clean prose text.
   */
  private extractTextContent(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // Prefer explicit paragraph elements for clean extraction
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
