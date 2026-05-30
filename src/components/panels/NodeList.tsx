import React, { useState } from 'react';
import type { NavNode } from '../../types';
import { NODE_COLORS, NODE_ICONS } from '../../types';

interface Props {
  nodes: NavNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function NodeList({ nodes, selectedId, onSelect, onDelete }: Props) {
  const [search, setSearch] = useState('');

  const filtered = nodes.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.id.toLowerCase().includes(search.toLowerCase()) ||
    n.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#4a5568', fontSize: 11 }}>⌕</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-7 rounded pl-6 pr-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="Search nodes…"
        />
      </div>

      {/* Count */}
      <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.1em' }}>
        {filtered.length} / {nodes.length} NODES
      </div>

      {/* List */}
      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 320 }}>
        {filtered.length === 0 && (
          <div style={{ color: '#2d3f5a', fontSize: 11, textAlign: 'center', padding: '16px 0', fontFamily: 'DM Mono' }}>
            {nodes.length === 0 ? 'No nodes yet' : 'No matches'}
          </div>
        )}
        {filtered.map(node => (
          <div key={node.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer transition-colors"
            style={{
              background: selectedId === node.id ? '#1e2a3d' : '#111520',
              border: `1px solid ${selectedId === node.id ? '#22d3ee' : '#1e2a3d'}`,
            }}
            onClick={() => onSelect(node.id)}
            onMouseEnter={e => { if (selectedId !== node.id) (e.currentTarget as HTMLElement).style.borderColor = '#2d3f5a'; }}
            onMouseLeave={e => { if (selectedId !== node.id) (e.currentTarget as HTMLElement).style.borderColor = '#1e2a3d'; }}
          >
            <span style={{ fontSize: 13, minWidth: 16 }}>{NODE_ICONS[node.type]}</span>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[node.type] }}/>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'IBM Plex Sans', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.name || node.id}
              </div>
              <div style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.id}
              </div>
            </div>
            <div style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono', flexShrink: 0 }}>
              {node.x.toFixed(2)},{node.y.toFixed(2)}
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(node.id); }}
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
