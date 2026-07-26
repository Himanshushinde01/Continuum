import { installGlobalErrorHandler } from '../shared/errors/error-handler';
import { detectPlatform } from './platform-detector';
import { ClaudeExtractor } from './extractors/claude-extractor';
import { ChatGPTExtractor } from './extractors/chatgpt-extractor';
import { GeminiExtractor } from './extractors/gemini-extractor';
import { ClaudeInjector } from './injectors/claude-injector';
import { ChatGPTInjector } from './injectors/chatgpt-injector';
import { GeminiInjector } from './injectors/gemini-injector';
import { messageBus } from '../shared/messaging/message-bus';
import { logger } from '../shared/logger/logger';
import type { BaseExtractor } from './extractors/base-extractor';
import type { BaseInjector } from './injectors/base-injector';
import type { IncomingResponse } from '../types/chrome-messages.d';

const platform = detectPlatform();
installGlobalErrorHandler(`content-script:${platform}`);

const MODULE = 'content-entry';

if (platform === 'unknown') {
  logger.warn(MODULE, 'init', 'Running on unsupported platform — no extractor/injector wired', {
    url: window.location.href,
  });
} else {
  // Wire extractor and injector for detected platform
  let extractor: BaseExtractor;
  let injector: BaseInjector;

  switch (platform) {
    case 'claude':
      extractor = new ClaudeExtractor();
      injector = new ClaudeInjector();
      break;
    case 'chatgpt':
      extractor = new ChatGPTExtractor();
      injector = new ChatGPTInjector();
      break;
    case 'gemini':
      extractor = new GeminiExtractor();
      injector = new GeminiInjector();
      break;
  }

  logger.info(MODULE, 'init', `Content script ready on platform: ${platform}`);

  // ── Listen for messages from popup / background ─────────────────────────────
  chrome.runtime.onMessage.addListener(
    (rawMessage: unknown, _sender, sendResponse: (r: IncomingResponse) => void) => {
      const message = rawMessage as { type: string };

      // ── TRIGGER_CAPTURE — sent directly from popup via chrome.tabs.sendMessage ──
      // Returns a real CAPTURE_ACK so popup knows if it worked, no setTimeout needed.
      if (message.type === 'TRIGGER_CAPTURE') {
        void (async () => {
          logger.info(MODULE, 'onMessage', 'TRIGGER_CAPTURE received — starting extraction');

          const extractResult = await extractor.extract();
          if (!extractResult.ok) {
            logger.error(MODULE, 'onMessage', extractResult.error.describe());
            sendResponse({
              type: 'CAPTURE_ACK',
              success: false,
              error: extractResult.error.describe(),
            });
            return;
          }

          // Send extracted conversation to background for compress + save
          const saveResult = await messageBus.send({
            type: 'CAPTURE_REQUEST',
            conversation: extractResult.value,
          });

          if (!saveResult.ok) {
            logger.error(MODULE, 'onMessage', 'Failed to send capture to background', {
              error: saveResult.error.describe(),
            });
            sendResponse({
              type: 'CAPTURE_ACK',
              success: false,
              error: `Background unreachable: ${saveResult.error.describe()}`,
            });
            return;
          }

          // The background returns an AckResponse (possibly with partialCapture fields)
          const bgAck = saveResult.value as {
            type: string;
            success: boolean;
            error?: string;
            partialCapture?: boolean;
            partialCaptureMessage?: string;
          };
          if (bgAck.type === 'ACK' && !bgAck.success) {
            sendResponse({
              type: 'CAPTURE_ACK',
              success: false,
              error: bgAck.error ?? 'Background save failed',
            });
            return;
          }

          logger.info(MODULE, 'onMessage', 'Capture complete — sent ACK to popup');
          sendResponse({
            type: 'CAPTURE_ACK',
            success: true,
            partialCapture: bgAck.partialCapture,
            partialCaptureMessage: bgAck.partialCaptureMessage,
          });
        })();

        return true; // keep message channel open for async response
      }

      // ── INJECT_COMMAND — sent from background to fill the input box ────────────
      if (message.type === 'INJECT_COMMAND') {
        const injectMsg = rawMessage as { type: 'INJECT_COMMAND'; contextMarkdown: string };
        void injector
          .inject(injectMsg.contextMarkdown)
          .then((result) => {
            if (result.ok) {
              sendResponse({ type: 'ACK', success: true });
            } else {
              logger.error(MODULE, 'onMessage', result.error.describe());
              sendResponse({ type: 'ACK', success: false, error: result.error.describe() });
            }
          })
          .catch((err: unknown) => {
            sendResponse({ type: 'ACK', success: false, error: String(err) });
          });
        return true;
      }

      return false;
    }
  );
}
