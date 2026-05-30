import React from 'react';
import type { ValidationResult } from '../../types';

interface Props {
  result: ValidationResult | null;
  onValidate: () => void;
}

export default function ValidationPanel({ result, onValidate }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <button onClick={onValidate}
        className="w-full h-7 rounded text-xs transition-all"
        style={{ background: 'transparent', border: '1px solid #22d3ee', color: '#22d3ee', fontFamily: 'IBM Plex Sans' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#22d3ee22')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        Run Validation
      </button>

      {result && (
        <div className="flex flex-col gap-2">
          <Section title="ERRORS" items={result.errors} color="#f87171" bg="#7f1d1d22" dot="#f87171"/>
          <Section title="WARNINGS" items={result.warnings} color="#fbbf24" bg="#78350f22" dot="#fbbf24"/>
          <Section title="SUGGESTIONS" items={result.suggestions} color="#34d399" bg="#064e3b22" dot="#34d399"/>

          {result.errors.length === 0 && result.warnings.length === 0 && (
            <div className="rounded px-3 py-2 text-xs" style={{ background: '#064e3b22', border: '1px solid #34d39933', color: '#34d399', fontFamily: 'IBM Plex Sans' }}>
              ✓ Graph looks good
            </div>
          )}
        </div>
      )}

      {!result && (
        <div style={{ color: '#2d3f5a', fontSize: 11, textAlign: 'center', padding: '16px 0', fontFamily: 'DM Mono' }}>
          Run validation to check graph integrity
        </div>
      )}
    </div>
  );
}

function Section({ title, items, color, bg, dot }: {
  title: string; items: string[]; color: string; bg: string; dot: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 9, color, letterSpacing: '0.1em', marginBottom: 4 }}>
        {title} ({items.length})
      </div>
      <div className="flex flex-col gap-1">
        {items.map((msg, i) => (
          <div key={i} className="flex gap-2 rounded px-2 py-1.5"
            style={{ background: bg, border: `1px solid ${dot}33` }}>
            <span style={{ color: dot, fontSize: 10, flexShrink: 0, marginTop: 1 }}>●</span>
            <span style={{ fontSize: 10, color: '#c4cdd8', fontFamily: 'IBM Plex Sans', lineHeight: 1.4 }}>{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
