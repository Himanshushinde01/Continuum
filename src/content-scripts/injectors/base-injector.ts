import { InjectionError } from '../../shared/errors/error-types';
import { type Result, Ok, Err } from '../../shared/errors/result';
import { logger } from '../../shared/logger/logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 600;

/**
 * Abstract base injector — shared "find input box, set value, dispatch events" logic.
 * The React-based AI sites track input via synthetic events — we must dispatch them
 * correctly or the send button won't activate.
 * Subclasses implement ONLY the platform-specific selector for finding the input box.
 */
export abstract class BaseInjector {
  abstract readonly platform: string;

  /**
   * Inject contextMarkdown into the platform's input box.
   * Template method — subclasses implement findInputElement only.
   */
  async inject(contextMarkdown: string): Promise<Result<void, InjectionError>> {
    let lastError: InjectionError | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const inputEl = this.findInputElement();

        this.setNativeValue(inputEl, contextMarkdown);
        this.dispatchInputEvents(inputEl);

        logger.info(
          this.platform + '-injector',
          'inject',
          'Context injected into input box successfully',
          { length: contextMarkdown.length }
        );

        return Ok(undefined);
      } catch (err) {
        if (err instanceof InjectionError) {
          lastError = err;
        } else {
          lastError = new InjectionError({
            code: 'INJECTION_UNEXPECTED',
            module: this.platform + '-injector',
            fn: 'inject',
            message: `Unexpected error on attempt ${attempt}`,
            context: { attempt },
            cause: err,
          });
        }

        logger.warn(
          this.platform + '-injector',
          'inject',
          `Attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
        );

        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    return Err(lastError!);
  }

  /** Find the platform's text input element. Must throw InjectionError if not found. */
  protected abstract findInputElement(): HTMLTextAreaElement | HTMLElement;

  /**
   * Set value using React's internal fiber system so React-controlled inputs detect the change.
   * Native value setter is bypassed by React, so we must use the descriptor from the prototype.
   */
  protected setNativeValue(el: HTMLElement, value: string): void {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set ?? Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'innerText')?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      // Fallback for contenteditable
      (el as HTMLElement).innerText = value;
    }
  }

  /**
   * Dispatch the synthetic events that React/other frameworks listen to.
   * Without these, the "Send" button stays disabled.
   */
  protected dispatchInputEvents(el: HTMLElement): void {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    el.focus();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
