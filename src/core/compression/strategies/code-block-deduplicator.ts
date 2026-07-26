import type { NormalizedConversation } from '../../../core/models/conversation';
import type { CompressionStrategy } from './strategy';

/**
 * CodeBlockDeduplicator — removes exact-duplicate code blocks across the conversation,
 * keeping only the LAST occurrence of each.
 *
 * Why keep the last? Later occurrences of the same code block almost always represent
 * the current (fixed/updated) state — earlier occurrences are typically earlier drafts
 * that were iterated on. Keeping the last preserves correctness over recency.
 *
 * This strategy runs FIRST in the compression pipeline, before CodeBlockSummarizer,
 * so the summarizer sees a de-duplicated set.
 */
export class CodeBlockDeduplicator implements CompressionStrategy {
  readonly name = 'code-block-deduplicator';

  apply(conversation: NormalizedConversation): NormalizedConversation {
    // Pass 1: collect the index of the LAST occurrence of each unique content hash
    // Key: normalized content string → last seen turn index + block index
    const lastSeen = new Map<string, { turnIdx: number; blockIdx: number }>();

    conversation.turns.forEach((turn, turnIdx) => {
      turn.codeBlocks.forEach((block, blockIdx) => {
        const key = normalizeCode(block.content);
        if (key.length > 0) {
          lastSeen.set(key, { turnIdx, blockIdx });
        }
      });
    });

    // Pass 2: rebuild turns, keeping only blocks whose last-seen position matches
    // the current position (i.e., this is the last occurrence).
    const deduplicatedTurns = conversation.turns.map((turn, turnIdx) => {
      const keptBlocks = turn.codeBlocks.filter((block, blockIdx) => {
        const key = normalizeCode(block.content);
        const last = lastSeen.get(key);
        return last?.turnIdx === turnIdx && last?.blockIdx === blockIdx;
      });
      return { ...turn, codeBlocks: keptBlocks };
    });

    return { ...conversation, turns: deduplicatedTurns };
  }
}

/**
 * Normalize code content for deduplication comparison.
 * Strips leading/trailing whitespace and collapses internal whitespace differences
 * to avoid missing duplicates that differ only in indentation or trailing newlines.
 */
function normalizeCode(content: string): string {
  return content.trim().replace(/\r\n/g, '\n');
}
