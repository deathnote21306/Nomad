import React, { useState } from 'react';
import type { NavEdge } from '../../types';
import { EDGE_LABELS } from '../../types';

interface Props {
  edges: NavEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  getNodeName: (id: string) => string;
}

export default function EdgeList({ edges, selectedId, onSelect, onDelete, getNodeName }: Props) {
  const [search, setSearch] = useState('');

  const filtered = edges.filter(e =>
    e.id.toLowerCase().includes(search.toLowerCase()) ||
    e.type.toLowerCase().includes(search.toLowerCase()) ||
    getNodeName(e.from).toLowerCase().includes(search.toLowerCase()) ||
    getNodeName(e.to).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#4a5568', fontSize: 11 }}>⌕</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-7 rounded pl-6 pr-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="Search edges…"
        />
      </div>

      <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.1em' }}>
        {filtered.length} / {edges.length} EDGES
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 320 }}>
        {filtered.length === 0 && (
          <div style={{ color: '#2d3f5a', fontSize: 11, textAlign: 'center', padding: '16px 0', fontFamily: 'DM Mono' }}>
            {edges.length === 0 ? 'No edges yet' : 'No matches'}
          </div>
        )}
        {filtered.map(edge => (
          <div key={edge.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer transition-colors"
            style={{
              background: selectedId === edge.id ? '#1e2a3d' : '#111520',
              border: `1px solid ${selectedId === edge.id ? '#22d3ee' : '#1e2a3d'}`,
            }}
            onClick={() => onSelect(edge.id)}
            onMouseEnter={e => { if (selectedId !== edge.id) (e.currentTarget as HTMLElement).style.borderColor = '#2d3f5a'; }}
            onMouseLeave={e => { if (selectedId !== edge.id) (e.currentTarget as HTMLElement).style.borderColor = '#1e2a3d'; }}
          >
            <span style={{ fontSize: 11, color: '#4a5568', flexShrink: 0 }}>{edge.bidirectional ? '⇄' : '→'}</span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'IBM Plex Sans', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getNodeName(edge.from)} → {getNodeName(edge.to)}
              </div>
              <div style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {EDGE_LABELS[edge.type]}
              </div>
            </div>
            <div style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono', flexShrink: 0 }}>
              {edge.distance?.category}
            </div>
            <button
              onClick={ev => { ev.stopPropagation(); onDelete(edge.id); }}
              style={{ color: '#4a5568', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4a5568')}
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
