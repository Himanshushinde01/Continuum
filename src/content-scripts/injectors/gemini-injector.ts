import { InjectionError } from '../../shared/errors/error-types';
import { BaseInjector } from './base-injector';

/**
 * Gemini injector — finds Gemini's input box.
 * Gemini uses a rich text area (contenteditable) inside a custom element.
 */
export class GeminiInjector extends BaseInjector {
  readonly platform = 'gemini';

  protected findInputElement(): HTMLElement {
    const el =
      document.querySelector<HTMLElement>('rich-textarea .ql-editor[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][aria-label*="Enter"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]') ??
      document.querySelector<HTMLElement>('rich-textarea [contenteditable]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"]');

    if (!el) {
      throw new InjectionError({
        code: 'INJECTION_INPUT_NOT_FOUND',
        module: 'gemini-injector',
        fn: 'findInputElement',
        message: 'Could not find Gemini input box — Gemini DOM structure may have changed',
        context: {
          url: window.location.href,
          triedSelectors: [
            'rich-textarea .ql-editor',
            '[contenteditable="true"][aria-label*="Enter"]',
            'rich-textarea [contenteditable]',
          ],
        },
      });
    }

    return el;
  }

  protected override setNativeValue(el: HTMLElement, value: string): void {
    // Gemini uses Quill editor — set innerText, not value
    el.innerText = value;
  }
}
