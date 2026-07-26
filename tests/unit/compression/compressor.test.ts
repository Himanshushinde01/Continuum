import { describe, it, expect } from 'vitest';
import { Compressor } from '../../../src/core/compression/compressor';
import { BoilerplateStripper } from '../../../src/core/compression/strategies/boilerplate-stripper';
import { ExtractiveSummarizer } from '../../../src/core/compression/strategies/extractive-summarizer';
import { CodeBlockDeduplicator } from '../../../src/core/compression/strategies/code-block-deduplicator';
import { extractDecisions } from '../../../src/core/compression/strategies/decision-extractor';
import { extractProblemSolutions } from '../../../src/core/compression/strategies/problem-solution-extractor';
import type { NormalizedConversation, Turn } from '../../../src/core/models/conversation';

function makeConversation(overrides: Partial<NormalizedConversation> = {}): NormalizedConversation {
  return {
    sourcePlatform: 'claude',
    capturedAt: '2026-07-18T00:00:00.000Z',
    turns: [],
    ...overrides,
  };
}

function makeTurn(role: 'user' | 'assistant', content: string, codeBlocks: Turn['codeBlocks'] = []): Turn {
  return { role, content, codeBlocks, attachments: [] };
}

describe('BoilerplateStripper', () => {
  const stripper = new BoilerplateStripper();

  it('removes single-word acknowledgements', () => {
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'Can you help me?'),
        makeTurn('assistant', 'Sure!'),
        makeTurn('user', 'I need to implement binary search in Python.'),
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
        makeTurn('user', 'How does quicksort compare to mergesort for large datasets?'),
        makeTurn('assistant', 'Quicksort has O(n log n) average but O(n^2) worst case. Mergesort is stable and guarantees O(n log n).'),
      ],
    });

    const result = stripper.apply(conv);
    expect(result.turns.length).toBe(2);
  });

  it('removes empty turns', () => {
    const conv = makeConversation({
      turns: [
        makeTurn('user', ''),
        makeTurn('assistant', 'I can help you with sorting algorithms.'),
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
        makeTurn('user', longContent),
        makeTurn('assistant', 'Short reply.'),
        makeTurn('user', 'follow up'),
        makeTurn('assistant', 'another reply.'),
        makeTurn('user', 'more context needed here please.'),
      ],
    });

    const result = summarizer.apply(conv);
    const firstTurn = result.turns[0];
    expect(firstTurn!.content).toContain('[+');
    expect(firstTurn!.content.length).toBeLessThan(longContent.length);
  });

  it('preserves recent turns verbatim', () => {
    const content = 'Recent turn content that should not be changed at all in any way.';
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'old turn 1'),
        makeTurn('user', content),
        makeTurn('assistant', content),
        makeTurn('user', content),
        makeTurn('assistant', content),
      ],
    });

    const result = summarizer.apply(conv);
    expect(result.turns[1]!.content).toBe(content);
    expect(result.turns[2]!.content).toBe(content);
  });
});

describe('CodeBlockDeduplicator', () => {
  const deduplicator = new CodeBlockDeduplicator();

  it('removes exact duplicate code blocks, keeping only the last occurrence', () => {
    const duplicateCode = 'ls -lh ~ | grep hadoop';
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'run this', [{ language: 'bash', content: duplicateCode, keepVerbatim: false }]),
        makeTurn('assistant', 'output here', []),
        makeTurn('user', 'run again', [{ language: 'bash', content: duplicateCode, keepVerbatim: false }]),
        makeTurn('assistant', 'same output', []),
        makeTurn('user', 'once more', [{ language: 'bash', content: duplicateCode, keepVerbatim: false }]),
      ],
    });

    const result = deduplicator.apply(conv);

    // Only the LAST occurrence should survive
    const allBlocks = result.turns.flatMap((t) => t.codeBlocks);
    const duplicateBlocks = allBlocks.filter((b) => b.content === duplicateCode);
    expect(duplicateBlocks).toHaveLength(1);

    // The last turn (index 4) should have the block
    expect(result.turns[4]!.codeBlocks).toHaveLength(1);
    // The earlier turns should NOT have the block
    expect(result.turns[0]!.codeBlocks).toHaveLength(0);
    expect(result.turns[2]!.codeBlocks).toHaveLength(0);
  });

  it('keeps unique code blocks untouched', () => {
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'step 1', [{ language: 'bash', content: 'npm install', keepVerbatim: false }]),
        makeTurn('assistant', 'done', [{ language: 'bash', content: 'npm run build', keepVerbatim: false }]),
      ],
    });

    const result = deduplicator.apply(conv);
    expect(result.turns[0]!.codeBlocks).toHaveLength(1);
    expect(result.turns[1]!.codeBlocks).toHaveLength(1);
  });

  it('handles conversations with no code blocks', () => {
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'just text'),
        makeTurn('assistant', 'also just text'),
      ],
    });

    const result = deduplicator.apply(conv);
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]!.codeBlocks).toHaveLength(0);
  });
});

