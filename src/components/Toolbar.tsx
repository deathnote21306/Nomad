import React, { useRef } from 'react';
import type { ToolMode, NodeType } from '../types';
import { NODE_LABELS, NODE_COLORS } from '../types';

interface Props {
  tool: ToolMode;
  nodeType: NodeType;
  onToolChange: (t: ToolMode) => void;
  onNodeTypeChange: (t: NodeType) => void;
  onImageUpload: (src: string) => void;
  onExport: () => void;
  onImport: (raw: string) => void;
  onClear: () => void;
  onValidate: () => void;
}

const TOOLS: { id: ToolMode; label: string; icon: string; tip: string }[] = [
  { id: 'select',   label: 'Select',  icon: '↖', tip: 'Select & move nodes' },
  { id: 'add_node', label: 'Add Node', icon: '⊕', tip: 'Click canvas to place node' },
  { id: 'connect',  label: 'Connect', icon: '⟶', tip: 'Connect two nodes with an edge' },
  { id: 'delete',   label: 'Delete',  icon: '⌫', tip: 'Click node/edge to delete' },
];

const NODE_TYPES: NodeType[] = [
  'room','door','hallway','intersection','stairs',
  'elevator','exit','washroom','landmark','obstacle_zone',
];

export default function Toolbar({
  tool, nodeType, onToolChange, onNodeTypeChange,
  onImageUpload, onExport, onImport, onClear, onValidate,
}: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      if (src) onImageUpload(src);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const raw = ev.target?.result as string;
      if (raw) onImport(raw);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2 px-3 h-12 shrink-0"
      style={{ background: '#0c0e16', borderBottom: '1px solid #1e2a3d' }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mr-3 pr-3" style={{ borderRight: '1px solid #1e2a3d' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="1" y="1" width="16" height="16" rx="2" stroke="#22d3ee" strokeWidth="1.5"/>
          <path d="M1 7h16M7 1v16" stroke="#22d3ee" strokeWidth="1" opacity="0.4"/>
          <circle cx="9" cy="9" r="2" fill="#22d3ee"/>
        </svg>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#22d3ee', letterSpacing: '0.1em' }}>
          FLOORMAP
        </span>
      </div>

      {/* Tool buttons */}
      <div className="flex items-center gap-1 mr-2 pr-2" style={{ borderRight: '1px solid #1e2a3d' }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => onToolChange(t.id)} data-tooltip={t.tip}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded text-xs transition-all"
            style={{
              background: tool === t.id ? '#1e2a3d' : 'transparent',
              border: `1px solid ${tool === t.id ? '#22d3ee' : 'transparent'}`,
              color: tool === t.id ? '#22d3ee' : '#8892a8',
              fontFamily: 'IBM Plex Sans',
            }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Node type selector — only visible in add_node mode */}
      {tool === 'add_node' && (
        <div className="flex items-center gap-1.5 mr-2 pr-2" style={{ borderRight: '1px solid #1e2a3d' }}>
          <span style={{ fontSize: 10, color: '#4a5568', fontFamily: 'DM Mono', letterSpacing: '0.08em' }}>TYPE</span>
          <select
            value={nodeType}
            onChange={e => onNodeTypeChange(e.target.value as NodeType)}
            className="h-7 rounded px-2 text-xs outline-none"
            style={{
              background: '#161b2e',
              border: '1px solid #1e2a3d',
              color: NODE_COLORS[nodeType],
              fontFamily: 'DM Mono',
              fontSize: 11,
            }}>
            {NODE_TYPES.map(t => (
              <option key={t} value={t} style={{ color: NODE_COLORS[t] }}>{NODE_LABELS[t]}</option>
            ))}
          </select>
          <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[nodeType] }}/>
        </div>
      )}

      <div className="flex-1"/>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleImageFile}/>
        <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile}/>

        {[
          { label: 'Upload Image', icon: '⬆', action: () => imageInputRef.current?.click(), tip: 'Upload floor plan image' },
          { label: 'Import JSON',  icon: '↓',  action: () => importInputRef.current?.click(), tip: 'Import navigation graph JSON' },
          { label: 'Export JSON',  icon: '↑',  action: onExport, tip: 'Download navigation graph JSON' },
          { label: 'Validate',     icon: '✓',  action: onValidate, tip: 'Validate graph integrity' },
          { label: 'Clear',        icon: '✕',  action: onClear, tip: 'Clear all nodes and edges' },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} data-tooltip={btn.tip}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded text-xs transition-all"
            style={{
              background: 'transparent',
              border: '1px solid #1e2a3d',
              color: '#8892a8',
              fontFamily: 'IBM Plex Sans',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#22d3ee';
              (e.currentTarget as HTMLButtonElement).style.color = '#22d3ee';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e2a3d';
              (e.currentTarget as HTMLButtonElement).style.color = '#8892a8';
            }}>
            <span>{btn.icon}</span>
            <span className="hidden md:inline">{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
