# ContextBridge — Agent Build Spec

**Purpose of this document:** this is the file to hand to an AI coding agent (Antigravity, Copilot, etc.) so it scaffolds and implements the project correctly on the first pass, without improvising architecture decisions. It assumes the agent has also read `PRD-ContextBridge.md` for product context — this file is the *technical contract*: exact file structure, module boundaries, and error-handling rules that must not be violated.

**Non-negotiable engineering rules — read before writing any code:**
1. **One file, one responsibility.** If a file does two unrelated things, split it. No "utils.ts" dumping ground.
2. **DRY.** Shared logic goes in `shared/` or a base class. Never copy-paste the same DOM-query/error-wrapping/storage logic across extractors — extend the base class instead.
3. **No silent failures, no patchy fixes.** Every catch block either recovers meaningfully and logs why, or rethrows a typed error with context. Never `catch (e) {}`, never `catch (e) { console.log(e) }` and move on, never a fallback stub that hides a real bug. If something can't be fixed properly, it should fail loudly with a clear error, not be papered over.
4. **Every error must say what broke, where, and why** — module, function, and a human-readable message, at minimum. See §5.
5. **No `any` in TypeScript.** Type everything, including chrome.runtime message payloads.
6. **Every module in `core/` and `storage/` gets a unit test.** DOM extractors get fixture-based tests (see §7).

---

## 1. Tech Stack

- TypeScript (strict mode on) throughout
- Vite for build/bundling (Manifest V3-friendly, faster than Webpack for this size)
- React (popup UI only)
- Vitest for unit tests
- Manifest V3 Chrome extension
- No backend, no external runtime dependencies for core logic (v1 constraint from PRD — keep it that way)

## 2. Directory Structure

```
context-bridge/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   ├── PRD-ContextBridge.md
│   ├── BUILD-SPEC.md              # this file
│   └── ERROR-CODES.md             # generated/maintained log of every error code in the system
├── src/
│   ├── background/
│   │   └── service-worker.ts      # background entry point + message routing ONLY. No business logic here.
│   │
│   ├── content-scripts/
│   │   ├── content-entry.ts       # single entry point: detects platform, wires extractor+injector, mounts nothing else
│   │   ├── platform-detector.ts   # ONE job: return which platform (claude/chatgpt/gemini/unknown) the current page is
│   │   ├── extractors/
│   │   │   ├── base-extractor.ts      # abstract class: shared DOM-wait/retry logic, defines extract() contract
│   │   │   ├── claude-extractor.ts    # implements base-extractor for claude.ai DOM only
│   │   │   ├── chatgpt-extractor.ts   # implements base-extractor for chatgpt.com DOM only
│   │   │   └── gemini-extractor.ts    # implements base-extractor for gemini.google.com DOM only
│   │   └── injectors/
│   │       ├── base-injector.ts       # abstract class: shared "find input box, set value, dispatch input event" logic
│   │       ├── claude-injector.ts
│   │       ├── chatgpt-injector.ts
│   │       └── gemini-injector.ts
│   │
│   ├── core/                      # platform-agnostic business logic — no DOM access allowed in this folder
│   │   ├── models/
│   │   │   ├── conversation.ts    # NormalizedConversation, Turn, Role types — the shared contract every extractor outputs
│   │   │   └── capture.ts         # Capture, CaptureMetadata types — what gets stored
│   │   ├── compression/
│   │   │   ├── compressor.ts          # orchestrates the pipeline below, one job: run strategies in order
│   │   │   ├── token-estimator.ts     # ONE job: estimate token count of a string
│   │   │   └── strategies/
│   │   │       ├── strategy.ts               # shared interface: CompressionStrategy.apply(conversation) -> conversation
│   │   │       ├── boilerplate-stripper.ts   # removes retries/errors/UI noise
│   │   │       ├── code-block-summarizer.ts  # collapses old code blocks unless flagged "keep"
│   │   │       ├── extractive-summarizer.ts  # keeps key sentences from older turns
│   │   │       └── recent-turns-preserver.ts # keeps last N turns verbatim
│   │   └── markdown/
│   │       └── context-md-builder.ts  # ONE job: Capture -> context.md string, and the reverse parse
│   │
│   ├── storage/
│   │   ├── storage-service.ts     # thin wrapper around chrome.storage.local — ONLY place that touches chrome.storage
│   │   └── capture-repository.ts  # CRUD over captures, built on storage-service — business-level storage API
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup-entry.tsx        # mounts <Popup />, wraps in the global error boundary (§5)
│   │   ├── Popup.tsx              # layout only, delegates to components
│   │   └── components/
│   │       ├── CaptureList.tsx
│   │       ├── CapturePreview.tsx
│   │       └── InjectButton.tsx
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── error-types.ts     # BaseAppError + subclasses (see §5)
│   │   │   ├── error-handler.ts   # global handlers for each execution context
│   │   │   └── result.ts          # Result<T, E> type for expected-failure paths
│   │   ├── logger/
│   │   │   └── logger.ts          # structured logger, tags every call with module+function
│   │   ├── messaging/
│   │   │   └── message-bus.ts     # typed wrapper over chrome.runtime.sendMessage/onMessage
│   │   └── constants.ts
│   └── types/
│       └── chrome-messages.d.ts   # discriminated union of every message type passed via message-bus
│
└── tests/
    ├── fixtures/
    │   ├── claude-conversation.html
    │   ├── chatgpt-conversation.html
    │   └── gemini-conversation.html
    └── unit/
        ├── extractors/*.test.ts
        ├── compression/*.test.ts
        └── storage/*.test.ts
```

