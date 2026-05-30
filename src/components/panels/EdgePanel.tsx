import React, { useState, useEffect } from 'react';
import type { NavEdge, EdgeType } from '../../types';
import { EDGE_LABELS } from '../../types';

interface Props {
  edge: NavEdge;
  onUpdate: (patch: Partial<NavEdge>) => void;
  onDelete: () => void;
  onDeselect: () => void;
  getNodeName: (id: string) => string;
}

const EDGE_TYPES: EdgeType[] = [
  'walkable_connection','doorway_connection','hallway_segment',
  'stairs_connection','elevator_connection','exit_connection',
];

const CARDINALS = ['north','south','east','west','northeast','northwest','southeast','southwest'];

export default function EdgePanel({ edge, onUpdate, onDelete, onDeselect, getNodeName }: Props) {
  const [instruction, setInstruction] = useState(edge.instruction);
  const [notes, setNotes] = useState(edge.notes);
  const [landmarks, setLandmarks] = useState(edge.expected_visual_landmarks.join(', '));
  const [confidence, setConfidence] = useState(edge.confidence);

  useEffect(() => {
    setInstruction(edge.instruction);
    setNotes(edge.notes);
    setLandmarks(edge.expected_visual_landmarks.join(', '));
    setConfidence(edge.confidence);
  }, [edge.id]);

  const save = () => {
    onUpdate({
      instruction,
      notes,
      expected_visual_landmarks: landmarks.split(',').map(s => s.trim()).filter(Boolean),
      confidence,
    });
  };

  return (
    <div className="fade-in flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#4a5568', letterSpacing: '0.1em' }}>EDGE</span>
        </div>
        <button onClick={onDeselect} style={{ color: '#4a5568', fontSize: 16 }}>×</button>
      </div>

      {/* ID */}
      <div className="rounded px-2 py-1.5" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
        <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#22d3ee', wordBreak: 'break-all' }}>{edge.id}</span>
      </div>

      {/* From → To */}
      <div className="rounded px-2 py-2 flex items-center gap-2"
        style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
        <NodeBadge name={getNodeName(edge.from)} id={edge.from}/>
        <span style={{ color: '#4a5568', fontSize: 12 }}>{edge.bidirectional ? '⇄' : '→'}</span>
        <NodeBadge name={getNodeName(edge.to)} id={edge.to}/>
      </div>

      {/* Type */}
      <div>
        <Label>Type</Label>
        <select value={edge.type} onChange={e => onUpdate({ type: e.target.value as EdgeType })}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'DM Mono', fontSize: 11 }}>
          {EDGE_TYPES.map(t => <option key={t} value={t}>{EDGE_LABELS[t]}</option>)}
        </select>
      </div>

      {/* Bidirectional */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="bidir" checked={edge.bidirectional}
          onChange={e => onUpdate({ bidirectional: e.target.checked })}
          style={{ accentColor: '#22d3ee' }}/>
        <label htmlFor="bidir" style={{ fontSize: 11, color: '#8892a8', fontFamily: 'IBM Plex Sans', cursor: 'pointer' }}>
          Bidirectional
        </label>
      </div>

      {/* Direction */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>Direction</Label>
          <select value={edge.direction?.cardinal ?? 'east'}
            onChange={e => onUpdate({ direction: { ...edge.direction, cardinal: e.target.value } })}
            className="w-full h-7 rounded px-2 text-xs outline-none"
            style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'DM Mono', fontSize: 11 }}>
            {CARDINALS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <Label>Distance</Label>
          <div className="h-7 rounded px-2 flex items-center gap-1"
            style={{ background: '#0c0e16', border: '1px solid #1e2a3d', fontFamily: 'DM Mono', fontSize: 11, color: '#8892a8' }}>
            <span style={{ color: edge.distance?.category === 'short' ? '#34d399' : edge.distance?.category === 'long' ? '#f87171' : '#fbbf24' }}>
              {edge.distance?.category}
            </span>
            <span style={{ color: '#4a5568' }}>&nbsp;{edge.distance?.relative_distance?.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* Instruction */}
      <div>
        <Label>Navigation Instruction</Label>
        <textarea value={instruction} onChange={e => setInstruction(e.target.value)} onBlur={save} rows={2}
          className="w-full rounded px-2 py-1 text-xs outline-none resize-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}/>
      </div>

      {/* Expected landmarks */}
      <div>
        <Label>Expected Visual Landmarks</Label>
        <input value={landmarks} onChange={e => setLandmarks(e.target.value)} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="door, sign, window"/>
      </div>

      {/* Confidence + Notes */}
      <div>
        <Label>Confidence</Label>
        <input type="number" min={0} max={1} step={0.1} value={confidence}
          onChange={e => setConfidence(parseFloat(e.target.value))} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'DM Mono' }}/>
      </div>

      <div>
        <Label>Notes</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} rows={2}
          className="w-full rounded px-2 py-1 text-xs outline-none resize-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#8892a8', fontFamily: 'IBM Plex Sans' }}/>
      </div>

      <button onClick={onDelete}
        className="w-full h-7 rounded text-xs transition-colors"
        style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', fontFamily: 'IBM Plex Sans' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#7f1d1d22')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        Delete Edge
      </button>
    </div>
  );
}

function NodeBadge({ name, id }: { name: string; id: string }) {
  return (
    <div className="flex flex-col">
      <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}>{name}</span>
      <span style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono' }}>{id}</span>
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
