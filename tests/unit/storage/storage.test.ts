import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';

// Mock chrome.storage.local
function setupStorageMock(): {
  store: Record<string, unknown>;
  getMock: MockInstance;
  setMock: MockInstance;
  removeMock: MockInstance;
} {
  const store: Record<string, unknown> = {};

  const getMock = vi.fn(async (key: string) => ({ [key]: store[key] }));
  const setMock = vi.fn(async (data: Record<string, unknown>) => {
    Object.assign(store, data);
  });
  const removeMock = vi.fn(async (key: string) => {
    delete store[key];
  });
  const getBytesInUseMock = vi.fn(async () => 0);

  // @ts-expect-error mocking chrome
  globalThis.chrome = {
    storage: {
      local: {
        get: getMock,
        set: setMock,
        remove: removeMock,
        getBytesInUse: getBytesInUseMock,
      },
    },
  };

  return { store, getMock, setMock, removeMock };
}

describe('StorageService', () => {
  beforeEach(() => {
    vi.resetModules();
    setupStorageMock();
  });

  it('get returns null when key does not exist', async () => {
    const { storageService } = await import('../../../src/storage/storage-service');
    const result = await storageService.get('nonexistent');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('set and get round-trips correctly', async () => {
    const { storageService } = await import('../../../src/storage/storage-service');
    const data = { name: 'test', value: 42 };

    const setResult = await storageService.set('test_key', data);
    expect(setResult.ok).toBe(true);

    const getResult = await storageService.get<typeof data>('test_key');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) expect(getResult.value).toEqual(data);
  });

  it('returns StorageError when chrome.storage throws', async () => {
    // @ts-expect-error mocking
    globalThis.chrome.storage.local.get = vi.fn(async () => {
      throw new Error('QuotaExceeded');
    });
    const { storageService } = await import('../../../src/storage/storage-service');
    const result = await storageService.get('any');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('STORAGE_GET_FAILED');
      expect(result.error.module).toBe('storage-service');
    }
  });
});

describe('CaptureRepository', () => {
  beforeEach(() => {
    vi.resetModules();
    setupStorageMock();
  });

  function makeCapture(id: string): import('../../../src/core/models/capture').Capture {
    return {
      metadata: {
        id,
        name: `Test ${id}`,
        sourcePlatform: 'claude',
        capturedAt: '2026-07-18T00:00:00.000Z',
        originalTokenEstimate: 1000,
        compressedTokenEstimate: 200,
        turnCount: 5,
      },
      conversation: {
        sourcePlatform: 'claude',
        turns: [],
        capturedAt: '2026-07-18T00:00:00.000Z',
      },
      contextMarkdown: '## Goal\nTest context',
    };
  }

  it('save and list round-trips', async () => {
    const { captureRepository } = await import('../../../src/storage/capture-repository');
    const capture = makeCapture('test-001');

    const saveResult = await captureRepository.save(capture);
    expect(saveResult.ok).toBe(true);

    const listResult = await captureRepository.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.length).toBe(1);
      expect(listResult.value[0]!.metadata.id).toBe('test-001');
    }
  });

  it('get returns capture by id', async () => {
    const { captureRepository } = await import('../../../src/storage/capture-repository');
    const capture = makeCapture('test-002');
    await captureRepository.save(capture);

    const result = await captureRepository.get('test-002');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.metadata.id).toBe('test-002');
  });

  it('get returns StorageError for missing id', async () => {
    const { captureRepository } = await import('../../../src/storage/capture-repository');
    const result = await captureRepository.get('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STORAGE_CAPTURE_NOT_FOUND');
  });

  it('delete removes capture', async () => {
    const { captureRepository } = await import('../../../src/storage/capture-repository');
    const capture = makeCapture('test-003');
    await captureRepository.save(capture);

    const deleteResult = await captureRepository.delete('test-003');
    expect(deleteResult.ok).toBe(true);

    const listResult = await captureRepository.list();
    if (listResult.ok) expect(listResult.value.length).toBe(0);
  });

  it('save replaces existing capture with same id', async () => {
    const { captureRepository } = await import('../../../src/storage/capture-repository');
    const capture = makeCapture('test-004');
    await captureRepository.save(capture);

    const updated = { ...capture, contextMarkdown: '## Goal\nUpdated context' };
    await captureRepository.save(updated);

    const listResult = await captureRepository.list();
    if (listResult.ok) {
      expect(listResult.value.length).toBe(1);
      expect(listResult.value[0]!.contextMarkdown).toBe('## Goal\nUpdated context');
    }
  });
});
