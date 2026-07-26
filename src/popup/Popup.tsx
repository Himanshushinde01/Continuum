import React, { useEffect, useState, useCallback } from 'react';
import { CaptureList } from './components/CaptureList';
import { CapturePreview } from './components/CapturePreview';
import { InjectButton } from './components/InjectButton';
import { messageBus } from '../shared/messaging/message-bus';
import { logger } from '../shared/logger/logger';
import type { Capture } from '../core/models/capture';
import type { CaptureListResponse, CaptureAckMessage } from '../types/chrome-messages.d';

const MODULE = 'popup';

const styles = {
  container: {
    width: '380px',
    minHeight: '480px',
    background: 'linear-gradient(135deg, #0f0f13 0%, #1a1a2e 100%)',
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    color: '#e2e8f0',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(180deg, rgba(124,58,237,0.15) 0%, transparent 100%)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  logoIcon: {
    width: '28px',
    height: '28px',
    background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  subtitle: {
    fontSize: '11px',
    color: '#64748b',
  },
  captureBtn: {
    margin: '12px 20px',
    padding: '10px 16px',
    background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'opacity 0.15s, transform 0.1s',
    width: 'calc(100% - 40px)',
  },
  status: {
    margin: '0 20px 8px',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    textAlign: 'center' as const,
  },
  statusSuccess: {
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.2)',
    color: '#34d399',
  },
  statusError: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171',
  },
  statusLoading: {
    background: 'rgba(124,58,237,0.1)',
    border: '1px solid rgba(124,58,237,0.2)',
    color: '#a78bfa',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    margin: '4px 0',
  },
  sectionLabel: {
    padding: '8px 20px 4px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  footer: {
    marginTop: 'auto',
    padding: '10px 20px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    fontSize: '10px',
    color: '#334155',
    textAlign: 'center' as const,
  },
  notOnAiPage: {
    padding: '24px 20px',
    textAlign: 'center' as const,
    color: '#475569',
    fontSize: '12px',
    lineHeight: 1.6,
  },
};

type StatusType = 'idle' | 'capturing' | 'success' | 'error';

