import type { Turn } from '../../core/models/conversation';
import { ExtractionError } from '../../shared/errors/error-types';
import { logger } from '../../shared/logger/logger';
import { BaseExtractor } from './base-extractor';

/**
 * Claude.ai DOM extractor (updated July 2026).
 *
 * Confirmed selectors (live console inspection):
 *   [data-testid="user-message"]  — user turn wrapper
 *   [data-is-streaming]           — assistant turn wrapper
 *   .font-claude-response         — real assistant text body
 *
 * ⚠ DO NOT use node.textContent on the assistant wrapper — Claude injects:
 *     <h2 data-find-omitted class="sr-only select-none">Claude responded: …</h2>
 *   which duplicates the full text prefixed with "Claude responded: ".
 *   Target .font-claude-response explicitly.
 *
 * Attachment detection:
 *   Claude renders file attachments as elements with data-testid containing "attachment"
 *   or class names containing "attachment"/"file". We extract these as [Attached: name]
 *   placeholders and strip them before text extraction.
 */

const SELECTORS = {
  userTurn: '[data-testid="user-message"]',
  assistantTurn: '[data-is-streaming]',
  assistantTextBody: '.font-claude-response',
  // Claude attachment elements — confirmed from live DOM inspection
  attachmentContainer: '[data-testid*="attachment"], [class*="file-attachment"], [class*="attachment-pill"]',
  attachmentName: '[class*="attachment-name"], [class*="file-name"], [data-file-name]',
  scrollContainer: '[data-testid="conversation-scroll-container"], .overflow-y-scroll, main',
} as const;

const MODULE = 'claude-extractor';

export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude' as const;

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
        message: 'Could not find any conversation turns — Claude DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [SELECTORS.userTurn, SELECTORS.assistantTurn],
        },
      });
    }

    return Array.from(nodes);
  }

  protected parseTurn(el: Element): Turn | null {
    // User turn
    if (el.matches(SELECTORS.userTurn)) {
      const attachments = this.extractAttachmentsFromClaudeTurn(el);
      const content = this.extractTextContent(el, true);
      if (!content && attachments.length === 0) return null;

      return {
        role: 'user',
        content: content ?? '',
        codeBlocks: this.extractCodeBlocks(el),
        attachments,
      };
    }

    // Assistant turn — MUST target .font-claude-response, not wrapper textContent
    const textEl = el.querySelector(SELECTORS.assistantTextBody);
    if (!textEl) {
      logger.warn(MODULE, 'parseTurn',
        'Assistant wrapper found but .font-claude-response missing — skipping turn', {
          wrapperOuterHtml: el.outerHTML.slice(0, 200),
        });
      return null;
    }

    const content = this.extractTextContent(textEl, false);
    if (!content) return null;

    return {
      role: 'assistant',
      content,
      codeBlocks: this.extractCodeBlocks(textEl),
      attachments: [], // Claude assistant turns don't have attachments
    };
  }

  /**
   * Claude-specific attachment extraction.
   * Claude renders attachments inside the user message wrapper.
   */
  private extractAttachmentsFromClaudeTurn(el: Element): string[] {
    const attachments: string[] = [];

    // Primary: data-file-name attribute on attachment elements
    el.querySelectorAll('[data-file-name]').forEach((node) => {
      const name = node.getAttribute('data-file-name')?.trim();
      if (name) attachments.push(`[Attached: ${name}]`);
    });

    // Secondary: named children within recognized attachment containers
    el.querySelectorAll(SELECTORS.attachmentContainer).forEach((container) => {
      const nameEl = container.querySelector(SELECTORS.attachmentName);
      if (nameEl) {
        const name = nameEl.textContent?.trim();
        if (name && !attachments.includes(`[Attached: ${name}]`)) {
          attachments.push(`[Attached: ${name}]`);
        }
      } else {
        // Fallback: use aria-label on the container itself
        const label = container.getAttribute('aria-label')?.trim();
        if (label && !attachments.includes(`[Attached: ${label}]`)) {
          attachments.push(`[Attached: ${label}]`);
        }
      }
    });

    return [...new Set(attachments)];
  }

  private extractTextContent(el: Element, stripAttachments: boolean): string {
    const clone = el.cloneNode(true) as Element;

    // Remove code blocks (captured separately as codeBlocks)
    clone.querySelectorAll('pre').forEach((pre) => pre.remove());

    // Remove sr-only accessibility elements (e.g. "Claude responded: …" prefix)
    clone.querySelectorAll('[class*="sr-only"], [aria-hidden="true"]').forEach((srEl) => srEl.remove());

    // Remove attachment DOM elements so filenames never bleed into content
    if (stripAttachments) {
      this.stripAttachmentElements(clone);
    }

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
