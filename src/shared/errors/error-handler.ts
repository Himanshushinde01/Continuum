import { BaseAppError } from './error-types';
import { logger } from '../logger/logger';

/**
 * Installs global unhandled error + unhandled rejection handlers for a named context.
 * Must be called once at the top of each entry point:
 *   - service-worker.ts   → installGlobalErrorHandler('service-worker')
 *   - content-entry.ts    → installGlobalErrorHandler('content-script:<platform>')
 *   - popup-entry.tsx     → installGlobalErrorHandler('popup')
 *
 * This is a SAFETY NET, not the primary error-handling strategy.
 * Every module should still handle its own expected errors via Result<T,E>.
 */
export function installGlobalErrorHandler(contextName: string): void {
  self.addEventListener('error', (event: ErrorEvent) => {
    logger.error(contextName, 'uncaught-error', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const err = event.reason as unknown;
    if (err instanceof BaseAppError) {
      logger.error(err.module, err.fn, err.describe());
    } else {
      logger.error(contextName, 'unhandled-rejection', String(err));
    }
  });
}
