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
  /**
   * File attachments detected in this turn, stored as clean human-readable placeholders.
   * e.g. ["[Attached: E01-Hadoop Configuration.pdf]", "[Attached: diagram.png]"]
   * NEVER merged into `content` — kept separate so they can be listed in the Attachments section.
   */
  attachments: string[];
  timestamp?: string;
}

export interface NormalizedConversation {
  sourcePlatform: 'claude' | 'chatgpt' | 'gemini';
  turns: Turn[];
  /** ISO 8601 timestamp of when the capture was taken. */
  capturedAt: string;
  /**
   * Raw DOM element count BEFORE parseTurn() filtering.
   * Used for completeness check: if extractedTurnCount > turns.length, some turns were dropped
   * (possibly due to virtualization — user should be warned).
   * Set by base-extractor after scrolling and querying the DOM.
   */
  extractedTurnCount?: number;
}
