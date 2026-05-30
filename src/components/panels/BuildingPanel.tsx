import React, { useState, useEffect } from 'react';
import type { BuildingInfo } from '../../types';

interface Props {
  building: BuildingInfo;
  nodeCount: number;
  edgeCount: number;
  onUpdate: (patch: Partial<BuildingInfo>) => void;
}

export default function BuildingPanel({ building, nodeCount, edgeCount, onUpdate }: Props) {
  const [name, setName] = useState(building.name);
  const [floor, setFloor] = useState(building.floor);
  const [source, setSource] = useState(building.source_image);
  const [notes, setNotes] = useState(building.notes.join('\n'));

  useEffect(() => {
    setName(building.name);
    setFloor(building.floor);
    setSource(building.source_image);
    setNotes(building.notes.join('\n'));
  }, [building.name, building.floor, building.source_image]);

  const save = () => {
    onUpdate({
      name: name.trim(),
      floor: floor.trim(),
      source_image: source.trim(),
      notes: notes.split('\n').map(s => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="NODES" value={nodeCount} color="#22d3ee"/>
        <Stat label="EDGES" value={edgeCount} color="#a78bfa"/>
      </div>

      <div>
        <Label>Building Name</Label>
        <input value={name} onChange={e => setName(e.target.value)} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="e.g. McConnell Engineering Building"/>
      </div>

      <div>
        <Label>Floor</Label>
        <input value={floor} onChange={e => setFloor(e.target.value)} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="e.g. 14"/>
      </div>

      <div>
        <Label>Source Image</Label>
        <input value={source} onChange={e => setSource(e.target.value)} onBlur={save}
          className="w-full h-7 rounded px-2 text-xs outline-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#e2e8f0', fontFamily: 'IBM Plex Sans' }}
          placeholder="floor_14.png"/>
      </div>

      <div>
        <Label>Notes (one per line)</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={save} rows={3}
          className="w-full rounded px-2 py-1 text-xs outline-none resize-none"
          style={{ background: '#0c0e16', border: '1px solid #1e2a3d', color: '#8892a8', fontFamily: 'IBM Plex Sans' }}
          placeholder="Optional building notes…"/>
      </div>

      <div className="rounded px-2 py-2" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 4 }}>COORDINATE SYSTEM</div>
        <div style={{ fontSize: 10, color: '#8892a8', fontFamily: 'IBM Plex Sans', lineHeight: 1.5 }}>
          Normalized [0,1] × [0,1]<br/>
          Origin: top-left<br/>
          x → right, y → down
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded px-2 py-2" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 20, color, lineHeight: 1 }}>{value}</div>
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
