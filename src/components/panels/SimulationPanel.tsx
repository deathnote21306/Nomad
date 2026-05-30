import React, { useState, useCallback, useEffect } from 'react';
import type { NavNode, NavEdge, PathResult } from '../../types';
import { NODE_COLORS, NODE_ICONS } from '../../types';
import { downloadJson } from '../../utils/export';

interface SimStep {
  fromNode: NavNode;
  toNode: NavNode;
  edge: NavEdge;
  instruction: string;
}

interface Props {
  nodes: NavNode[];
  edges: NavEdge[];
  pathResult: PathResult;
  startId: string;
  goalId: string;
  onCurrentNodeChange: (nodeId: string | null) => void;
  onClose: () => void;
}

function buildSteps(pathResult: PathResult, nodes: NavNode[], edges: NavEdge[]): SimStep[] {
  const steps: SimStep[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (let i = 0; i < pathResult.nodeIds.length - 1; i++) {
    const fromId = pathResult.nodeIds[i];
    const toId   = pathResult.nodeIds[i + 1];
    const fromNode = nodeMap.get(fromId);
    const toNode   = nodeMap.get(toId);
    if (!fromNode || !toNode) continue;
    const edge = edges.find(e =>
      (e.from === fromId && e.to === toId) ||
      (e.bidirectional && e.from === toId && e.to === fromId)
    );
    if (!edge) continue;
    steps.push({
      fromNode, toNode, edge,
      instruction: edge.instruction || pathResult.instructions[i] || `Proceed to ${toNode.name || toNode.id}.`,
    });
  }
  return steps;
}

function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

export default function SimulationPanel({
  nodes, edges, pathResult, startId, goalId,
  onCurrentNodeChange, onClose,
}: Props) {
  const steps = buildSteps(pathResult, nodes, edges);
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());

  const step = steps[current];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Sync current position to canvas
  useEffect(() => {
    onCurrentNodeChange(step?.fromNode.id ?? null);
    return () => onCurrentNodeChange(null);
  }, [current, step?.fromNode.id]);

  // Auto-speak on step change
  useEffect(() => {
    if (step) speak(step.instruction);
  }, [current]);

  // Speak arrival at destination when all steps done
  useEffect(() => {
    if (done.size === steps.length && steps.length > 0) {
      const goal = nodeMap.get(goalId);
      speak(`You have arrived at ${goal?.name || goalId}.`);
      onCurrentNodeChange(goalId);
    }
  }, [done.size]);

  const goTo = (i: number) => setCurrent(Math.max(0, Math.min(steps.length - 1, i)));

  const markComplete = () => {
    setDone(prev => new Set([...prev, current]));
    if (current < steps.length - 1) goTo(current + 1);
  };

  const exportRouteTest = () => {
    const routeNodes = pathResult.nodeIds
      .map(id => nodeMap.get(id))
      .filter((n): n is NavNode => Boolean(n));
    const data = {
      start_node: nodeMap.get(startId) ?? startId,
      destination_node: nodeMap.get(goalId) ?? goalId,
      route_nodes: routeNodes,
      route_edges: steps.map(s => s.edge),
      ordered_instructions: steps.map((s, i) => ({
        step: i + 1,
        from_node: { id: s.fromNode.id, name: s.fromNode.name, type: s.fromNode.type },
        to_node:   { id: s.toNode.id,   name: s.toNode.name,   type: s.toNode.type },
        instruction: s.instruction,
        expected_visual_landmarks: s.edge.expected_visual_landmarks,
        distance_category: s.edge.distance?.category,
        direction_cardinal: s.edge.direction?.cardinal,
        direction_relative: s.edge.direction?.relative,
      })),
      metadata: {
        total_steps: steps.length,
        total_distance: pathResult.totalDistance,
        exported_at: new Date().toISOString(),
      },
    };
    const start = nodeMap.get(startId);
    const goal  = nodeMap.get(goalId);
    const safe  = `${start?.name || startId}_to_${goal?.name || goalId}`
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    downloadJson(data, `route_test_${safe}.json`);
  };

  const allDone = done.size === steps.length;

  if (steps.length === 0) {
    return (
      <div style={{ color: '#4a5568', fontSize: 11, fontFamily: 'DM Mono', padding: '16px 0', textAlign: 'center' }}>
        No steps — check that nodes are connected
      </div>
    );
  }

  return (
    <div className="fade-in flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#22d3ee', letterSpacing: '0.1em' }}>
          SIMULATION MODE
        </span>
        <button onClick={() => { window.speechSynthesis?.cancel(); onClose(); }}
          style={{ color: '#4a5568', fontSize: 16 }}>×</button>
      </div>

      {/* Route line */}
      <div className="flex items-center gap-2 rounded px-2 py-1.5"
        style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
        <span style={{ fontSize: 10, color: '#e2e8f0', fontFamily: 'IBM Plex Sans', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nodeMap.get(startId)?.name || startId}
        </span>
        <span style={{ color: '#4a5568', fontSize: 10 }}>→</span>
        <span style={{ fontSize: 10, color: '#e2e8f0', fontFamily: 'IBM Plex Sans', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
          {nodeMap.get(goalId)?.name || goalId}
        </span>
      </div>

      {/* Progress */}
      <div>
        <div style={{ height: 3, background: '#1e2a3d', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: '#34d399',
            width: `${(done.size / steps.length) * 100}%`,
            transition: 'width 0.3s ease',
          }}/>
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', marginTop: 4 }}>
          STEP {current + 1} / {steps.length} — {done.size} COMPLETED
        </div>
      </div>

      {/* Current step card */}
      {step && (
        <div className="flex flex-col gap-2 rounded p-3"
          style={{ background: '#111520', border: `1px solid ${done.has(current) ? '#34d39944' : '#22d3ee33'}` }}>

          <div className="flex gap-2">
            <NodeChip node={step.fromNode} label="FROM"/>
            <NodeChip node={step.toNode} label="TO"/>
          </div>

          {/* Instruction */}
          <div className="rounded px-2 py-2" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 8, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 4 }}>
              INSTRUCTION
            </div>
            <p style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'IBM Plex Sans', lineHeight: 1.5, margin: 0 }}>
              {step.instruction}
            </p>
          </div>

          {/* Direction + Distance */}
          <div className="flex gap-2">
            <InfoChip label="DIRECTION" value={step.edge.direction?.cardinal ?? '—'}/>
            <InfoChip
              label="DISTANCE"
              value={step.edge.distance?.category ?? '—'}
              color={
                step.edge.distance?.category === 'short' ? '#34d399' :
                step.edge.distance?.category === 'long'  ? '#f87171' : '#fbbf24'
              }
            />
          </div>

          {/* Landmarks */}
          {step.edge.expected_visual_landmarks.length > 0 && (
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 8, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 4 }}>
                LOOK FOR
              </div>
              <div className="flex flex-wrap gap-1">
                {step.edge.expected_visual_landmarks.map((lm, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5"
                    style={{ background: '#1e2a3d', fontSize: 10, color: '#8892a8', fontFamily: 'IBM Plex Sans' }}>
                    {lm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {done.has(current) && (
            <span style={{ fontSize: 10, color: '#34d399', fontFamily: 'IBM Plex Sans' }}>✓ Marked complete</span>
          )}
        </div>
      )}

      {allDone && (
        <div className="rounded px-2 py-2 text-center"
          style={{ background: '#064e3b22', border: '1px solid #34d39944', fontSize: 11, color: '#34d399', fontFamily: 'IBM Plex Sans' }}>
          ✓ Arrived at destination
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <SimBtn label="← Previous" disabled={current === 0}   onClick={() => goTo(current - 1)}/>
        <SimBtn label="Next →"     disabled={current === steps.length - 1} onClick={() => goTo(current + 1)} primary/>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SimBtn label="⟳ Replay"    onClick={() => step && speak(step.instruction)}/>
        <SimBtn label="✓ Complete"  onClick={markComplete} success disabled={done.has(current)}/>
      </div>

      {/* Export */}
      <button onClick={exportRouteTest}
        className="w-full h-7 rounded text-xs transition-all"
        style={{ background: 'transparent', border: '1px solid #1e2a3d', color: '#8892a8', fontFamily: 'IBM Plex Sans' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#22d3ee'; e.currentTarget.style.color = '#22d3ee'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2a3d'; e.currentTarget.style.color = '#8892a8'; }}>
        ↓ Export Route Test
      </button>

      {/* Step list */}
      <div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.1em', marginBottom: 6 }}>
          ALL STEPS
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 160 }}>
          {steps.map((s, i) => (
            <div key={i}
              className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer"
              style={{
                background: i === current ? '#1e2a3d' : '#111520',
                border: `1px solid ${i === current ? '#22d3ee' : done.has(i) ? '#34d39933' : '#1e2a3d'}`,
              }}
              onClick={() => goTo(i)}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 9, minWidth: 16,
                color: done.has(i) ? '#34d399' : i === current ? '#22d3ee' : '#4a5568' }}>
                {done.has(i) ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 10, color: '#8892a8', fontFamily: 'IBM Plex Sans',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {s.fromNode.name || s.fromNode.id} → {s.toNode.name || s.toNode.id}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NodeChip({ node, label }: { node: NavNode; label: string }) {
  return (
    <div className="flex-1 rounded px-1.5 py-1" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 7, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: NODE_COLORS[node.type], fontFamily: 'IBM Plex Sans', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {NODE_ICONS[node.type]} {node.name || node.id}
      </div>
    </div>
  );
}

function InfoChip({ label, value, color = '#8892a8' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 rounded px-1.5 py-1" style={{ background: '#0c0e16', border: '1px solid #1e2a3d' }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 7, color: '#4a5568', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color, fontFamily: 'DM Mono' }}>{value}</div>
    </div>
  );
}

function SimBtn({ label, onClick, disabled, primary, success }: {
  label: string; onClick: () => void; disabled?: boolean; primary?: boolean; success?: boolean;
}) {
  const col = disabled ? '#2d3f5a' : success ? '#34d399' : primary ? '#22d3ee' : '#8892a8';
  const bdr = disabled ? '#1e2a3d' : success ? '#34d39966' : primary ? '#22d3ee66' : '#1e2a3d';
  return (
    <button onClick={!disabled ? onClick : undefined} disabled={disabled}
      className="h-7 rounded text-xs"
      style={{ background: 'transparent', border: `1px solid ${bdr}`, color: col, fontFamily: 'IBM Plex Sans', cursor: disabled ? 'default' : 'pointer' }}>
      {label}
    </button>
  );
}
