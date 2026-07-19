import type { NormalizedConversation, Turn, CodeBlock } from '../../../core/models/conversation';
import type { CompressionStrategy } from './strategy';
import { RECENT_TURNS_TO_KEEP } from '../../../shared/constants';

const MAX_CODE_LINES_TO_KEEP = 20;

/**
 * CodeBlockSummarizer — collapses long code blocks in older turns.
 * The most recent N turns are always left untouched (handled by RecentTurnsPreserver).
 * For older turns: if a code block is > MAX_CODE_LINES_TO_KEEP lines and not flagged
 * keepVerbatim, replace with a one-line summary comment.
 */
export class CodeBlockSummarizer implements CompressionStrategy {
  readonly name = 'code-block-summarizer';

  apply(conversation: NormalizedConversation): NormalizedConversation {
    const turns = conversation.turns;
    const recentStart = Math.max(0, turns.length - RECENT_TURNS_TO_KEEP);

    const processed = turns.map((turn, i) => {
      if (i >= recentStart) return turn; // preserve recent turns verbatim
      return this.processOlderTurn(turn);
    });

    return { ...conversation, turns: processed };
  }

  private processOlderTurn(turn: Turn): Turn {
    if (turn.codeBlocks.length === 0) return turn;

    const collapsedBlocks: CodeBlock[] = turn.codeBlocks.map((block) => {
      if (block.keepVerbatim) return block;
      const lineCount = block.content.split('\n').length;
      if (lineCount <= MAX_CODE_LINES_TO_KEEP) return block;

      return {
        ...block,
        content: `// [${block.language} code, ${lineCount} lines — collapsed during compression. Mark "keep" to preserve verbatim.]`,
      };
    });

    return { ...turn, codeBlocks: collapsedBlocks };
  }
}