export function Popup(): React.JSX.Element {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);
  const [status, setStatus] = useState<StatusType>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentTabUrl, setCurrentTabUrl] = useState<string>('');
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [partialCaptureWarning, setPartialCaptureWarning] = useState<string | null>(null);

  // Determine if we're on a supported AI platform
  const isOnSupportedPlatform =
    currentTabUrl.startsWith('https://claude.ai/') ||
    currentTabUrl.startsWith('https://chatgpt.com/') ||
    currentTabUrl.startsWith('https://gemini.google.com/');

  const loadCaptures = useCallback(async () => {
    const result = await messageBus.send<CaptureListResponse>({ type: 'LIST_CAPTURES' });
    if (result.ok && result.value.type === 'CAPTURE_LIST_RESPONSE') {
      setCaptures(result.value.captures);
    } else {
      logger.warn(MODULE, 'loadCaptures', 'Failed to load captures from background');
    }
  }, []);

  useEffect(() => {
    // Load saved captures and get current tab info on popup open
    void loadCaptures();
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) setCurrentTabUrl(tab.url);
      if (tab?.id) setActiveTabId(tab.id);
    });
  }, [loadCaptures]);

  /**
   * Real capture flow:
   * 1. Popup sends TRIGGER_CAPTURE to the active tab via chrome.tabs.sendMessage
   * 2. Content script extracts → sends to background → background saves
   * 3. Content script responds with CAPTURE_ACK {success, error?}
   * 4. Popup refreshes captures list based on real ACK — no setTimeout guessing
   */
  const handleCapture = useCallback(async () => {
    if (!activeTabId) {
      setStatus('error');
      setStatusMessage('Cannot find active tab. Open an AI chat first.');
      setTimeout(() => setStatus('idle'), 4000);
      return;
    }

    setStatus('capturing');
    setStatusMessage('Extracting conversation...');

    try {
      // Send TRIGGER_CAPTURE directly to the content script in the active tab
      const response = await chrome.tabs.sendMessage(activeTabId, { type: 'TRIGGER_CAPTURE' }) as CaptureAckMessage;

      if (!response || response.type !== 'CAPTURE_ACK') {
        setStatus('error');
        setStatusMessage('Content script not ready. Please refresh the AI chat page.');
        setTimeout(() => setStatus('idle'), 5000);
        return;
      }

      if (!response.success) {
        setStatus('error');
        const msg = response.error ?? 'Extraction failed — the page may not have a conversation yet.';
        setStatusMessage(msg);
        logger.error(MODULE, 'handleCapture', msg);
        setTimeout(() => setStatus('idle'), 5000);
        return;
      }

      // Capture succeeded — refresh the list
      await loadCaptures();

      // Show partial-capture warning if the background flagged it
      if (response.partialCapture && response.partialCaptureMessage) {
        setPartialCaptureWarning(response.partialCaptureMessage);
      } else {
        setPartialCaptureWarning(null);
      }

      setStatus('success');
      setStatusMessage('✓ Conversation captured!');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      // chrome.tabs.sendMessage throws if content script is not running on this page
      const msg = String(err).includes('Could not establish connection')
        ? 'Continuum not loaded on this page. Make sure you are on Claude, ChatGPT, or Gemini and refresh.'
        : `Capture error: ${String(err)}`;
      setStatus('error');
      setStatusMessage(msg);
      logger.error(MODULE, 'handleCapture', msg);
      setTimeout(() => setStatus('idle'), 6000);
    }
  }, [activeTabId, loadCaptures]);

  const handleDelete = useCallback(async (id: string) => {
    await messageBus.send({ type: 'DELETE_CAPTURE', captureId: id });
    if (selectedCapture?.metadata.id === id) setSelectedCapture(null);
    await loadCaptures();
  }, [selectedCapture, loadCaptures]);

  const statusStyle = status === 'success'
    ? { ...styles.status, ...styles.statusSuccess }
    : status === 'error'
    ? { ...styles.status, ...styles.statusError }
    : { ...styles.status, ...styles.statusLoading };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🌉</div>
          <span style={styles.title}>Continuum</span>
        </div>
        <div style={styles.subtitle}>Carry your AI context across platforms — free &amp; local.</div>
      </div>

      {/* Capture Button — only shown when on a supported AI page */}
      {isOnSupportedPlatform ? (
        <button
          id="capture-btn"
          style={{
            ...styles.captureBtn,
            opacity: status === 'capturing' ? 0.6 : 1,
            cursor: status === 'capturing' ? 'not-allowed' : 'pointer',
          }}
          onClick={() => void handleCapture()}
          disabled={status === 'capturing'}
        >
          {status === 'capturing' ? '⏳ Capturing...' : '📸 Capture This Chat'}
        </button>
      ) : (
        <div style={styles.notOnAiPage}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>
            Navigate to a supported platform to capture:
          </div>
          <div style={{ color: '#64748b', fontSize: '11px' }}>
            Claude · ChatGPT · Gemini
          </div>
        </div>
      )}

      {/* Status bar */}
      {status !== 'idle' && (
        <div style={statusStyle}>{statusMessage}</div>
      )}

      {/* Partial capture warning — shown when some turns may have been missed */}
      {partialCaptureWarning && (
        <div style={{
          margin: '0 12px 8px',
          padding: '8px 12px',
          background: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: '8px',
          fontSize: '11px',
          color: '#fbbf24',
          lineHeight: '1.5',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>{partialCaptureWarning}</span>
          <button
            onClick={() => setPartialCaptureWarning(null)}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              color: '#fbbf24',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0',
              lineHeight: '1',
              marginLeft: 'auto',
            }}
            aria-label="Dismiss warning"
          >×</button>
        </div>
      )}


      {/* Captures list */}
      {captures.length > 0 && (
        <>
          <div style={styles.divider} />
          <div style={styles.sectionLabel}>Saved Captures ({captures.length})</div>
          <CaptureList
            captures={captures}
            selectedId={selectedCapture?.metadata.id ?? null}
            onSelect={setSelectedCapture}
            onDelete={(id) => void handleDelete(id)}
          />
        </>
      )}

      {captures.length === 0 && status === 'idle' && (
        <div style={{
          padding: '24px 20px',
          textAlign: 'center',
          color: '#475569',
          fontSize: '12px',
          lineHeight: 1.6,
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>💬</div>
          <div>No captures yet.</div>
          <div>Open an AI chat and click &ldquo;Capture This Chat&rdquo; to start.</div>
        </div>
      )}

      {/* Preview + Inject */}
      {selectedCapture && (
        <>
          <div style={styles.divider} />
          <CapturePreview capture={selectedCapture} />
          <InjectButton
            capture={selectedCapture}
            activeTabId={activeTabId}
            onSuccess={() => {
              setStatus('success');
              setStatusMessage('✓ Context injected into input box!');
              setTimeout(() => setStatus('idle'), 3000);
            }}
            onError={(msg) => {
              setStatus('error');
              setStatusMessage(msg);
              setTimeout(() => setStatus('idle'), 5000);
            }}
          />
        </>
      )}

      <div style={styles.footer}>
        100% local · no accounts · open source
      </div>
    </div>
  );
}
