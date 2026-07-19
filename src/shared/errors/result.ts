/**
 * Result<T, E> — discriminated union for expected-failure paths.
 * Functions that can fail in a predictable way (extraction, storage, injection)
 * return Result<T, E> instead of throwing, so callers are forced to handle both paths.
 *
 * Only throw for truly unexpected programmer errors (e.g., required arg is undefined).
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Convenience constructors */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
