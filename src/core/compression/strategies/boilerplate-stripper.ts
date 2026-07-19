import type { NormalizedConversation, Turn } from '../../../core/models/conversation';
import type { CompressionStrategy } from './strategy';

/** Phrases that indicate boilerplate/UI noise, not real conversation content. */
const BOILERPLATE_PATTERNS: RegExp[] = [
  /^(okay|ok|sure|got it|understood|alright)[.!,]?\s*$/i,
  /^regenerat(e|ing|ed) response\.?\s*$/i,
  /^(stop|pause|continue|try again)\.?\s*$/i,
  /^copy(ing)? to clipboard\.?\s*$/i,
  /^(thumbs up|thumbs down|like|dislike)\.?\s*$/i,
  /^(edit|retry|delete) (message|response)\.?\s*$/i,
  /^\s*\[.*?\]\s*$/,             // e.g. "[Regenerating...]"
  /^(rate this response|was this helpful\?|share feedback)/i,
];

const MIN_CONTENT_LENGTH = 10;

/**
 * BoilerplateStripper — removes empty turns, UI chrome, retry messages, and
 * content-free acknowledgements that don't contribute to the context.
 */
export class BoilerplateStripper implements CompressionStrategy {
  readonly name = 'boilerplate-stripper';

  apply(conversation: NormalizedConversation): NormalizedConversation {
    const filtered = conversation.turns.filter((turn) => this.isSubstantive(turn));
    return { ...conversation, turns: filtered };
  }

  private isSubstantive(turn: Turn): boolean {
    const content = turn.content.trim();
    if (content.length < MIN_CONTENT_LENGTH) return false;
    return !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(content));
  }
}
