import type { NormalizedConversation } from '../../../core/models/conversation';

/**
 * CompressionStrategy — shared interface for all compression strategies.
 * Each strategy takes a conversation and returns a (possibly modified) conversation.
 * Strategies must be pure: no side effects, no I/O.
 */
export interface CompressionStrategy {
  readonly name: string;
  apply(conversation: NormalizedConversation): NormalizedConversation;
}