**Rule of thumb for the agent:** if you're about to write DOM-query code (`document.querySelector`, etc.) anywhere outside `content-scripts/extractors/` or `content-scripts/injectors/`, stop — that logic belongs in an extractor/injector, not in `core/`. `core/` must be testable with plain data, no browser DOM required.

## 3. Module Contracts

These are the interfaces every implementation must satisfy. Define these first, before any concrete extractor/strategy/etc.

```typescript
// core/models/conversation.ts
export type Role = 'user' | 'assistant';

export interface Turn {
  role: Role;
  content: string;
  codeBlocks: CodeBlock[];
  timestamp?: string;
}

export interface CodeBlock {
  language: string;
  content: string;
  keepVerbatim: boolean; // user-flagged or auto-flagged as "most recent version of this file"
}

export interface NormalizedConversation {
  sourcePlatform: 'claude' | 'chatgpt' | 'gemini';
  turns: Turn[];
  capturedAt: string; // ISO timestamp
}
```

```typescript
// content-scripts/extractors/base-extractor.ts
export abstract class BaseExtractor {
  abstract platform: NormalizedConversation['sourcePlatform'];

  // Template method — subclasses implement the DOM-specific pieces only.
  async extract(): Promise<Result<NormalizedConversation, ExtractionError>> { /* shared retry/wait logic lives here */ }

  protected abstract findTurnElements(): Element[];
  protected abstract parseTurn(el: Element): Turn | null;
}
```

```typescript
// core/compression/strategies/strategy.ts
export interface CompressionStrategy {
  name: string;
  apply(conversation: NormalizedConversation): NormalizedConversation;
}
```

```typescript
// storage/capture-repository.ts
export interface CaptureRepository {
  save(capture: Capture): Promise<Result<void, StorageError>>;
  list(): Promise<Result<Capture[], StorageError>>;
  get(id: string): Promise<Result<Capture, StorageError>>;
  delete(id: string): Promise<Result<void, StorageError>>;
}
```

Every extractor, injector, and compression strategy is a **swappable implementation of a shared contract**. Adding a 4th platform later means adding one extractor + one injector file — nothing else changes. This is the core architectural property to preserve.

