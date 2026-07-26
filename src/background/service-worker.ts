import { installGlobalErrorHandler } from '../shared/errors/error-handler';
import { messageBus } from '../shared/messaging/message-bus';
import { captureRepository } from '../storage/capture-repository';
import { Compressor } from '../core/compression/compressor';
import { contextMdBuilder } from '../core/markdown/context-md-builder';
import { tokenEstimator } from '../core/compression/token-estimator';
import { logger } from '../shared/logger/logger';
import type { OutgoingMessage, IncomingResponse, AckResponse, CaptureListResponse, CaptureResponse } from '../types/chrome-messages.d';

const MODULE = 'service-worker';

// ── Global error safety net ───────────────────────────────────────────────────
installGlobalErrorHandler('service-worker');

// ── Message router ────────────────────────────────────────────────────────────
messageBus.onMessage(async (message: OutgoingMessage, sender): Promise<IncomingResponse> => {
  logger.debug(MODULE, 'onMessage', `Received message: ${message.type}`);

  switch (message.type) {
    case 'CAPTURE_REQUEST':
      return handleCaptureRequest(message.conversation, sender);

    case 'LIST_CAPTURES':
      return handleListCaptures();

    case 'GET_CAPTURE':
      return handleGetCapture(message.captureId);

    case 'DELETE_CAPTURE':
      return handleDeleteCapture(message.captureId);

    case 'INJECT_INTO_CHAT':
      return handleInjectIntoChat(message.captureId, sender);

    default: {
      const unhandled = message as { type: string };
      logger.warn(MODULE, 'onMessage', `Unhandled message type: ${unhandled.type}`);
      const ack: AckResponse = { type: 'ACK', success: false, error: `Unknown message type: ${unhandled.type}` };
      return ack;
    }
  }
});

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCaptureRequest(
  conversation: import('../core/models/conversation').NormalizedConversation,
  sender: chrome.runtime.MessageSender
): Promise<AckResponse> {
  const compressor = new Compressor();
  const compressResult = compressor.compress(conversation);
  if (!compressResult.ok) {
    return { type: 'ACK', success: false, error: compressResult.error.describe() };
  }

  const compressed = compressResult.value;
  const originalTokens = tokenEstimator.estimateConversation(conversation.turns);
  const compressedTokens = tokenEstimator.estimateConversation(compressed.turns);

  const id = `capture_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const mdResult = contextMdBuilder.build(compressed, {
    id,
    name: `${conversation.sourcePlatform} — ${new Date().toLocaleString()}`,
    originalTokenEstimate: originalTokens,
  });

  if (!mdResult.ok) {
    return { type: 'ACK', success: false, error: mdResult.error.describe() };
  }

  const extractedTurnCount = conversation.extractedTurnCount ?? conversation.turns.length;
  const parsedTurnCount = conversation.turns.length;
  const isPartial = extractedTurnCount > parsedTurnCount;

  const capture: import('../core/models/capture').Capture = {
    metadata: {
      id,
      name: `${conversation.sourcePlatform} — ${new Date().toLocaleString()}`,
      sourcePlatform: conversation.sourcePlatform,
      capturedAt: conversation.capturedAt,
      originalTokenEstimate: originalTokens,
      compressedTokenEstimate: compressedTokens,
      turnCount: parsedTurnCount,
      extractedTurnCount,
    },
    conversation,
    contextMarkdown: mdResult.value,
  };

  const saveResult = await captureRepository.save(capture);
  if (!saveResult.ok) {
    return { type: 'ACK', success: false, error: saveResult.error.describe() };
  }

  logger.info(MODULE, 'handleCaptureRequest', 'Capture saved successfully', {
    id,
    originalTokens,
    compressedTokens,
    parsedTurnCount,
    extractedTurnCount,
    isPartial,
    tabId: sender.tab?.id,
  });

  if (isPartial) {
    logger.warn(MODULE, 'handleCaptureRequest',
      `Partial capture: DOM had ${extractedTurnCount} elements but only ${parsedTurnCount} turns parsed — conversation may be incomplete`,
      { id, extractedTurnCount, parsedTurnCount }
    );
  }

  // Return a typed AckResponse — content-entry.ts will forward partialCapture fields to popup
  const ack: AckResponse & { partialCapture?: boolean; partialCaptureMessage?: string } = {
    type: 'ACK',
    success: true,
  };
  if (isPartial) {
    ack.partialCapture = true;
    ack.partialCaptureMessage = `Captured ${parsedTurnCount} of ${extractedTurnCount}+ turns — some older messages may be missing. Try scrolling to the top of the conversation and capturing again.`;
  }
  return ack;
}


async function handleListCaptures(): Promise<CaptureListResponse> {
  const result = await captureRepository.list();
  if (!result.ok) {
    logger.error(MODULE, 'handleListCaptures', result.error.describe());
    return { type: 'CAPTURE_LIST_RESPONSE', captures: [] };
  }
  return { type: 'CAPTURE_LIST_RESPONSE', captures: result.value };
}

async function handleGetCapture(captureId: string): Promise<CaptureResponse> {
  const result = await captureRepository.get(captureId);
  if (!result.ok) {
    logger.warn(MODULE, 'handleGetCapture', result.error.describe());
    return { type: 'CAPTURE_RESPONSE', capture: null };
  }
  return { type: 'CAPTURE_RESPONSE', capture: result.value };
}

async function handleDeleteCapture(captureId: string): Promise<AckResponse> {
  const result = await captureRepository.delete(captureId);
  if (!result.ok) {
    return { type: 'ACK', success: false, error: result.error.describe() };
  }
  return { type: 'ACK', success: true };
}

async function handleInjectIntoChat(
  captureId: string,
  sender: chrome.runtime.MessageSender
): Promise<AckResponse> {
  const captureResult = await captureRepository.get(captureId);
  if (!captureResult.ok) {
    return { type: 'ACK', success: false, error: captureResult.error.describe() };
  }

  // Get active tab to inject into
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return { type: 'ACK', success: false, error: 'No active tab found to inject into' };
  }

  const sendResult = await import('../shared/messaging/message-bus').then((m) =>
    m.messageBus.sendToTab(activeTab.id!, {
      type: 'INJECT_COMMAND',
      contextMarkdown: captureResult.value.contextMarkdown,
    } as import('../types/chrome-messages.d').InjectCommandMessage)
  );

  if (!sendResult.ok) {
    return { type: 'ACK', success: false, error: sendResult.error.describe() };
  }

  return { type: 'ACK', success: true };
}
