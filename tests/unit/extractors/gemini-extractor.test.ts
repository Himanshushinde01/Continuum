import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8');
  return new JSDOM(html).window.document;
}

describe('GeminiExtractor', () => {
  it('extracts 4 turns from the Gemini fixture', async () => {
    const doc = loadFixture('gemini-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://gemini.google.com/app/test' } });

    const { GeminiExtractor } = await import('../../../src/content-scripts/extractors/gemini-extractor');
    const result = await new GeminiExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sourcePlatform).toBe('gemini');
    // Fixture has 2 user-query + 2 model-response = 4 turns
    expect(result.value.turns).toHaveLength(4);
    expect(result.value.turns[0]?.role).toBe('user');
    expect(result.value.turns[1]?.role).toBe('assistant');
    expect(result.value.turns[2]?.role).toBe('user');
    expect(result.value.turns[3]?.role).toBe('assistant');
  });

  it('extracts code blocks from assistant turn', async () => {
    const doc = loadFixture('gemini-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://gemini.google.com/app/test' } });

    const { GeminiExtractor } = await import('../../../src/content-scripts/extractors/gemini-extractor');
    const result = await new GeminiExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assistantTurns = result.value.turns.filter((t) => t.role === 'assistant');
    // Second assistant turn has a code block
    const withCode = assistantTurns.find((t) => t.codeBlocks.length > 0);
    expect(withCode).toBeDefined();
    expect(withCode!.codeBlocks[0]?.language).toBe('python');
  });

  it('does NOT capture response-container chrome (Regenerate/Copy buttons) in assistant content', async () => {
    const doc = loadFixture('gemini-conversation.html');
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { location: { href: 'https://gemini.google.com/app/test' } });

    const { GeminiExtractor } = await import('../../../src/content-scripts/extractors/gemini-extractor');
    const result = await new GeminiExtractor().extract();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const turn of result.value.turns) {
      if (turn.role === 'assistant') {
        // response-container includes action buttons; if the extractor accidentally
        // uses response-container.textContent instead of message-content, these appear.
        expect(turn.content).not.toContain('Regenerate');
        expect(turn.content).not.toContain('Thumbs up');
        expect(turn.content).not.toContain('Copy');
      }
    }
  });

  it('returns ExtractionError when no turns found', async () => {
    const dom = new JSDOM('<html><body><main></main></body></html>');
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('window', { location: { href: 'https://gemini.google.com/app/test' } });

    const { GeminiExtractor } = await import('../../../src/content-scripts/extractors/gemini-extractor');
    const result = await new GeminiExtractor().extract();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toMatch(/EXTRACTION_/);
  });
});