## 4. DRY Enforcement Points

- All DOM waiting/retry logic (page might not be fully loaded) lives once in `base-extractor.ts`, not duplicated per platform.
- All input-box-filling logic (set value, dispatch synthetic input/change events so React-based sites detect it) lives once in `base-injector.ts`.
- All `chrome.storage` access goes through `storage-service.ts` — nothing else calls `chrome.storage` directly.
- All cross-context communication (content script ↔ background ↔ popup) goes through `message-bus.ts` with typed messages from `chrome-messages.d.ts` — no raw `chrome.runtime.sendMessage` calls scattered around.
- Token estimation logic lives once in `token-estimator.ts` and is reused by both the compressor and the popup preview.

## 5. Error Handling (global + per-file)

### 5.1 Error type hierarchy

```typescript
// shared/errors/error-types.ts
export class BaseAppError extends Error {
  readonly code: string;        // e.g. 'EXTRACTION_DOM_NOT_FOUND'
  readonly module: string;      // e.g. 'claude-extractor'
  readonly fn: string;          // e.g. 'findTurnElements'
  readonly timestamp: string;
  readonly context?: Record<string, unknown>; // extra debug data, e.g. { url, selector }
  readonly cause?: unknown;

  constructor(params: {
    code: string; module: string; fn: string;
    message: string; context?: Record<string, unknown>; cause?: unknown;
  }) {
    super(params.message);
    this.code = params.code;
    this.module = params.module;
    this.fn = params.fn;
    this.timestamp = new Date().toISOString();
    this.context = params.context;
    this.cause = params.cause;
  }

  /** What gets logged/shown — always includes location. */
  describe(): string {
    return `[${this.code}] ${this.module}.${this.fn}() — ${this.message}` +
      (this.context ? ` | context: ${JSON.stringify(this.context)}` : '');
  }
}

export class ExtractionError extends BaseAppError {}
export class CompressionError extends BaseAppError {}
export class StorageError extends BaseAppError {}
export class InjectionError extends BaseAppError {}
export class ValidationError extends BaseAppError {}
```

Every error code used anywhere must be registered in `docs/ERROR-CODES.md` with a one-line meaning — the agent should keep this file updated as it adds new error codes, so there's a single lookup table instead of codes scattered and undocumented across files.

### 5.2 Result type for expected failures

Not every failure is exceptional — "the DOM structure changed and extraction failed" is expected and should be handled as data, not a thrown exception, so callers are forced to handle it:

