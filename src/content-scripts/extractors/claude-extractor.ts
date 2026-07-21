import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { logger } from '../../shared/logger/logger';
import { BaseExtractor } from './base-extractor';

/**
 * Claude.ai DOM extractor (updated July 2026).
 *
 * Key selectors:
 *   [data-testid="user-message"]  — user turn wrapper
 *   [data-is-streaming]           — assistant turn wrapper (present regardless of streaming state)
 *   .font-claude-response         — the real assistant text body
 *
 * ⚠ DO NOT use node.textContent on the assistant wrapper directly, or
 *   node.querySelector('h2'). Claude injects an sr-only accessibility element:
 *     <h2 data-find-omitted class="sr-only select-none">Claude responded: …</h2>
 *   which duplicates the full text prefixed with "Claude responded: ".
 *   We must query .font-claude-response explicitly to skip it.
 */

const SELECTORS = {
  userTurn: '[data-testid="user-message"]',
  assistantTurn: '[data-is-streaming]',
  assistantTextBody: '.font-claude-response',
} as const;

const MODULE = 'claude-extractor';

export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude' as const;

  /**
   * Returns all turn elements in document order, each tagged with role and
   * the correct text-bearing element (never the sr-only duplicate).
   */
  protected findTurnElements(): Element[] {
    // Combined selector — querySelectorAll returns nodes in document order,
    // so user and assistant turns come out correctly interleaved automatically.
    const nodes = document.querySelectorAll(
      `${SELECTORS.userTurn}, ${SELECTORS.assistantTurn}`
    );

    if (nodes.length === 0) {
      throw new ExtractionError({
        code: 'EXTRACTION_CONTAINER_NOT_FOUND',
        module: MODULE,
        fn: 'findTurnElements',
        message: 'Could not find any conversation turns — Claude DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [SELECTORS.userTurn, SELECTORS.assistantTurn],
        },
      });
    }

    // Return the wrappers; parseTurn handles the per-role extraction logic.
    return Array.from(nodes);
  }

  protected parseTurn(el: Element): Turn | null {
    // User turn
    if (el.matches(SELECTORS.userTurn)) {
      const content = this.extractTextContent(el);
      if (!content) return null;

      return {
        role: 'user',
        content,
        codeBlocks: this.extractCodeBlocks(el),
      };
    }

    // Assistant turn wrapper ([data-is-streaming])
    // The real text lives in .font-claude-response.
    // DO NOT use el.textContent — it includes the sr-only <h2> with
    // "Claude responded: …" prefix that would corrupt the captured text.
    const textEl = el.querySelector(SELECTORS.assistantTextBody);
    if (!textEl) {
      logger.warn(MODULE, 'parseTurn',
        'Assistant wrapper found but .font-claude-response missing — skipping turn', {
          wrapperOuterHtml: el.outerHTML.slice(0, 200),
        });
      return null;
    }

    const content = this.extractTextContent(textEl);
    if (!content) return null;

    return {
      role: 'assistant',
      content,
      codeBlocks: this.extractCodeBlocks(textEl),
    };
  }

  /**
   * Extracts prose text from an element, stripping <pre> blocks first
   * (those are captured separately as codeBlocks by the base class).
   */
  private extractTextContent(el: Element): string {
    const clone = el.cloneNode(true) as Element;

    // Remove code blocks — captured separately via extractCodeBlocks()
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // Also strip the sr-only accessibility heading if it leaked into the clone
    clone.querySelectorAll('[class*="sr-only"]').forEach((srEl) => srEl.remove());

    // Prefer paragraph elements for clean prose extraction
    const paragraphs = clone.querySelectorAll('p, .prose p, [class*="prose"] p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs)
        .map((p) => p.textContent?.trim())
        .filter(Boolean)
        .join('\n\n');
    }

    return clone.textContent?.trim() ?? '';
  }
}
