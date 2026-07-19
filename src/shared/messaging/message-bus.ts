import type { OutgoingMessage, IncomingResponse } from '../../types/chrome-messages.d';
import { logger } from '../logger/logger';
import { MessageError } from '../errors/error-types';
import { type Result, Ok, Err } from '../errors/result';

const MODULE = 'message-bus';

/**
 * Typed wrapper over chrome.runtime.sendMessage / onMessage.
 * This is the ONLY place allowed to call chrome.runtime.sendMessage directly.
 * All other cross-context communication must go through here.
 */
export const messageBus = {
  /**
   * Send a typed message from content-script or popup to the background.
   */
  async send<R extends IncomingResponse>(
    message: OutgoingMessage
  ): Promise<Result<R, MessageError>> {
    try {
      const response = await chrome.runtime.sendMessage(message) as R;
      return Ok(response);
    } catch (err) {
      const error = new MessageError({
        code: 'MESSAGE_SEND_FAILED',
        module: MODULE,
        fn: 'send',
        message: `Failed to send message of type "${message.type}"`,
        context: { messageType: message.type },
        cause: err,
      });
      logger.error(MODULE, 'send', error.describe());
      return Err(error);
    }
  },

  /**
   * Send a typed message from background to a specific tab (content script).
   */
  async sendToTab<R extends IncomingResponse>(
    tabId: number,
    message: OutgoingMessage
  ): Promise<Result<R, MessageError>> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message) as R;
      return Ok(response);
    } catch (err) {
      const error = new MessageError({
        code: 'MESSAGE_SEND_TO_TAB_FAILED',
        module: MODULE,
        fn: 'sendToTab',
        message: `Failed to send message of type "${message.type}" to tab ${tabId}`,
        context: { messageType: message.type, tabId },
        cause: err,
      });
      logger.error(MODULE, 'sendToTab', error.describe());
      return Err(error);
    }
  },

  /**
   * Register a listener in the background service worker.
   * The handler receives a typed message and returns a typed response.
   */
  onMessage(
    handler: (
      message: OutgoingMessage,
      sender: chrome.runtime.MessageSender
    ) => Promise<IncomingResponse> | undefined
  ): void {
    chrome.runtime.onMessage.addListener(
      (
        rawMessage: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: IncomingResponse) => void
      ) => {
        const message = rawMessage as OutgoingMessage;
        const result = handler(message, sender);
        if (result) {
          result.then(sendResponse).catch((err: unknown) => {
            logger.error(MODULE, 'onMessage', 'Handler threw unexpectedly', {
              messageType: message.type,
              error: String(err),
            });
          });
          return true; // keep the message channel open for async response
        }
        return false;
      }
    );
  },
};
