/**
 * App-wide constants. Importing from here ensures no magic strings are scattered.
 */
export const STORAGE_KEYS = {
  CAPTURES: 'context_bridge_captures',
} as const;

export const PLATFORMS = {
  CLAUDE: 'claude',
  CHATGPT: 'chatgpt',
  GEMINI: 'gemini',
} as const;

export type PlatformId = (typeof PLATFORMS)[keyof typeof PLATFORMS];

/** Number of most-recent turns to preserve verbatim during compression. */
export const RECENT_TURNS_TO_KEEP = 4;

/** Approximate chars-per-token ratio for estimation (GPT-style tokeniser heuristic). */
export const CHARS_PER_TOKEN = 4;

/** Max captures stored locally (oldest gets evicted). */
export const MAX_CAPTURES = 50;
