import React, { useState } from 'react';
import type { Capture } from '../../core/models/capture';
import { messageBus } from '../../shared/messaging/message-bus';
import { logger } from '../../shared/logger/logger';
import type { AckResponse, CaptureListResponse } from '../../types/chrome-messages.d';

const MODULE = 'inject-button';

interface InjectButtonProps {
  capture: Capture;
  activeTabId: number | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function InjectButton({ capture, activeTabId, onSuccess, onError }: InjectButtonProps): React.JSX.Element {
  const [injecting, setInjecting] = useState(false);

  /**
   * Real inject flow:
   * 1. Ask background for the latest context markdown (in case it was updated)
   * 2. Send INJECT_COMMAND directly to the active tab via chrome.tabs.sendMessage
   * 3. Content script injector fills the input box and returns ACK
   * 4. Popup handles success/error based on real ACK
   *
   * We bypass the background→tab→background route to get a direct ACK from the tab.
   */
  const handleInject = async (): Promise<void> => {
    if (!activeTabId) {
      onError('No active tab found. Open an AI chat first.');
      return;
    }

    setInjecting(true);
    try {
      // Get the context markdown from the capture directly
      const contextMarkdown = capture.contextMarkdown;

      // Send INJECT_COMMAND directly to the content script in the active tab
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'INJECT_COMMAND',
        contextMarkdown,
      }) as AckResponse;

      if (!response) {
        onError('No response from page. Make sure you are on Claude, ChatGPT, or Gemini.');
        return;
      }

      if (response.type === 'ACK' && !response.success) {
        const msg = response.error ?? 'Injection failed — could not find the input box.';
        onError(msg);
        logger.error(MODULE, 'handleInject', msg);
        return;
      }

      onSuccess();
    } catch (err) {
      const msg = String(err).includes('Could not establish connection')
        ? 'Continuum not loaded on this page. Navigate to Claude, ChatGPT, or Gemini first.'
        : `Injection error: ${String(err)}`;
      onError(msg);
      logger.error(MODULE, 'handleInject', msg);
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div style={{ padding: '8px 20px 12px' }}>
      <button
        id="inject-btn"
        onClick={() => void handleInject()}
        disabled={injecting}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: injecting
            ? 'rgba(37,99,235,0.4)'
            : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: injecting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.15s',
          boxShadow: injecting ? 'none' : '0 4px 14px rgba(37,99,235,0.3)',
        }}
      >
        {injecting ? '⏳ Injecting...' : '🚀 Inject into Current Chat'}
      </button>
      <p style={{
        marginTop: '6px',
        fontSize: '9px',
        color: '#334155',
        textAlign: 'center',
      }}>
        Fills the input box — you control when to send.
      </p>
    </div>
  );
}