```typescript
// shared/errors/result.ts
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Rule: functions that can fail in an *expected* way (extraction, storage, injection) return `Result<T, E>`. Functions should only `throw` for truly unexpected/programmer errors (e.g., a required argument was undefined due to a caller bug). This keeps error handling explicit instead of relying on try/catch scattered everywhere.

### 5.3 Global handlers — one per execution context

Chrome extensions run in **three separate JS contexts** (background service worker, each content script, popup) — each needs its own global handler, they don't share one.

```typescript
// shared/errors/error-handler.ts
export function installGlobalErrorHandler(contextName: string) {
  self.addEventListener('error', (event) => {
    logger.error(contextName, 'uncaught-error', event.message, {
      filename: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error?.stack,
    });
  });

  self.addEventListener('unhandledrejection', (event) => {
    const err = event.reason;
    if (err instanceof BaseAppError) {
      logger.error(err.module, err.fn, err.describe());
    } else {
      logger.error(contextName, 'unhandled-rejection', String(err));
    }
  });
}
```

Call `installGlobalErrorHandler('service-worker')`, `installGlobalErrorHandler('content-script:claude')`, `installGlobalErrorHandler('popup')` at the top of each entry file. This is the safety net — it must never be the *primary* error handling strategy. Every module should still handle its own expected errors via `Result`; the global handler exists to catch genuine bugs, not to be relied on as normal control flow.

### 5.4 File-level rule

Every function that does I/O (DOM read, storage read/write, message passing) must:
1. Wrap the risky operation.
2. On failure, construct a typed error with `code`, `module`, `fn`, and enough `context` to debug without reproducing (e.g., which selector failed, which capture id).
3. Return it via `Result`, or log-and-rethrow if it's truly unrecoverable — never swallow it.

Example:

```typescript
// content-scripts/extractors/claude-extractor.ts
protected findTurnElements(): Element[] {
  const container = document.querySelector('[data-testid="conversation"]');
  if (!container) {
    throw new ExtractionError({
      code: 'EXTRACTION_CONTAINER_NOT_FOUND',
      module: 'claude-extractor',
      fn: 'findTurnElements',
      message: 'Could not find conversation container — Claude DOM structure may have changed',
      context: { url: window.location.href, expectedSelector: '[data-testid="conversation"]' },
    });
  }
  return Array.from(container.children);
}
```

### 5.5 Logger

```typescript
// shared/logger/logger.ts
export const logger = {
  error(module: string, fn: string, message: string, meta?: Record<string, unknown>) {
    console.error(`[ContextBridge][${module}.${fn}]`, message, meta ?? '');
  },
  warn(module: string, fn: string, message: string, meta?: Record<string, unknown>) { /* same pattern */ },
  info(module: string, fn: string, message: string, meta?: Record<string, unknown>) { /* same pattern */ },
};
```

Every log call is tagged with `module` and `fn` explicitly — don't rely on parsing stack traces for this, since production/minified builds make stack traces unreliable. Explicit tagging at the call site is what actually guarantees "print error, location, and where it broke."

## 6. Popup Error Boundary

`popup-entry.tsx` wraps `<Popup />` in a React error boundary that:
- Catches render errors,
- Logs them via `logger.error('popup', 'render', ...)`,
- Shows the user a real message (what broke, and a "copy error details" button) — never a blank popup, never a silent failure.

## 7. Testing Requirements

- Every `core/compression/strategies/*.ts` gets a unit test with at least one "before/after" fixture.
- Every extractor gets a test against a saved HTML fixture in `tests/fixtures/` — this is what catches DOM-structure breakage before users do.
- `storage-service.ts` and `capture-repository.ts` get tests using a mocked `chrome.storage` API.
- No PR/feature is "done" without a passing test for the new logic — this applies to the agent's own output, not just human-written code.

## 8. Build Order for the Agent

Follow this order — each step should be a working, testable increment, not a big-bang implementation:

1. Scaffold repo: `manifest.json`, `package.json`, `tsconfig.json` (strict mode), `vite.config.ts`.
2. Build `shared/errors/*` and `shared/logger/*` first — everything else depends on these.
3. Build `core/models/*` (types only, no logic).
4. Build `storage/storage-service.ts` + `capture-repository.ts` + tests.
5. Build `content-scripts/extractors/base-extractor.ts`, then `claude-extractor.ts` + fixture test. Get one platform fully working end-to-end (extract → log the result) before adding the other two.
6. Build `core/compression/*` (strategies + compressor + token-estimator) + tests — this can be developed against fixture data, independent of the DOM work.
7. Build `core/markdown/context-md-builder.ts` + tests.
8. Wire extractor → compressor → markdown builder → storage in `content-scripts/content-entry.ts` and `background/service-worker.ts` via `message-bus.ts`.
9. Build `popup/*` UI last, once the underlying pipeline is proven to work via manual testing (e.g., a temporary debug button).
10. Add `chatgpt-extractor.ts` and `gemini-extractor.ts` + their injectors, following the exact pattern established by the Claude implementation — this step should be fast if step 5 was done right, which is the real test of whether the architecture is actually modular.
11. Add injectors (`base-injector.ts` + 3 implementations) and wire "Inject" button in popup.
12. Final pass: confirm every error path has a typed error, every I/O function returns `Result`, `ERROR-CODES.md` is complete and matches the code.
