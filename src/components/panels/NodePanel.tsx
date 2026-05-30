import React, { useState, useEffect } from 'react';
import type { NavNode, NodeType } from '../../types';
import { NODE_COLORS, NODE_LABELS } from '../../types';

interface Props {
  node: NavNode;
  onUpdate: (patch: Partial<NavNode>) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

const NODE_TYPES: NodeType[] = [
  'room','door','hallway','intersection','stairs',
  'elevator','exit','washroom','landmark','obstacle_zone',
];

export default function NodePanel({ node, onUpdate, onDelete, onDeselect }: Props) {
  const [name, setName] = useState(node.name);
  const [notes, setNotes] = useState(node.notes);
  const [floor, setFloor] = useState(node.floor);
  const [confidence, setConfidence] = useState(node.confidence);
  const [landmarks, setLandmarks] = useState(node.visual_landmarks.join(', '));

  useEffect(() => {
    setName(node.name);
    setNotes(node.notes);
    setFloor(node.floor);
    setConfidence(node.confidence);
    setLandmarks(node.visual_landmarks.join(', '));
  }, [node.id]);

  const save = () => {
    onUpdate({
      name: name.trim() || node.name,
      notes,
      floor,
      confidence,
      visual_landmarks: landmarks.split(',').map(s => s.trim()).filter(Boolean),
    });
  };

  const color = NODE_COLORS[node.type];

  return (
    <div className="fade-in flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }}/>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#4a5568', letterSpacing: '0.1em' }}>NODE</span>
        </div>
        <button onClick={onDeselect} style={{ color: '#4a5568', fontSize: 16 }}>×</button>
      </div>

      {/* ID badge */}
      <div className="rounded px-2 py-1.5" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#22d3ee', wordBreak: 'break-all' }}>{node.id}</span>
      </div>

      {/* Type */}
      <div>
        <Label>Type</Label>
        <select value={node.type} onChange={e => onUpdate({ type: e.target.value as NodeType })}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: NODE_COLORS[node.type], fontFamily: 'DM Mono', fontSize: 11 }}>
          {NODE_TYPES.map(t => (
            <option key={t} value={t} style={{ color: NODE_COLORS[t] }}>{NODE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div>
        <Label>Name</Label>
        <input value={name} onChange={e => setName(e.target.value)} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="e.g. M-1410"/>
      </div>

      {/* Floor + Confidence row */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>Floor</Label>
          <input value={floor} onChange={e => setFloor(e.target.value)} onBlur={save}
            className="w-full h-7 rounded px-2 text-xs outline-none"
            style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
            placeholder="1"/>
        </div>
        <div className="flex-1">
          <Label>Confidence</Label>
          <input type="number" min={0} max={1} step={0.1} value={confidence}
            onChange={e => setConfidence(parseFloat(e.target.value))} onBlur={save}
            className="w-full h-7 rounded px-2 text-xs outline-none"
            style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'DM Mono' }}/>
        </div>
      </div>

      {/* Coordinates (read-only) */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>X (normalized)</Label>
          <div className="h-7 rounded px-2 flex items-center"
            style={{ background: '#0c0e16', border: '1px solid #1e2a3d', fontFamily: 'DM Mono', fontSize: 11, color: '#8892a8' }}>
            {node.x.toFixed(4)}
          </div>
        </div>
        <div className="flex-1">
          <Label>Y (normalized)</Label>
          <div className="h-7 rounded px-2 flex items-center"
            style={{ background: '#0c0e16', border: '1px solid #1e2a3d', fontFamily: 'DM Mono', fontSize: 11, color: '#8892a8' }}>
            {node.y.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Visual landmarks */}
      <div>
        <Label>Visual Landmarks (comma-separated)</Label>
        <input value={landmarks} onChange={e => setLandmarks(e.target.value)} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="door sign, window, pillar"/>
      </div>

      {/* Notes */}
      <div>
        <Label>Notes</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} rows={2}
          className="w-full rounded px-2 py-1 text-xs outline-none resize-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#8892a8', fontFamily: 'IBM Plex Sans' }}
          placeholder="Optional notes..."/>
      </div>

      {/* Delete */}
      <button onClick={onDelete}
        className="w-full h-7 rounded text-xs transition-colors"
        style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', fontFamily: 'IBM Plex Sans' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#7f1d1d22')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        Delete Node
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.1em', marginBottom: 3, textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}
