/**
 * Structured logger — every call is tagged with module + function name explicitly.
 * Do NOT rely on stack-trace parsing; production/minified builds make stacks unreliable.
 * Tag at the call site instead.
 */
export const logger = {
  error(
    module: string,
    fn: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    console.error(`[ContextBridge][${module}.${fn}]`, message, meta ?? '');
  },

  warn(
    module: string,
    fn: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    console.warn(`[ContextBridge][${module}.${fn}]`, message, meta ?? '');
  },

  info(
    module: string,
    fn: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    console.info(`[ContextBridge][${module}.${fn}]`, message, meta ?? '');
  },

  debug(
    module: string,
    fn: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    console.debug(`[ContextBridge][${module}.${fn}]`, message, meta ?? '');
  },
};
