import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { BaseExtractor } from './base-extractor';

/**
 * Claude.ai DOM extractor.
 * Responsible ONLY for Claude-specific DOM queries.
 * All retry/wait logic is inherited from BaseExtractor.
 *
 * Claude DOM structure (as of July 2026):
 *   - Conversation turns are inside [data-testid="conversation-turn-*"] elements
 *   - User turns have class containing "human" or data-author="human"
 *   - Assistant turns wrap in the main content block
 */
export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude' as const;

  protected findTurnElements(): Element[] {
    // Primary selector — Claude uses data-testid on each turn
    let turns = Array.from(
      document.querySelectorAll('[data-testid^="conversation-turn-"]')
    );

    // Fallback: look for the conversation container and its direct children
    if (turns.length === 0) {
      const container =
        document.querySelector('[data-testid="conversation"]') ??
        document.querySelector('.conversation-content') ??
        document.querySelector('main [class*="conversation"]');

      if (!container) {
        throw new ExtractionError({
          code: 'EXTRACTION_CONTAINER_NOT_FOUND',
          module: 'claude-extractor',
          fn: 'findTurnElements',
          message:
            'Could not find conversation container — Claude DOM structure may have changed',
          context: {
            url: window.location.href,
            triedSelectors: [
              '[data-testid^="conversation-turn-"]',
              '[data-testid="conversation"]',
              '.conversation-content',
            ],
          },
        });
      }

      turns = Array.from(container.children);
    }

    return turns;
  }

  protected parseTurn(el: Element): Turn | null {
    // Determine role from testid or class
    const testId = el.getAttribute('data-testid') ?? '';
    const isUser =
      testId.includes('human') ||
      el.classList.contains('human') ||
      el.querySelector('[data-message-author-role="user"]') !== null ||
      el.querySelector('[class*="human"]') !== null;

    const isAssistant =
      testId.includes('assistant') ||
      el.classList.contains('assistant') ||
      el.querySelector('[data-message-author-role="assistant"]') !== null ||
      el.querySelector('[class*="assistant"]') !== null;

    // If we can't determine role, try heuristic: user messages are shorter and plainer
    let role: 'user' | 'assistant';
    if (isUser) {
      role = 'user';
    } else if (isAssistant) {
      role = 'assistant';
    } else {
      // Skip elements that are clearly not conversation turns
      const text = el.textContent?.trim() ?? '';
      if (text.length === 0) return null;
      // Default heuristic — this may be wrong, but better than dropping the turn
      role = 'user';
    }

    const content = this.extractTextContent(el);
    if (!content) return null;

    const codeBlocks = this.extractCodeBlocks(el);

    return {
      role,
      content,
      codeBlocks,
      timestamp: el.getAttribute('data-timestamp') ?? undefined,
    };
  }

  private extractTextContent(el: Element): string {
    // Remove code block text from the main content to avoid duplication
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // Claude uses paragraph elements for main text
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
