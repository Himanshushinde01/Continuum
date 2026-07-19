import type { NormalizedConversation, Turn } from '../models/conversation';
import type { Capture, CaptureMetadata } from '../models/capture';
import { tokenEstimator } from '../compression/token-estimator';
import { ValidationError } from '../../shared/errors/error-types';
import { type Result, Ok, Err } from '../../shared/errors/result';
import { RECENT_TURNS_TO_KEEP } from '../../shared/constants';
import { logger } from '../../shared/logger/logger';

const MODULE = 'context-md-builder';

/**
 * ContextMdBuilder — ONE job: Capture → context.md string, and reverse parse.
 * No DOM access, no side effects. Pure data transformation.
 */
export const contextMdBuilder = {
  /**
   * Build context.md string from a compressed conversation.
   * Output format matches the data model in PRD §9.
   */
  build(
    conversation: NormalizedConversation,
    metadata: Pick<CaptureMetadata, 'id' | 'name' | 'originalTokenEstimate'>
  ): Result<string, ValidationError> {
    if (conversation.turns.length === 0) {
      const error = new ValidationError({
        code: 'MARKDOWN_EMPTY_CONVERSATION',
        module: MODULE,
        fn: 'build',
        message: 'Cannot build context.md from a conversation with no turns',
        context: { captureId: metadata.id },
      });
      return Err(error);
    }

    const compressedTokens = tokenEstimator.estimateConversation(conversation.turns);
    const recentStart = Math.max(0, conversation.turns.length - RECENT_TURNS_TO_KEEP);
    const olderTurns = conversation.turns.slice(0, recentStart);
    const recentTurns = conversation.turns.slice(recentStart);

    const frontmatter = buildFrontmatter(conversation, metadata, compressedTokens);
    const goal = buildGoalSection(conversation.turns);
    const keyDecisions = buildKeyDecisions(olderTurns);
    const currentState = buildCurrentState(olderTurns);
    const codeArtifacts = buildCodeArtifacts(conversation.turns);
    const recentTurnsSection = buildRecentTurns(recentTurns);

    const md = [
      frontmatter,
      '## Goal',
      goal,
      '## Key Decisions',
      keyDecisions,
      '## Current State',
      currentState,
      codeArtifacts.length > 0 ? '## Code / Artifacts' : null,
      codeArtifacts.length > 0 ? codeArtifacts : null,
      '## Recent Turns (verbatim)',
      recentTurnsSection,
    ]
      .filter(Boolean)
      .join('\n\n');

    logger.info(MODULE, 'build', 'Built context.md', {
      captureId: metadata.id,
      originalTokens: metadata.originalTokenEstimate,
      compressedTokens,
      compressionRatio: metadata.originalTokenEstimate > 0
        ? Math.round((1 - compressedTokens / metadata.originalTokenEstimate) * 100)
        : 0,
    });

    return Ok(md);
  },

  /**
   * Parse a context.md string back into a partial Capture for display purposes.
   * Best-effort: returns null for fields it cannot extract.
   */
  parse(markdown: string): Result<Partial<Capture>, ValidationError> {
    try {
      const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
      const body = frontmatterMatch
        ? markdown.slice(frontmatterMatch[0].length).trim()
        : markdown;

      const meta: Partial<CaptureMetadata> = {};
      if (frontmatterMatch?.[1]) {
        const lines = frontmatterMatch[1].split('\n');
        for (const line of lines) {
          const [key, ...rest] = line.split(':');
          const value = rest.join(':').trim();
          if (key?.trim() === 'source_platform') {
            meta.sourcePlatform = value as CaptureMetadata['sourcePlatform'];
          } else if (key?.trim() === 'captured_at') {
            meta.capturedAt = value;
          } else if (key?.trim() === 'compressed_tokens_est') {
            meta.compressedTokenEstimate = parseInt(value, 10);
          } else if (key?.trim() === 'original_tokens_est') {
            meta.originalTokenEstimate = parseInt(value, 10);
          }
        }
      }

      return Ok({ metadata: meta as CaptureMetadata, contextMarkdown: body });
    } catch (err) {
      const error = new ValidationError({
        code: 'MARKDOWN_PARSE_FAILED',
        module: MODULE,
        fn: 'parse',
        message: 'Failed to parse context.md format',
        cause: err,
      });
      return Err(error);
    }
  },
};

// ── Section builders ──────────────────────────────────────────────────────────

function buildFrontmatter(
  conversation: NormalizedConversation,
  metadata: Pick<CaptureMetadata, 'id' | 'name' | 'originalTokenEstimate'>,
  compressedTokens: number
): string {
  return `---
source_platform: ${conversation.sourcePlatform}
captured_at: ${conversation.capturedAt}
turn_count: ${conversation.turns.length}
original_tokens_est: ${metadata.originalTokenEstimate}
compressed_tokens_est: ${compressedTokens}
---`;
}

function buildGoalSection(turns: Turn[]): string {
  // Extract goal from the first user turn (most likely to state the problem)
  const firstUserTurn = turns.find((t) => t.role === 'user');
  if (!firstUserTurn) return '[No goal detected — add manually]';

  const sentences = firstUserTurn.content.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ');
}

function buildKeyDecisions(olderTurns: Turn[]): string {
  // Heuristic: assistant turns in older conversation often contain decisions/answers
  const assistantTurns = olderTurns.filter((t) => t.role === 'assistant');
  if (assistantTurns.length === 0) return '- [No historical decisions captured]';

  return assistantTurns
    .slice(0, 5) // cap at 5 bullets
    .map((t) => {
      const firstSentence = t.content.split(/(?<=[.!?])\s+/)[0] ?? t.content;
      return `- ${firstSentence.trim()}`;
    })
    .join('\n');
}

function buildCurrentState(olderTurns: Turn[]): string {
  const lastFewOlder = olderTurns.slice(-3);
  if (lastFewOlder.length === 0) return '[Context starts from recent turns below]';

  return lastFewOlder
    .map((t) => `**${t.role === 'user' ? 'User' : 'Assistant'}:** ${t.content}`)
    .join('\n\n');
}

function buildCodeArtifacts(turns: Turn[]): string {
  const verbatimBlocks = turns.flatMap((t) =>
    t.codeBlocks.filter((b) => b.keepVerbatim || !b.content.startsWith('//'))
  );

  if (verbatimBlocks.length === 0) return '';

  return verbatimBlocks
    .slice(0, 5) // cap at 5 code blocks
    .map((b) => `\`\`\`${b.language}\n${b.content}\n\`\`\``)
    .join('\n\n');
}

function buildRecentTurns(recentTurns: Turn[]): string {
  if (recentTurns.length === 0) return '[No recent turns]';

  return recentTurns
    .map((t) => `**${t.role === 'user' ? 'User' : 'Assistant'}:** ${t.content}`)
    .join('\n\n');
}
