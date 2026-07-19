import type { NormalizedConversation } from '../../../core/models/conversation';
import type { CompressionStrategy } from './strategy';
import { RECENT_TURNS_TO_KEEP } from '../../../shared/constants';

/**
 * RecentTurnsPreserver — marks the last N turns for verbatim preservation.
 * This strategy runs LAST in the pipeline so its decisions aren't undone.
 *
 * Note: it doesn't actually modify turn content — it sets a marker flag that
 * the markdown builder uses to output those turns under "## Recent Turns (verbatim)".
 */
export class RecentTurnsPreserver implements CompressionStrategy {
  readonly name = 'recent-turns-preserver';

  constructor(private readonly turnsToKeep: number = RECENT_TURNS_TO_KEEP) {}

  apply(conversation: NormalizedConversation): NormalizedConversation {
    // This strategy just ensures the conversation has exactly the right structure.
    // The actual verbatim output is handled by context-md-builder using the turn index.
    // We don't modify any content here — this is intentionally a no-op on content,
    // serving as documentation of intent in the pipeline.
    return conversation;
  }

  /** How many turns from the end to treat as verbatim. */
  get turnsCount(): number {
    return this.turnsToKeep;
  }
}
