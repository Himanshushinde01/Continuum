import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { BaseExtractor } from './base-extractor';

/**
 * Gemini DOM extractor.
 * Responsible ONLY for Gemini-specific DOM queries.
 *
 * Gemini DOM structure (as of July 2026):
 *   - Conversation uses custom web components like <user-query> and <model-response>
 *   - Falls back to role-based containers
 */
export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  protected findTurnElements(): Element[] {
    // Gemini uses custom web components for each turn
    const userTurns = Array.from(document.querySelectorAll('user-query, .user-query'));
    const modelTurns = Array.from(document.querySelectorAll('model-response, .model-response'));

    const combined = [...userTurns, ...modelTurns];

    if (combined.length > 0) {
      // Sort by DOM order
      return combined.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
    }

    // Fallback: look for a conversation container
    const container =
      document.querySelector('chat-window') ??
      document.querySelector('[class*="conversation-container"]') ??
      document.querySelector('main');

    if (!container) {
      throw new ExtractionError({
        code: 'EXTRACTION_CONTAINER_NOT_FOUND',
        module: 'gemini-extractor',
        fn: 'findTurnElements',
        message: 'Could not find conversation container — Gemini DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: ['user-query', 'model-response', 'chat-window', 'main'],
        },
      });
    }

    return Array.from(container.children);
  }

  protected parseTurn(el: Element): Turn | null {
    const tagName = el.tagName.toLowerCase();
    const className = el.className.toLowerCase();

    let role: 'user' | 'assistant';

    if (tagName === 'user-query' || className.includes('user-query') || className.includes('human')) {
      role = 'user';
    } else if (tagName === 'model-response' || className.includes('model-response') || className.includes('model')) {
      role = 'assistant';
    } else {
      // Skip non-turn elements
      return null;
    }

    const content = this.extractTextContent(el);
    if (!content) return null;

    const codeBlocks = this.extractCodeBlocks(el);

    return { role, content, codeBlocks };
  }

  private extractTextContent(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // Gemini often wraps text in <p> elements inside the response
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
