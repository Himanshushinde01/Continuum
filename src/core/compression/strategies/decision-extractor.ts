import type { Turn } from '../../../core/models/conversation';

/**
 * Decision extractor — pure function (not a CompressionStrategy).
 * Called by context-md-builder.ts to populate the "## Key Decisions" section.
 *
 * Scans assistant turns for sentences containing real decision/action patterns,
 * rather than using the first sentence of each turn (which produces useless
 * generic outputs like "Absolutely." / "Done!").
 *
 * Pattern rationale: we look for verb phrases that describe a choice, change,
 * or fix that was actually made — not generic acknowledgements or questions.
 *
 * All logic is local, pattern-based — no LLM calls, no external services.
 */

const DECISION_PATTERNS: RegExp[] = [
  /\b(created|switched|fixed|replaced|used|chose|went with|changed to|instead of|rather than|moved to|migrated to|decided to|opted for|selected|adopted|implemented)\b/i,
  /\b(instead of|rather than|not.*but|switched.*from|changed.*from|replaced.*with|moved.*from|migrated.*from)\b/i,
  /\b(the (fix|solution|issue|problem|error|bug) (was|is|turned out))\b/i,
  /\b(this works because|the reason (is|was)|turns out)\b/i,
];

const EXCLUSION_PATTERNS: RegExp[] = [
  /^(okay|ok|sure|got it|understood|alright|absolutely|certainly|of course|done|great|perfect)[.!,]?\s*$/i,
  /^(yes|no)[.!]?\s*$/i,
  /\?$/, // questions are not decisions
];

const MAX_DECISIONS = 8;
const MIN_SENTENCE_LENGTH = 20;

/**
 * Extract real decision sentences from a list of turns.
 * Returns an array of human-readable decision strings (max MAX_DECISIONS).
 */
export function extractDecisions(turns: Turn[]): string[] {
  const decisions: string[] = [];

  for (const turn of turns) {
    if (turn.role !== 'assistant') continue;
    if (decisions.length >= MAX_DECISIONS) break;

    const sentences = splitSentences(turn.content);

    for (const sentence of sentences) {
      if (decisions.length >= MAX_DECISIONS) break;

      const trimmed = sentence.trim();
      if (trimmed.length < MIN_SENTENCE_LENGTH) continue;
      if (isExcluded(trimmed)) continue;
      if (isDecision(trimmed)) {
        decisions.push(trimmed);
      }
    }
  }

  return decisions;
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  // Handles common abbreviations imperfectly but good enough for v1
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
}

function isDecision(sentence: string): boolean {
  return DECISION_PATTERNS.some((p) => p.test(sentence));
}

function isExcluded(sentence: string): boolean {
  return EXCLUSION_PATTERNS.some((p) => p.test(sentence));
}
