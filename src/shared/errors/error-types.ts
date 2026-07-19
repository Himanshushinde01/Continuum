/**
 * BaseAppError and all typed subclasses used throughout ContextBridge.
 * Every error must include: code, module, fn, message.
 * No silent failures — every catch block uses these types.
 */
export class BaseAppError extends Error {
  readonly code: string;
  readonly module: string;
  readonly fn: string;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(params: {
    code: string;
    module: string;
    fn: string;
    message: string;
    context?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = this.constructor.name;
    this.code = params.code;
    this.module = params.module;
    this.fn = params.fn;
    this.timestamp = new Date().toISOString();
    this.context = params.context;
    this.cause = params.cause;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** Produces a fully-qualified, human-readable error description always including location. */
  describe(): string {
    return (
      `[${this.code}] ${this.module}.${this.fn}() — ${this.message}` +
      (this.context ? ` | context: ${JSON.stringify(this.context)}` : '')
    );
  }
}

export class ExtractionError extends BaseAppError {}
export class CompressionError extends BaseAppError {}
export class StorageError extends BaseAppError {}
export class InjectionError extends BaseAppError {}
export class ValidationError extends BaseAppError {}
export class MessageError extends BaseAppError {}
