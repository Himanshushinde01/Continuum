import type { NormalizedConversation, Turn } from '../../../core/models/conversation';
import type { CompressionStrategy } from './strategy';
import { RECENT_TURNS_TO_KEEP } from '../../../shared/constants';

const SENTENCES_TO_KEEP = 3;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/**
 * ExtractiveSummarizer — shortens older turns by keeping only key sentences.
 * Applies ONLY to turns outside the recent N turns window.
 * Uses extractive (not abstractive) summarization — no LLM required.
 *
 * Strategy: keep the first sentence (topic intro), last sentence (conclusion),
 * and the longest sentence in between (assumed to be the most information-dense).
 */
export class ExtractiveSummarizer implements CompressionStrategy {
  readonly name = 'extractive-summarizer';

  apply(conversation: NormalizedConversation): NormalizedConversation {
    const turns = conversation.turns;
    const recentStart = Math.max(0, turns.length - RECENT_TURNS_TO_KEEP);

    const processed = turns.map((turn, i) => {
      if (i >= recentStart) return turn;
      return this.summarizeTurn(turn);
    });

    return { ...conversation, turns: processed };
  }

  private summarizeTurn(turn: Turn): Turn {
    const sentences = turn.content.split(SENTENCE_SPLIT).filter((s) => s.trim().length > 0);
    if (sentences.length <= SENTENCES_TO_KEEP) return turn;

    const first = sentences[0]!;
    const last = sentences[sentences.length - 1]!;
    const middle = sentences.slice(1, -1);

    // Pick the longest middle sentence as most information-dense
    const keyMiddle = middle.reduce(
      (longest, s) => (s.length > longest.length ? s : longest),
      ''
    );

    const summarized = [first, keyMiddle, last].filter(Boolean).join(' ') +
      ` [+${sentences.length - SENTENCES_TO_KEEP} sentences compressed]`;

    return { ...turn, content: summarized };
  }
}
