import type { NormalizedConversation } from '../core/models/conversation';
import type { Capture } from '../core/models/capture';

/**
 * Discriminated union of EVERY message type passed via chrome.runtime.sendMessage.
 * No raw sendMessage calls anywhere — all go through message-bus.ts using these types.
 */

// ── Content Script → Background ──────────────────────────────────────────────

export interface CaptureRequestMessage {
  type: 'CAPTURE_REQUEST';
  conversation: NormalizedConversation;
}

export interface InjectRequestMessage {
  type: 'INJECT_REQUEST';
  captureId: string;
  platform: 'claude' | 'chatgpt' | 'gemini';
}

// ── Popup → Content Script (via chrome.tabs.sendMessage) ──────────────────────

export interface TriggerCaptureMessage {
  type: 'TRIGGER_CAPTURE';
}

// ── Content Script → Popup (direct response to TRIGGER_CAPTURE) ───────────────

export interface CaptureAckMessage {
  type: 'CAPTURE_ACK';
  success: boolean;
  error?: string;
}

// ── Background → Content Script ───────────────────────────────────────────────

export interface InjectCommandMessage {
  type: 'INJECT_COMMAND';
  contextMarkdown: string;
}

// ── Popup → Background ────────────────────────────────────────────────────────

export interface ListCapturesMessage {
  type: 'LIST_CAPTURES';
}

export interface DeleteCaptureMessage {
  type: 'DELETE_CAPTURE';
  captureId: string;
}

export interface GetCaptureMessage {
  type: 'GET_CAPTURE';
  captureId: string;
}

export interface InjectIntoChatMessage {
  type: 'INJECT_INTO_CHAT';
  captureId: string;
}

// ── Background → Popup (responses) ───────────────────────────────────────────

export interface CaptureListResponse {
  type: 'CAPTURE_LIST_RESPONSE';
  captures: Capture[];
}

export interface CaptureResponse {
  type: 'CAPTURE_RESPONSE';
  capture: Capture | null;
}

export interface AckResponse {
  type: 'ACK';
  success: boolean;
  error?: string;
}

// ── Union types ───────────────────────────────────────────────────────────────

export type OutgoingMessage =
  | CaptureRequestMessage
  | InjectRequestMessage
  | TriggerCaptureMessage
  | ListCapturesMessage
  | DeleteCaptureMessage
  | GetCaptureMessage
  | InjectIntoChatMessage;

export type IncomingResponse =
  | CaptureListResponse
  | CaptureResponse
  | AckResponse
  | CaptureAckMessage
  | InjectCommandMessage;

export type AnyMessage = OutgoingMessage | IncomingResponse;
