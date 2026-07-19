import { InjectionError } from '../../shared/errors/error-types';
import { BaseInjector } from './base-injector';

/**
 * Claude.ai injector — finds Claude's input box.
 * Claude uses a contenteditable div, not a textarea.
 */
export class ClaudeInjector extends BaseInjector {
  readonly platform = 'claude';

  protected findInputElement(): HTMLElement {
    const el =
      document.querySelector<HTMLElement>('[data-testid="composer-input"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][data-placeholder]') ??
      document.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"]');

    if (!el) {
      throw new InjectionError({
        code: 'INJECTION_INPUT_NOT_FOUND',
        module: 'claude-injector',
        fn: 'findInputElement',
        message: 'Could not find Claude input box — Claude DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [
            '[data-testid="composer-input"]',
            '[contenteditable="true"][data-placeholder]',
            '.ProseMirror[contenteditable="true"]',
          ],
        },
      });
    }

    return el;
  }

  /** Claude uses ProseMirror (contenteditable) — override to set innerText correctly. */
  protected override setNativeValue(el: HTMLElement, value: string): void {
    el.innerText = value;
  }
}
