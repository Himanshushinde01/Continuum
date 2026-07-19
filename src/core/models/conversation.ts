/**
 * Core data model for a normalized conversation.
 * This is the shared contract every extractor must output.
 * No platform-specific details live here.
 */

export type Role = 'user' | 'assistant';

export interface CodeBlock {
  language: string;
  content: string;
  /** User-flagged or auto-flagged as "most recent version of this file" — kept verbatim in compression. */
  keepVerbatim: boolean;
}

export interface Turn {
  role: Role;
  content: string;
  codeBlocks: CodeBlock[];
  timestamp?: string;
}

export interface NormalizedConversation {
  sourcePlatform: 'claude' | 'chatgpt' | 'gemini';
  turns: Turn[];
  /** ISO 8601 timestamp of when the capture was taken. */
  capturedAt: string;
}
