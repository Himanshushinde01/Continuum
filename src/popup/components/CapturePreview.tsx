import React, { useState } from 'react';
import type { Capture } from '../../core/models/capture';

interface CapturePreviewProps {
  capture: Capture;
}

export function CapturePreview({ capture }: CapturePreviewProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(capture.contextMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { originalTokenEstimate, compressedTokenEstimate } = capture.metadata;
  const savings = originalTokenEstimate > 0
    ? Math.round((1 - compressedTokenEstimate / originalTokenEstimate) * 100)
    : 0;

  return (
    <div style={{ padding: '12px 20px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Preview
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Token stats */}
          <span style={{
            fontSize: '10px',
            color: '#94a3b8',
            background: 'rgba(255,255,255,0.05)',
            padding: '2px 6px',
            borderRadius: '4px',
          }}>
            {originalTokenEstimate > 0 && <span style={{ color: '#64748b' }}>~{originalTokenEstimate} → </span>}
            <span style={{ color: '#34d399' }}>~{compressedTokenEstimate} tokens</span>
            {savings > 0 && <span style={{ color: '#34d399', marginLeft: '4px' }}>({savings}% less)</span>}
          </span>
          <button
            id="copy-context-btn"
            onClick={() => void handleCopy()}
            style={{
              background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
              border: 'none',
              color: copied ? '#34d399' : '#94a3b8',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '3px 8px',
              borderRadius: '5px',
              transition: 'all 0.15s',
            }}
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '8px',
        padding: '10px 12px',
        maxHeight: '120px',
        overflowY: 'auto',
        fontSize: '10px',
        color: '#94a3b8',
        lineHeight: 1.6,
        fontFamily: "'Inter', monospace",
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {capture.contextMarkdown.slice(0, 600)}
        {capture.contextMarkdown.length > 600 && (
          <span style={{ color: '#475569' }}>{'\n'}... [truncated for preview]</span>
        )}
      </div>
    </div>
  );
}
