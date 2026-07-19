import { InjectionError } from '../../shared/errors/error-types';
import { BaseInjector } from './base-injector';

/**
 * ChatGPT injector — finds ChatGPT's input box.
 * ChatGPT uses a textarea or contenteditable div depending on version.
 */
export class ChatGPTInjector extends BaseInjector {
  readonly platform = 'chatgpt';

  protected findInputElement(): HTMLTextAreaElement | HTMLElement {
    // Try textarea first (older interface)
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-id="prompt-textarea"]') ??
      document.querySelector<HTMLTextAreaElement>('#prompt-textarea') ??
      document.querySelector<HTMLTextAreaElement>('main textarea');

    if (textarea) return textarea;

    // Newer interface uses contenteditable
    const editable = document.querySelector<HTMLElement>('[contenteditable="true"][data-id="prompt-textarea"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"].ProseMirror');

    if (editable) return editable;

    throw new InjectionError({
      code: 'INJECTION_INPUT_NOT_FOUND',
      module: 'chatgpt-injector',
      fn: 'findInputElement',
      message: 'Could not find ChatGPT input box — ChatGPT DOM structure may have changed',
      context: {
        url: window.location.href,
        triedSelectors: [
          'textarea[data-id="prompt-textarea"]',
          '#prompt-textarea',
          '[contenteditable="true"][data-id="prompt-textarea"]',
        ],
      },
    });
  }
}
