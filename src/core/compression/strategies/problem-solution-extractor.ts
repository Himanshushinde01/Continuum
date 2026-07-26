import type { Turn } from '../../../core/models/conversation';

/**
 * Problem-solution extractor — pure function (not a CompressionStrategy).
 * Called by context-md-builder.ts to populate the
 * "## Problems Encountered / Solutions Applied" section.
 *
 * Algorithm:
 * 1. Scan turns for "problem indicators" — error keywords, stack traces,
 *    repeated similar commands (suggesting retries), failure language.
 * 2. Pair each problem turn with the immediately-following assistant turn,
 *    extracting the most likely "fix" sentence from that turn.
 * 3. Return an array of {problem, solution} pairs for the MD builder.
 *
 * This is entirely local, pattern-based — no LLM calls.
 *
 * Why this matters: in manual testing, a full debugging sequence
 * (XML errors, JAVA_HOME fixes, format failures) vanished with no trace —
 * measured at ~40-50% fidelity recovery. This section is designed to be
 * the hardest-surviving content in compression.
 */

export interface ProblemSolutionPair {
  problem: string;
  solution: string;
}

// Patterns that indicate a problem/error in a turn's content
const PROBLEM_PATTERNS: RegExp[] = [
  /\b(error|exception|traceback|stack trace|failed|failure|cannot|can't|could not|not found|undefined|null pointer|NullPointerException|ClassNotFoundException|NoSuchMethod)\b/i,
  /\b(JAVA_HOME|permission denied|access denied|connection refused|timeout|timed out)\b/i,
  /\b(syntax error|parse error|invalid|malformed|unexpected token|missing)\b/i,
  /^\s*at\s+[\w.$]+\(.*:\d+\)/m, // stack trace line: "   at ClassName.method(File.java:42)"
  /\b(it (still|keeps|continues)|same (error|issue|problem)|didn't (work|fix)|still (not|failing))\b/i,
];

// Patterns that indicate a fix/solution in a following assistant turn
const SOLUTION_PATTERNS: RegExp[] = [
  /\b(fixed|solved|resolved|the (issue|problem|error) (was|is)|the (fix|solution) (is|was))\b/i,
  /\b(you need to|try|add|remove|change|update|replace|set|export|install|configure)\b/i,
  /\b(this (happens|occurs) because|the reason is|it (failed|broke) because)\b/i,
];

const MAX_PROBLEM_PAIRS = 8;
const PROBLEM_SNIPPET_LENGTH = 120;
const SOLUTION_SNIPPET_LENGTH = 150;

/**
 * Extract problem/solution pairs from a conversation's turns.
 */
export function extractProblemSolutions(turns: Turn[]): ProblemSolutionPair[] {
  const pairs: ProblemSolutionPair[] = [];

  for (let i = 0; i < turns.length && pairs.length < MAX_PROBLEM_PAIRS; i++) {
    const turn = turns[i];
    if (!turn) continue;

    if (!isProblemTurn(turn)) continue;

    // Find the next assistant turn as the likely solution
    const solutionTurn = findNextAssistantTurn(turns, i + 1);
    const problem = extractProblemSnippet(turn);
    const solution = solutionTurn
      ? extractSolutionSnippet(solutionTurn)
      : 'See context for resolution';

    if (problem.length > 0) {
      pairs.push({ problem, solution });
    }
  }

  return pairs;
}

function isProblemTurn(turn: Turn): boolean {
  return PROBLEM_PATTERNS.some((p) => p.test(turn.content));
}

function findNextAssistantTurn(turns: Turn[], startIdx: number): Turn | null {
  for (let i = startIdx; i < Math.min(startIdx + 3, turns.length); i++) {
    const t = turns[i];
    if (t && t.role === 'assistant') return t;
  }
  return null;
}

function extractProblemSnippet(turn: Turn): string {
  const content = turn.content.trim();

  // Prefer the sentence that contains the problem indicator
  const sentences = content.split(/(?<=[.!?\n])\s+/);
  for (const sentence of sentences) {
    if (PROBLEM_PATTERNS.some((p) => p.test(sentence))) {
      return sentence.trim().slice(0, PROBLEM_SNIPPET_LENGTH);
    }
  }

  // Fallback: first N chars
  return content.slice(0, PROBLEM_SNIPPET_LENGTH);
}

function extractSolutionSnippet(turn: Turn): string {
  const content = turn.content.trim();

  // Prefer a sentence that contains a known solution indicator
  const sentences = content.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (SOLUTION_PATTERNS.some((p) => p.test(sentence))) {
      return sentence.trim().slice(0, SOLUTION_SNIPPET_LENGTH);
    }
  }

  // Fallback: first non-trivial sentence
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 20) {
      return trimmed.slice(0, SOLUTION_SNIPPET_LENGTH);
    }
  }

  return content.slice(0, SOLUTION_SNIPPET_LENGTH);
}
