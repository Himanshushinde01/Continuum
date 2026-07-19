import type { NormalizedConversation } from './conversation';

/**
 * A Capture is what gets stored in chrome.storage.local.
 * It holds the original conversation, the compressed context.md,
 * and metadata for display in the popup UI.
 */
export interface CaptureMetadata {
  id: string;
  name: string;
  sourcePlatform: NormalizedConversation['sourcePlatform'];
  capturedAt: string;
  originalTokenEstimate: number;
  compressedTokenEstimate: number;
  turnCount: number;
}

export interface Capture {
  metadata: CaptureMetadata;
  /** The original extracted conversation (kept for re-compression if needed). */
  conversation: NormalizedConversation;
  /** The final context.md string ready to inject. */
  contextMarkdown: string;
}
