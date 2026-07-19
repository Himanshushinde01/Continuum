import { CHARS_PER_TOKEN } from '../../shared/constants';

/**
 * TokenEstimator — ONE job: estimate the token count of a string.
 * Uses the chars-per-token heuristic (GPT-4 style, ~4 chars/token on average).
 * This is an approximation, not an exact count. It's shown to the user as "~N tokens."
 */
export const tokenEstimator = {
  estimate(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  },

  estimateConversation(turns: { content: string; codeBlocks: { content: string }[] }[]): number {
    let total = 0;
    for (const turn of turns) {
      total += this.estimate(turn.content);
      for (const block of turn.codeBlocks) {
        total += this.estimate(block.content);
      }
    }
    return total;
  },
};
