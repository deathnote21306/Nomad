import React, { useState } from 'react';
import type { NavNode, PathResult } from '../../types';
import { NODE_COLORS, NODE_ICONS } from '../../types';

interface Props {
  nodes: NavNode[];
  onFindPath: (startId: string, goalId: string) => PathResult | null;
  onHighlightPath: (nodeIds: string[]) => void;
  onRouteFound?: (result: PathResult, startId: string, goalId: string) => void;
}

export default function PathfindingPanel({ nodes, onFindPath, onHighlightPath, onRouteFound }: Props) {
  const [startId, setStartId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [result, setResult] = useState<PathResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const find = () => {
    setError(null);
    setResult(null);
    if (!startId || !goalId) { setError('Select start and destination nodes'); return; }
    if (startId === goalId) { setError('Start and destination must be different'); return; }
    const r = onFindPath(startId, goalId);
    if (!r) {
      setError('No path found between these nodes');
      onHighlightPath([]);
    } else {
      setResult(r);
      onHighlightPath(r.nodeIds);
      onRouteFound?.(r, startId, goalId);
    }
  };

  const clear = () => {
    setResult(null);
    setError(null);
    onHighlightPath([]);
  };

  const selectStyle = {
    background: '#0c0e16' as const,
    border: '1px solid #1e2a3d',
    color: '#e2e8f0' as const,
    fontFamily: 'IBM Plex Sans',
    fontSize: 11,
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Start Node</Label>
        <select value={startId} onChange={e => setStartId(e.target.value)}
          className="w-full h-7 rounded px-2 outline-none"
          style={selectStyle}>
          <option value="">— Select node —</option>
          {nodes.map(n => (
            <option key={n.id} value={n.id}>{n.name || n.id} ({n.type})</option>
          ))}
        </select>
      </div>

      <div>
        <Label>Destination Node</Label>
        <select value={goalId} onChange={e => setGoalId(e.target.value)}
          className="w-full h-7 rounded px-2 outline-none"
          style={selectStyle}>
          <option value="">— Select node —</option>
          {nodes.map(n => (
            <option key={n.id} value={n.id}>{n.name || n.id} ({n.type})</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button onClick={find}
          className="flex-1 h-7 rounded text-xs transition-all"
          style={{ background: 'transparent', border: '1px solid #22d3ee', color: '#22d3ee', fontFamily: 'IBM Plex Sans' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#22d3ee22')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          Find Route
        </button>
        {(result || error) && (
          <button onClick={clear}
            className="h-7 px-3 rounded text-xs"
            style={{ background: 'transparent', border: '1px solid #1e2a3d', color: '#4a5568', fontFamily: 'IBM Plex Sans' }}>
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="rounded px-2 py-1.5 text-xs" style={{ background: '#7f1d1d22', border: '1px solid #f8717133', color: '#f87171', fontFamily: 'IBM Plex Sans' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded px-2 py-1.5"
            style={{ background: '#064e3b22', border: '1px solid #34d39933' }}>
            <div>
              <div style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono', letterSpacing: '0.08em' }}>HOPS</div>
              <div style={{ fontSize: 14, color: '#34d399', fontFamily: 'DM Mono' }}>{result.nodeIds.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#4a5568', fontFamily: 'DM Mono', letterSpacing: '0.08em' }}>DISTANCE</div>
              <div style={{ fontSize: 14, color: '#34d399', fontFamily: 'DM Mono' }}>{result.totalDistance.toFixed(3)}</div>
            </div>
          </div>

          <Label>Turn-by-Turn</Label>
          <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 220 }}>
            {result.instructions.map((inst, i) => {
              const nodeId = result.nodeIds[i];
              const node = nodes.find(n => n.id === nodeId);
              return (
                <div key={i} className="flex gap-2 rounded px-2 py-1.5"
                  style={{ background: '#111520', border: '1px solid #1e2a3d' }}>
                  <span style={{ fontSize: 10, color: '#34d399', fontFamily: 'DM Mono', flexShrink: 0, minWidth: 16 }}>
                    {i + 1}
                  </span>
                  {node && (
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{NODE_ICONS[node.type]}</span>
                  )}
                  <span style={{ fontSize: 10, color: '#c4cdd8', fontFamily: 'IBM Plex Sans', lineHeight: 1.4 }}>{inst}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nodes.length === 0 && (
        <div style={{ color: '#2d3f5a', fontSize: 11, textAlign: 'center', padding: '16px 0', fontFamily: 'DM Mono' }}>
          Add nodes to find paths
        </div>
      )}
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
