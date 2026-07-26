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
 *   .markdown (within role div)            — assistant prose body
 *
 * ⚠ DO NOT take roleEl.textContent for assistant turns — wrapper may include
 *   hidden button labels, copy icons, regenerate UI chrome, etc.
 *
 * Attachment detection:
 *   ChatGPT renders file uploads as "file pill" elements inside the user message
 *   with class names like "file-pill" or containing a file type badge.
 *   We extract these as [Attached: name] and strip them before text extraction.
 */

const SELECTORS = {
  turn: '[data-message-author-role]',
  assistantBody: '.markdown',
  // ChatGPT attachment elements — confirmed from live DOM inspection
  attachmentContainer: '[class*="file-pill"], [class*="attachment"], [data-filetype]',
  attachmentName: '[class*="file-name"], [class*="filename"], [aria-label]',
  scrollContainer: 'main .overflow-y-auto, #__next main, [class*="react-scroll-to-bottom"]',
} as const;

const MODULE = 'chatgpt-extractor';

export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt' as const;

  protected override scrollContainerSelector(): string {
    return SELECTORS.scrollContainer;
  }

  protected findTurnElements(): Element[] {
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
      const bodyEl = el.querySelector(SELECTORS.assistantBody);
      if (!bodyEl) {
        logger.warn(MODULE, 'parseTurn',
          'Assistant turn found but .markdown body missing — skipping turn', {
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
        attachments: [], // ChatGPT assistant turns don't have attachments
      };
    }

    // User turn — extract attachments first, then strip them before text extraction
    const attachments = this.extractChatGPTAttachments(el);
    const content = this.extractTextContent(el, true);
    if (!content && attachments.length === 0) return null;

    return {
      role: 'user',
      content: content ?? '',
      codeBlocks: this.extractCodeBlocks(el),
      attachments,
    };
  }

  /**
   * ChatGPT-specific attachment extraction.
   * Looks for file pill elements inside user message wrappers.
   */
  private extractChatGPTAttachments(el: Element): string[] {
    const attachments: string[] = [];

    el.querySelectorAll('[data-file-name]').forEach((node) => {
      const name = node.getAttribute('data-file-name')?.trim();
      if (name) attachments.push(`[Attached: ${name}]`);
    });

    el.querySelectorAll('[data-filetype]').forEach((node) => {
      const nameEl = node.querySelector('[class*="name"], [class*="filename"]');
      const name = nameEl?.textContent?.trim() ?? node.getAttribute('aria-label')?.trim();
      if (name && !attachments.includes(`[Attached: ${name}]`)) {
        attachments.push(`[Attached: ${name}]`);
      }
    });

    // Pill-style file containers
    el.querySelectorAll('[class*="file-pill"]').forEach((node) => {
      const nameEl = node.querySelector('[class*="name"]');
      const name = nameEl?.textContent?.trim() ?? node.getAttribute('aria-label')?.trim();
      if (name && !attachments.includes(`[Attached: ${name}]`)) {
        attachments.push(`[Attached: ${name}]`);
      }
    });

    return [...new Set(attachments)];
  }

  private extractTextContent(el: Element, stripAttachments: boolean): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // Strip UI chrome elements (copy buttons, feedback, etc.)
    clone.querySelectorAll('[aria-hidden="true"], button, [class*="tooltip"]').forEach((n) => n.remove());

    if (stripAttachments) {
      this.stripAttachmentElements(clone);
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
