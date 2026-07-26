import type { NormalizedConversation, Turn } from '../models/conversation';
import type { Capture, CaptureMetadata } from '../models/capture';
import { tokenEstimator } from '../compression/token-estimator';
import { extractDecisions } from '../compression/strategies/decision-extractor';
import { extractProblemSolutions } from '../compression/strategies/problem-solution-extractor';
import { ValidationError } from '../../shared/errors/error-types';
import { type Result, Ok, Err } from '../../shared/errors/result';
import { RECENT_TURNS_TO_KEEP } from '../../shared/constants';
import { logger } from '../../shared/logger/logger';

const MODULE = 'context-md-builder';

/**
 * ContextMdBuilder — ONE job: Capture → context.md string, and reverse parse.
 * No DOM access, no side effects. Pure data transformation.
 *
 * Output section order:
 *   Frontmatter
 *   ## Goal
 *   ## Attachments           (new — lists [Attached: ...] placeholders)
 *   ## Key Decisions         (real decisions, not first-sentence positional heuristic)
 *   ## Current State
 *   ## Problems Encountered / Solutions Applied  (new — debugging fidelity)
 *   ## Code / Artifacts      (deduplicated)
 *   ## Recent Turns (verbatim)
 */
export const contextMdBuilder = {
  /**
   * Build context.md string from a compressed conversation.
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
    const allTurns = conversation.turns;

    const frontmatter = buildFrontmatter(conversation, metadata, compressedTokens);
    const goal = buildGoalSection(allTurns);
    const attachments = buildAttachmentsSection(allTurns);
    const keyDecisions = buildKeyDecisions(allTurns);
    const currentState = buildCurrentState(olderTurns);
    const problemsSolutions = buildProblemsAndSolutions(allTurns);
    const codeArtifacts = buildCodeArtifacts(allTurns);
    const recentTurnsSection = buildRecentTurns(recentTurns);

    const sections: (string | null)[] = [
      frontmatter,
      '## Goal',
      goal,
      attachments ? '## Attachments' : null,
      attachments || null,
      '## Key Decisions',
      keyDecisions,
      '## Current State',
      currentState,
      problemsSolutions ? '## Problems Encountered / Solutions Applied' : null,
      problemsSolutions || null,
      codeArtifacts.length > 0 ? '## Code / Artifacts' : null,
      codeArtifacts.length > 0 ? codeArtifacts : null,
      '## Recent Turns (verbatim)',
      recentTurnsSection,
    ];

    const md = sections.filter(Boolean).join('\n\n');

    logger.info(MODULE, 'build', 'Built context.md', {
      captureId: metadata.id,
      originalTokens: metadata.originalTokenEstimate,
      compressedTokens,
      compressionRatio: metadata.originalTokenEstimate > 0
        ? Math.round((1 - compressedTokens / metadata.originalTokenEstimate) * 100)
        : 0,
      hasAttachments: !!attachments,
      hasProblemsSolutions: !!problemsSolutions,
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
          } else if (key?.trim() === 'turn_count') {
            meta.turnCount = parseInt(value, 10);
          } else if (key?.trim() === 'extracted_turn_count') {
            meta.extractedTurnCount = parseInt(value, 10);
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
  const extractedCount = conversation.extractedTurnCount ?? conversation.turns.length;
  return `---
source_platform: ${conversation.sourcePlatform}
captured_at: ${conversation.capturedAt}
turn_count: ${conversation.turns.length}
extracted_turn_count: ${extractedCount}
original_tokens_est: ${metadata.originalTokenEstimate}
compressed_tokens_est: ${compressedTokens}
---`;
}

function buildGoalSection(turns: Turn[]): string {
  const firstUserTurn = turns.find((t) => t.role === 'user');
  if (!firstUserTurn) return '[No goal detected — add manually]';

  const sentences = firstUserTurn.content.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ');
}

/**
 * Collect all [Attached: ...] placeholders from every turn.
 * Returns null if no attachments found (section is omitted entirely).
 */
function buildAttachmentsSection(turns: Turn[]): string | null {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const turn of turns) {
    for (const attachment of turn.attachments) {
      // Normalize to just the filename portion for the list
      const display = attachment.replace(/^\[Attached:\s*/, '').replace(/\]$/, '').trim();
      if (display && !seen.has(display)) {
        seen.add(display);
        items.push(`- ${display}`);
      }
    }
  }

  return items.length > 0 ? items.join('\n') : null;
}

/**
 * Build key decisions using real pattern-matching, not positional heuristics.
 * Falls back to a placeholder if no decisions are found.
 */
function buildKeyDecisions(turns: Turn[]): string {
  const decisions = extractDecisions(turns);
  if (decisions.length === 0) return '- [No explicit decisions detected — review Recent Turns]';

  return decisions.map((d) => `- ${d}`).join('\n');
}

function buildCurrentState(olderTurns: Turn[]): string {
  const lastFewOlder = olderTurns.slice(-3);
  if (lastFewOlder.length === 0) return '[Context starts from recent turns below]';

  return lastFewOlder
    .map((t) => `**${t.role === 'user' ? 'User' : 'Assistant'}:** ${t.content}`)
    .join('\n\n');
}

/**
 * Build problems/solutions section from error-pattern scanning.
 * Returns null if no problems detected (section is omitted entirely).
 */
function buildProblemsAndSolutions(turns: Turn[]): string | null {
  const pairs = extractProblemSolutions(turns);
  if (pairs.length === 0) return null;

  return pairs
    .map((p) => `- **Problem:** ${p.problem} → **Solution:** ${p.solution}`)
    .join('\n');
}

function buildCodeArtifacts(turns: Turn[]): string {
  // Gather all code blocks, deduplicated content already handled by CodeBlockDeduplicator
  const blocks = turns.flatMap((t) =>
    t.codeBlocks.filter((b) => b.keepVerbatim || b.content.length > 0)
  );

  if (blocks.length === 0) return '';

  return blocks
    .slice(0, 5)
    .map((b) => `\`\`\`${b.language}\n${b.content}\n\`\`\``)
    .join('\n\n');
}

function buildRecentTurns(recentTurns: Turn[]): string {
  if (recentTurns.length === 0) return '[No recent turns]';

  return recentTurns
    .map((t) => {
      const roleLabel = t.role === 'user' ? 'User' : 'Assistant';
      const attachmentNote = t.attachments.length > 0
        ? `\n${t.attachments.join('\n')}`
        : '';
      return `**${roleLabel}:** ${t.content}${attachmentNote}`;
    })
    .join('\n\n');
}
