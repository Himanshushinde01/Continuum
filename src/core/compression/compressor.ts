import type { NormalizedConversation } from '../../core/models/conversation';
import type { CompressionStrategy } from './strategies/strategy';
import { CodeBlockDeduplicator } from './strategies/code-block-deduplicator';
import { BoilerplateStripper } from './strategies/boilerplate-stripper';
import { CodeBlockSummarizer } from './strategies/code-block-summarizer';
import { ExtractiveSummarizer } from './strategies/extractive-summarizer';
import { RecentTurnsPreserver } from './strategies/recent-turns-preserver';
import { CompressionError } from '../../shared/errors/error-types';
import { type Result, Ok, Err } from '../../shared/errors/result';
import { logger } from '../../shared/logger/logger';

const MODULE = 'compressor';

/**
 * Compressor — orchestrates the compression pipeline.
 * ONE job: run strategies in order and return the compressed conversation.
 *
 * Default pipeline order (matters):
 *  1. CodeBlockDeduplicator — remove exact-duplicate code blocks (keeps last occurrence)
 *  2. BoilerplateStripper   — remove empty turns, UI chrome, vacuous acknowledgements
 *  3. CodeBlockSummarizer   — summarize/trim oversized code blocks
 *  4. ExtractiveSummarizer  — trim older turns' prose
 *  5. RecentTurnsPreserver  — mark recent turns as verbatim
 */
export class Compressor {
  private readonly strategies: CompressionStrategy[];

  constructor(strategies?: CompressionStrategy[]) {
    this.strategies = strategies ?? [
      new CodeBlockDeduplicator(),
      new BoilerplateStripper(),
      new CodeBlockSummarizer(),
      new ExtractiveSummarizer(),
      new RecentTurnsPreserver(),
    ];
  }

  compress(
    conversation: NormalizedConversation
  ): Result<NormalizedConversation, CompressionError> {
    let current = conversation;

    for (const strategy of this.strategies) {
      try {
        current = strategy.apply(current);
        logger.debug(MODULE, 'compress', `Applied strategy: ${strategy.name}`, {
          turnsBefore: conversation.turns.length,
          turnsAfter: current.turns.length,
        });
      } catch (err) {
        const error = new CompressionError({
          code: 'COMPRESSION_STRATEGY_FAILED',
          module: MODULE,
          fn: 'compress',
          message: `Strategy "${strategy.name}" threw unexpectedly`,
          context: { strategyName: strategy.name },
          cause: err,
        });
        logger.error(MODULE, 'compress', error.describe());
        return Err(error);
      }
    }

    logger.info(MODULE, 'compress', 'Compression pipeline complete', {
      originalTurns: conversation.turns.length,
      compressedTurns: current.turns.length,
    });

    return Ok(current);
  }
}
