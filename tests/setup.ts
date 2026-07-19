// Vitest setup — mock chrome.storage and chrome.runtime for tests
import { vi } from 'vitest';

// Mock chrome API
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      getBytesInUse: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
  },
};

// @ts-expect-error — mocking chrome global for tests
globalThis.chrome = chromeMock;
