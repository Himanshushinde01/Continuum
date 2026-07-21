import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8');
  return new JSDOM(html).window.document;
}

describe('ChatGPTExtractor', () => {
  it('extracts 4 turns from the ChatGPT fixture', async () => {
    const doc = loadFixture('chatgpt-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://chatgpt.com/c/test' } });

    const { ChatGPTExtractor } = await import('../../../src/content-scripts/extractors/chatgpt-extractor');
    const result = await new ChatGPTExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sourcePlatform).toBe('chatgpt');
    // Fixture has 2 user + 2 assistant = 4 turns
    expect(result.value.turns).toHaveLength(4);
    expect(result.value.turns[0]?.role).toBe('user');
    expect(result.value.turns[1]?.role).toBe('assistant');
    expect(result.value.turns[2]?.role).toBe('user');
    expect(result.value.turns[3]?.role).toBe('assistant');
  });

  it('extracts code blocks from assistant turn', async () => {
    const doc = loadFixture('chatgpt-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://chatgpt.com/c/test' } });

    const { ChatGPTExtractor } = await import('../../../src/content-scripts/extractors/chatgpt-extractor');
    const result = await new ChatGPTExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assistantTurns = result.value.turns.filter((t) => t.role === 'assistant');
    expect(assistantTurns[0]?.codeBlocks.length).toBeGreaterThan(0);
    expect(assistantTurns[0]?.codeBlocks[0]?.language).toBe('python');
  });

  it('does NOT capture hidden UI chrome (Copy button text) in assistant content', async () => {
    const doc = loadFixture('chatgpt-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://chatgpt.com/c/test' } });

    const { ChatGPTExtractor } = await import('../../../src/content-scripts/extractors/chatgpt-extractor');
    const result = await new ChatGPTExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const turn of result.value.turns) {
      if (turn.role === 'assistant') {
        // The hidden "Copy" button lives in the role div wrapper outside .markdown.
        // If the extractor mistakenly uses role div's textContent, this leaks in.
        expect(turn.content).not.toContain('Copy');
        expect(turn.content).not.toContain('Regenerate');
      }
    }
  });

  it('returns ExtractionError when no turns found', async () => {
    const dom = new JSDOM('<html><body><main></main></body></html>');
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('window', { location: { href: 'https://chatgpt.com/c/test' } });

    const { ChatGPTExtractor } = await import('../../../src/content-scripts/extractors/chatgpt-extractor');
    const result = await new ChatGPTExtractor().extract();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toMatch(/EXTRACTION_/);
  });
});
