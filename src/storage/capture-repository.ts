import type { Capture } from '../core/models/capture';
import { storageService } from './storage-service';
import { logger } from '../shared/logger/logger';
import { StorageError } from '../shared/errors/error-types';
import { type Result, Ok, Err } from '../shared/errors/result';
import { STORAGE_KEYS, MAX_CAPTURES } from '../shared/constants';

const MODULE = 'capture-repository';

/**
 * Business-level storage API for Capture objects.
 * All CRUD operations are here; nothing else should talk to storageService directly.
 */
export interface CaptureRepository {
  save(capture: Capture): Promise<Result<void, StorageError>>;
  list(): Promise<Result<Capture[], StorageError>>;
  get(id: string): Promise<Result<Capture, StorageError>>;
  delete(id: string): Promise<Result<void, StorageError>>;
}

async function loadAll(): Promise<Result<Capture[], StorageError>> {
  const result = await storageService.get<Capture[]>(STORAGE_KEYS.CAPTURES);
  if (!result.ok) return result;
  return Ok(result.value ?? []);
}

async function saveAll(captures: Capture[]): Promise<Result<void, StorageError>> {
  return storageService.set(STORAGE_KEYS.CAPTURES, captures);
}

export const captureRepository: CaptureRepository = {
  async save(capture: Capture): Promise<Result<void, StorageError>> {
    const loadResult = await loadAll();
    if (!loadResult.ok) return loadResult;

    let captures = loadResult.value;

    // Replace if exists, otherwise prepend
    const existingIndex = captures.findIndex((c) => c.metadata.id === capture.metadata.id);
    if (existingIndex >= 0) {
      captures[existingIndex] = capture;
    } else {
      captures = [capture, ...captures];
    }

    // Evict oldest if over limit
    if (captures.length > MAX_CAPTURES) {
      const evicted = captures.splice(MAX_CAPTURES);
      logger.warn(MODULE, 'save', `Evicted ${evicted.length} old capture(s) — storage limit reached`, {
        limit: MAX_CAPTURES,
      });
    }

    const saveResult = await saveAll(captures);
    if (!saveResult.ok) return saveResult;

    logger.info(MODULE, 'save', `Saved capture "${capture.metadata.id}"`, {
      name: capture.metadata.name,
      platform: capture.metadata.sourcePlatform,
    });
    return Ok(undefined);
  },

  async list(): Promise<Result<Capture[], StorageError>> {
    const result = await loadAll();
    if (!result.ok) return result;
    logger.debug(MODULE, 'list', `Loaded ${result.value.length} captures`);
    return result;
  },

  async get(id: string): Promise<Result<Capture, StorageError>> {
    const loadResult = await loadAll();
    if (!loadResult.ok) return loadResult;

    const capture = loadResult.value.find((c) => c.metadata.id === id);
    if (!capture) {
      const error = new StorageError({
        code: 'STORAGE_CAPTURE_NOT_FOUND',
        module: MODULE,
        fn: 'get',
        message: `Capture with id "${id}" not found in storage`,
        context: { captureId: id },
      });
      logger.warn(MODULE, 'get', error.describe());
      return Err(error);
    }

    return Ok(capture);
  },

  async delete(id: string): Promise<Result<void, StorageError>> {
    const loadResult = await loadAll();
    if (!loadResult.ok) return loadResult;

    const before = loadResult.value.length;
    const filtered = loadResult.value.filter((c) => c.metadata.id !== id);
    if (filtered.length === before) {
      logger.warn(MODULE, 'delete', `No capture found with id "${id}" — nothing deleted`, {
        captureId: id,
      });
    }

    const saveResult = await saveAll(filtered);
    if (!saveResult.ok) return saveResult;

    logger.info(MODULE, 'delete', `Deleted capture "${id}"`);
    return Ok(undefined);
  },
};