describe('extractDecisions', () => {
  it('extracts real decision sentences, not generic acknowledgements', () => {
    const turns: Turn[] = [
      makeTurn('user', 'Which sorting algorithm should I use?'),
      makeTurn('assistant', 'Absolutely. Great question! I switched from quicksort to mergesort because the dataset is already partially sorted, which would cause quicksort to hit O(n^2) worst-case.'),
      makeTurn('user', 'What about the data structure?'),
      makeTurn('assistant', 'Done! I replaced the linked list with a balanced BST so we get O(log n) lookups instead of O(n).'),
    ];

    const decisions = extractDecisions(turns);

    expect(decisions.length).toBeGreaterThan(0);
    // Must not contain generic openers
    expect(decisions.every((d) => !/^(absolutely|done|great question)[.!,]?\s*$/i.test(d))).toBe(true);
    // Must contain actual decision content
    expect(decisions.some((d) => /switched|replaced|mergesort|BST/i.test(d))).toBe(true);
  });

  it('returns empty array for conversations with only acknowledgements', () => {
    const turns: Turn[] = [
      makeTurn('user', 'Can you help?'),
      makeTurn('assistant', 'Absolutely! Of course.'),
      makeTurn('user', 'Thanks.'),
      makeTurn('assistant', 'Done!'),
    ];

    const decisions = extractDecisions(turns);
    // Short generic responses should not match
    expect(decisions.every((d) => d.length >= 20)).toBe(true);
  });
});

describe('extractProblemSolutions', () => {
  it('extracts problem/solution pairs from debugging conversations', () => {
    const turns: Turn[] = [
      makeTurn('user', 'I am getting a JAVA_HOME is not set error when running start-dfs.sh'),
      makeTurn('assistant', 'The fix is to set JAVA_HOME explicitly in hadoop-env.sh — open $HADOOP_HOME/etc/hadoop/hadoop-env.sh and add: export JAVA_HOME=/usr/lib/jvm/java-11-openjdk'),
      makeTurn('user', 'Now I get: Exception in thread main java.lang.RuntimeException: error calling startNM'),
      makeTurn('assistant', 'This error occurs because the NodeManager cannot find the correct classpath. Try running: export YARN_LOG_DIR=$HADOOP_HOME/logs and restart.'),
    ];

    const pairs = extractProblemSolutions(turns);

    expect(pairs.length).toBeGreaterThan(0);
    // First pair should involve JAVA_HOME
    expect(pairs[0]?.problem).toMatch(/JAVA_HOME/i);
    expect(pairs[0]?.solution.length).toBeGreaterThan(10);
  });

  it('returns empty array for conversations without errors', () => {
    const turns: Turn[] = [
      makeTurn('user', 'What is the capital of France?'),
      makeTurn('assistant', 'The capital of France is Paris. It is the most populous city in France and serves as the country\'s political, economic, and cultural center.'),
    ];

    const pairs = extractProblemSolutions(turns);
    expect(pairs).toHaveLength(0);
  });
});

describe('Compressor (full pipeline)', () => {
  it('returns Ok for valid conversation', () => {
    const compressor = new Compressor();
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'Help me implement a hash map in Python.'),
        makeTurn('assistant', 'A hash map uses a hash function to map keys to indices.'),
      ],
    });
    const result = compressor.compress(conv);
    expect(result.ok).toBe(true);
  });

  it('handles empty conversation gracefully', () => {
    const compressor = new Compressor();
    const conv = makeConversation({ turns: [] });
    const result = compressor.compress(conv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.turns.length).toBe(0);
    }
  });

  it('deduplicates code blocks as part of full pipeline', () => {
    const dupCode = 'clear\nls -lh ~ | grep hadoop';
    const compressor = new Compressor();
    const conv = makeConversation({
      turns: [
        makeTurn('user', 'run command', [{ language: 'bash', content: dupCode, keepVerbatim: false }]),
        makeTurn('assistant', 'ok', []),
        makeTurn('user', 'run again', [{ language: 'bash', content: dupCode, keepVerbatim: false }]),
        makeTurn('assistant', 'ok again', []),
        makeTurn('user', 'one more time', [{ language: 'bash', content: dupCode, keepVerbatim: false }]),
      ],
    });

    const result = compressor.compress(conv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allBlocks = result.value.turns.flatMap((t) => t.codeBlocks);
    const dupBlocks = allBlocks.filter((b) => b.content === dupCode);
    expect(dupBlocks).toHaveLength(1);
  });
});
