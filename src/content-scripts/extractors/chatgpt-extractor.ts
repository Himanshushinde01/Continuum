import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { BaseExtractor } from './base-extractor';

/**
 * ChatGPT DOM extractor.
 * Responsible ONLY for ChatGPT-specific DOM queries.
 *
 * ChatGPT DOM structure (as of July 2026):
 *   - Each conversation turn has data-message-author-role="user" or "assistant"
 *   - Wrapped inside article elements within the conversation thread
 */
export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt' as const;

  protected findTurnElements(): Element[] {
    // Primary: article elements with data-testid="conversation-turn-*"
    let turns = Array.from(
      document.querySelectorAll('article[data-testid^="conversation-turn-"]')
    );

    if (turns.length === 0) {
      // Fallback: divs with role attribute indicating turns
      turns = Array.from(
        document.querySelectorAll('[data-message-author-role]')
      ).map((el) => el.closest('article') ?? el);

      // Deduplicate
      turns = [...new Set(turns)];
    }

    if (turns.length === 0) {
      throw new ExtractionError({
        code: 'EXTRACTION_CONTAINER_NOT_FOUND',
        module: 'chatgpt-extractor',
        fn: 'findTurnElements',
        message:
          'Could not find conversation turns — ChatGPT DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [
            'article[data-testid^="conversation-turn-"]',
            '[data-message-author-role]',
          ],
        },
      });
    }

    return turns;
  }

  protected parseTurn(el: Element): Turn | null {
    // Find the role indicator
    const roleEl =
      el.querySelector('[data-message-author-role]') ??
      el.closest('[data-message-author-role]');

    const rawRole = roleEl?.getAttribute('data-message-author-role');
    if (!rawRole) return null;

    const role: 'user' | 'assistant' =
      rawRole === 'user' ? 'user' : 'assistant';

    const content = this.extractTextContent(el, role);
    if (!content) return null;

    const codeBlocks = this.extractCodeBlocks(el);

    return { role, content, codeBlocks };
  }

  private extractTextContent(el: Element, role: 'user' | 'assistant'): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // ChatGPT wraps prose in markdown-body or similar classes
    if (role === 'assistant') {
      const prose =
        clone.querySelector('.markdown') ??
        clone.querySelector('[class*="markdown"]') ??
        clone.querySelector('[class*="prose"]');

      if (prose) {
        return prose.textContent?.trim() ?? '';
      }
    }

    return clone.textContent?.trim() ?? '';
  }
}
