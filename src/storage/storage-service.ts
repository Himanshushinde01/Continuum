import { logger } from '../shared/logger/logger';
import { StorageError } from '../shared/errors/error-types';
import { type Result, Ok, Err } from '../shared/errors/result';

const MODULE = 'storage-service';

/**
 * Thin wrapper around chrome.storage.local.
 * This is the ONLY place in the codebase that touches chrome.storage directly.
 * All other storage access must go through capture-repository.ts.
 */
export const storageService = {
  async get<T>(key: string): Promise<Result<T | null, StorageError>> {
    try {
      const result = await chrome.storage.local.get(key);
      const value = (result[key] as T | undefined) ?? null;
      return Ok(value);
    } catch (err) {
      const error = new StorageError({
        code: 'STORAGE_GET_FAILED',
        module: MODULE,
        fn: 'get',
        message: `Failed to read key "${key}" from chrome.storage.local`,
        context: { key },
        cause: err,
      });
      logger.error(MODULE, 'get', error.describe());
      return Err(error);
    }
  },

  async set<T>(key: string, value: T): Promise<Result<void, StorageError>> {
    try {
      await chrome.storage.local.set({ [key]: value });
      return Ok(undefined);
    } catch (err) {
      const error = new StorageError({
        code: 'STORAGE_SET_FAILED',
        module: MODULE,
        fn: 'set',
        message: `Failed to write key "${key}" to chrome.storage.local`,
        context: { key },
        cause: err,
      });
      logger.error(MODULE, 'set', error.describe());
      return Err(error);
    }
  },

  async remove(key: string): Promise<Result<void, StorageError>> {
    try {
      await chrome.storage.local.remove(key);
      return Ok(undefined);
    } catch (err) {
      const error = new StorageError({
        code: 'STORAGE_REMOVE_FAILED',
        module: MODULE,
        fn: 'remove',
        message: `Failed to remove key "${key}" from chrome.storage.local`,
        context: { key },
        cause: err,
      });
      logger.error(MODULE, 'remove', error.describe());
      return Err(error);
    }
  },

  async getBytesInUse(): Promise<Result<number, StorageError>> {
    try {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      return Ok(bytes);
    } catch (err) {
      const error = new StorageError({
        code: 'STORAGE_BYTES_CHECK_FAILED',
        module: MODULE,
        fn: 'getBytesInUse',
        message: 'Failed to query chrome.storage.local bytes in use',
        cause: err,
      });
      logger.error(MODULE, 'getBytesInUse', error.describe());
      return Err(error);
    }
  },
};
