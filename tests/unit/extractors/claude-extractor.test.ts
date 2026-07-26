import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8');
  return new JSDOM(html).window.document;
}

describe('ClaudeExtractor', () => {
  it('extracts 4 turns from the short Claude fixture', async () => {
    const doc = loadFixture('claude-short-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const result = await new ClaudeExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sourcePlatform).toBe('claude');
    expect(result.value.turns).toHaveLength(4);
    expect(result.value.turns[0]?.role).toBe('user');
    expect(result.value.turns[1]?.role).toBe('assistant');
    expect(result.value.turns[2]?.role).toBe('user');
    expect(result.value.turns[3]?.role).toBe('assistant');
  });

  it('extracts code blocks from assistant turn', async () => {
    const doc = loadFixture('claude-short-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const result = await new ClaudeExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assistantTurn = result.value.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn!.codeBlocks.length).toBeGreaterThan(0);
    expect(assistantTurn!.codeBlocks[0]?.language).toBe('python');
  });

  it('does NOT include the sr-only "Claude responded:" prefix in assistant content', async () => {
    const doc = loadFixture('claude-short-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const result = await new ClaudeExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const turn of result.value.turns) {
      if (turn.role === 'assistant') {
        expect(turn.content).not.toMatch(/^Claude responded:/i);
        expect(turn.content).not.toContain('Claude responded:');
      }
    }
  });

  it('extracts all 12 turns from the long/scrolled fixture (completeness check)', async () => {
    const doc = loadFixture('claude-long-conversation-scrolled.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const result = await new ClaudeExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // All 12 turns must be extracted — no silent drops
    expect(result.value.turns).toHaveLength(12);
    // extractedTurnCount should be set and match (in JSDOM no virtualization happens)
    expect(result.value.extractedTurnCount).toBe(12);
  });

  it('extracts attachments from user turns and never merges filename into content', async () => {
    const doc = loadFixture('claude-with-attachment.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const result = await new ClaudeExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const userTurns = result.value.turns.filter((t) => t.role === 'user');
    const firstUserTurn = userTurns[0];
    expect(firstUserTurn).toBeDefined();

    // Attachment must be in the attachments array
    expect(firstUserTurn!.attachments).toContain('[Attached: E01-Hadoop Configuration.pdf]');

    // The raw filename and type badge must NOT appear in content text
    expect(firstUserTurn!.content).not.toContain('E01-Hadoop Configuration.pdf');
    expect(firstUserTurn!.content).not.toMatch(/E01-Hadoop.*PDF/);

    // Second user turn has a second attachment
    const secondUserTurn = userTurns[1];
    expect(secondUserTurn?.attachments).toContain('[Attached: E00-Big Data Lab Setup.pdf]');
  });

  it('returns ExtractionError when no turns found', async () => {
    const dom = new JSDOM('<html><body><main></main></body></html>');
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const result = await new ClaudeExtractor().extract();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toMatch(/EXTRACTION_/);
  });
});
