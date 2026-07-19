import React from 'react';
import type { Capture } from '../../core/models/capture';

interface CaptureListProps {
  captures: Capture[];
  selectedId: string | null;
  onSelect: (capture: Capture) => void;
  onDelete: (id: string) => void;
}

const PLATFORM_EMOJI: Record<string, string> = {
  claude: '🟠',
  chatgpt: '🟢',
  gemini: '🔵',
};

export function CaptureList({ captures, selectedId, onSelect, onDelete }: CaptureListProps): React.JSX.Element {
  return (
    <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px 0' }}>
      {captures.map((capture) => {
        const isSelected = capture.metadata.id === selectedId;
        const platform = capture.metadata.sourcePlatform;
        const emoji = PLATFORM_EMOJI[platform] ?? '⚪';
        const savings = capture.metadata.originalTokenEstimate > 0
          ? Math.round(
              (1 - capture.metadata.compressedTokenEstimate / capture.metadata.originalTokenEstimate) * 100
            )
          : 0;

        return (
          <div
            key={capture.metadata.id}
            id={`capture-item-${capture.metadata.id}`}
            onClick={() => onSelect(capture)}
            style={{
              padding: '10px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: isSelected ? 'rgba(124,58,237,0.15)' : 'transparent',
              borderLeft: isSelected ? '2px solid #7c3aed' : '2px solid transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
            }}
            onMouseLeave={(e) => {
              if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#e2e8f0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {capture.metadata.name}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                {capture.metadata.turnCount} turns · ~{capture.metadata.compressedTokenEstimate} tokens
                {savings > 0 && (
                  <span style={{ color: '#34d399', marginLeft: '6px' }}>↓{savings}% saved</span>
                )}
              </div>
            </div>
            <button
              id={`delete-capture-${capture.metadata.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(capture.metadata.id);
              }}
              title="Delete capture"
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '2px 4px',
                borderRadius: '4px',
                flexShrink: 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = '#f87171'; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = '#475569'; }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
