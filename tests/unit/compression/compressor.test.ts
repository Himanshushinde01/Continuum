import { describe, it, expect } from 'vitest';
import { Compressor } from '../../../src/core/compression/compressor';
import { BoilerplateStripper } from '../../../src/core/compression/strategies/boilerplate-stripper';
import { ExtractiveSummarizer } from '../../../src/core/compression/strategies/extractive-summarizer';
import type { NormalizedConversation } from '../../../src/core/models/conversation';

function makeConversation(overrides: Partial<NormalizedConversation> = {}): NormalizedConversation {
  return {
    sourcePlatform: 'claude',
    capturedAt: '2026-07-18T00:00:00.000Z',
    turns: [],
    ...overrides,
  };
}

describe('BoilerplateStripper', () => {
  const stripper = new BoilerplateStripper();

  it('removes single-word acknowledgements', () => {
    const conv = makeConversation({
      turns: [
        { role: 'user', content: 'Can you help me?', codeBlocks: [] },
        { role: 'assistant', content: 'Sure!', codeBlocks: [] },
        { role: 'user', content: 'I need to implement binary search in Python.', codeBlocks: [] },
      ],
    });

    const result = stripper.apply(conv);
    expect(result.turns.length).toBe(2);
    expect(result.turns[0]!.content).toContain('Can you help me');
    expect(result.turns[1]!.content).toContain('binary search');
  });

  it('keeps substantive content', () => {
    const conv = makeConversation({
      turns: [
        { role: 'user', content: 'How does quicksort compare to mergesort for large datasets?', codeBlocks: [] },
        { role: 'assistant', content: 'Quicksort has O(n log n) average but O(n^2) worst case. Mergesort is stable and guarantees O(n log n).', codeBlocks: [] },
      ],
    });

    const result = stripper.apply(conv);
    expect(result.turns.length).toBe(2);
  });

  it('removes empty turns', () => {
    const conv = makeConversation({
      turns: [
        { role: 'user', content: '', codeBlocks: [] },
        { role: 'assistant', content: 'I can help you with sorting algorithms.', codeBlocks: [] },
      ],
    });
    const result = stripper.apply(conv);
    expect(result.turns.length).toBe(1);
  });
});

describe('ExtractiveSummarizer', () => {
  const summarizer = new ExtractiveSummarizer();

  it('shortens long older turns', () => {
    const longContent = 'First sentence here. This is a very important middle sentence with lots of content about the implementation details. Third sentence wraps up nicely. Fourth sentence adds more context. Fifth sentence concludes the thought completely.';

    const conv = makeConversation({
      turns: [
        { role: 'user', content: longContent, codeBlocks: [] },
        { role: 'assistant', content: 'Short reply.', codeBlocks: [] },
        { role: 'user', content: 'follow up', codeBlocks: [] },
        { role: 'assistant', content: 'another reply.', codeBlocks: [] },
        { role: 'user', content: 'more context needed here please.', codeBlocks: [] },
      ],
    });

    const result = summarizer.apply(conv);
    // First turn should be compressed (it's older than recent 4)
    const firstTurn = result.turns[0];
    expect(firstTurn!.content).toContain('[+');
    expect(firstTurn!.content.length).toBeLessThan(longContent.length);
  });

  it('preserves recent turns verbatim', () => {
    const content = 'Recent turn content that should not be changed at all in any way.';
    const conv = makeConversation({
      turns: [
        { role: 'user', content: 'old turn 1', codeBlocks: [] },
        { role: 'user', content: content, codeBlocks: [] }, // within recent 4
        { role: 'assistant', content: content, codeBlocks: [] },
        { role: 'user', content: content, codeBlocks: [] },
        { role: 'assistant', content: content, codeBlocks: [] },
      ],
    });

    const result = summarizer.apply(conv);
    // Last 4 turns (indices 1-4) should be untouched
    expect(result.turns[1]!.content).toBe(content);
    expect(result.turns[2]!.content).toBe(content);
  });
});

describe('Compressor (full pipeline)', () => {
  it('returns Ok for valid conversation', () => {
    const compressor = new Compressor();
    const conv = makeConversation({
      turns: [
        { role: 'user', content: 'Help me implement a hash map in Python.', codeBlocks: [] },
        { role: 'assistant', content: 'A hash map uses a hash function to map keys to indices.', codeBlocks: [] },
      ],
    });
    const result = compressor.compress(conv);
    expect(result.ok).toBe(true);
  });

  it('handles empty conversation gracefully', () => {
    const compressor = new Compressor();
    const conv = makeConversation({ turns: [] });
    const result = compressor.compress(conv);
    // Empty conversation should still return Ok (strategies handle it)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.turns.length).toBe(0);
    }
  });
});
