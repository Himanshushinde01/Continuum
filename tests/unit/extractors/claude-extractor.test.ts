import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load the HTML fixture
function loadFixture(name: string): Document {
  const html = readFileSync(
    resolve(__dirname, '../../fixtures', name),
    'utf-8'
  );
  const dom = new JSDOM(html);
  return dom.window.document;
}

describe('ClaudeExtractor', () => {
  it('extracts 4 turns from the Claude fixture', async () => {
    const doc = loadFixture('claude-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const extractor = new ClaudeExtractor();
    const result = await extractor.extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sourcePlatform).toBe('claude');
    // Fixture has 2 user turns + 2 assistant turns = 4
    expect(result.value.turns).toHaveLength(4);
    expect(result.value.turns[0]?.role).toBe('user');
    expect(result.value.turns[1]?.role).toBe('assistant');
    expect(result.value.turns[2]?.role).toBe('user');
    expect(result.value.turns[3]?.role).toBe('assistant');
  });

  it('extracts code blocks from assistant turn', async () => {
    const doc = loadFixture('claude-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const extractor = new ClaudeExtractor();
    const result = await extractor.extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assistantTurn = result.value.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn!.codeBlocks.length).toBeGreaterThan(0);
    expect(assistantTurn!.codeBlocks[0]?.language).toBe('python');
  });

  it('does NOT include the sr-only "Claude responded:" prefix in assistant content', async () => {
    const doc = loadFixture('claude-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const extractor = new ClaudeExtractor();
    const result = await extractor.extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const turn of result.value.turns) {
      if (turn.role === 'assistant') {
        // The sr-only <h2 data-find-omitted> prefixes with "Claude responded:"
        // If the extractor accidentally targets the wrapper instead of .font-claude-response,
        // this prefix would appear in the captured text.
        expect(turn.content).not.toMatch(/^Claude responded:/i);
        expect(turn.content).not.toContain('Claude responded:');
      }
    }
  });

  it('returns ExtractionError when no turns found', async () => {
    const dom = new JSDOM('<html><body><main></main></body></html>');
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('window', { location: { href: 'https://claude.ai/chat/test' } });

    const { ClaudeExtractor } = await import('../../../src/content-scripts/extractors/claude-extractor');
    const extractor = new ClaudeExtractor();
    const result = await extractor.extract();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toMatch(/EXTRACTION_/);
  });
});
