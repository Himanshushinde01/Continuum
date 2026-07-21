import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';
import { installGlobalErrorHandler } from '../shared/errors/error-handler';
import { logger } from '../shared/logger/logger';

installGlobalErrorHandler('popup');

class PopupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorDetails: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorDetails: '' };
  }

  static getDerivedStateFromError(error: unknown): { hasError: boolean; errorDetails: string } {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorDetails: msg };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('popup', 'render', `Error boundary caught: ${msg}`, {
      componentStack: info.componentStack ?? '',
    });
  }

  copyDetails(): void {
    void navigator.clipboard.writeText(this.state.errorDetails);
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: '#1a0a0a',
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ color: '#f87171', fontWeight: 600, fontSize: '14px' }}>
             ⚠ Continuum encountered a render error
          </div>
          <code style={{
            fontSize: '11px',
            color: '#fca5a5',
            background: '#2a1010',
            padding: '8px',
            borderRadius: '4px',
            wordBreak: 'break-all',
          }}>
            {this.state.errorDetails}
          </code>
          <button
            onClick={() => this.copyDetails()}
            style={{
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Copy error details
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found in popup.html');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <PopupErrorBoundary>
      <Popup />
    </PopupErrorBoundary>
  </React.StrictMode>
);
