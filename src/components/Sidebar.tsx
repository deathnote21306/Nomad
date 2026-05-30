import React, { useState } from 'react';
import type { NavNode, NavEdge, BuildingInfo, ValidationResult, PathResult } from '../types';
import NodePanel from './panels/NodePanel';
import EdgePanel from './panels/EdgePanel';
import NodeList from './panels/NodeList';
import EdgeList from './panels/EdgeList';
import ValidationPanel from './panels/ValidationPanel';
import PathfindingPanel from './panels/PathfindingPanel';
import SimulationPanel from './panels/SimulationPanel';
import BuildingPanel from './panels/BuildingPanel';

type Tab = 'graph' | 'validate' | 'path' | 'building';

interface Props {
  nodes: NavNode[];
  edges: NavEdge[];
  building: BuildingInfo;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  validationResult: ValidationResult | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onDeselectNode: () => void;
  onDeselectEdge: () => void;
  onUpdateNode: (id: string, patch: Partial<NavNode>) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (id: string, patch: Partial<NavEdge>) => void;
  onDeleteEdge: (id: string) => void;
  onUpdateBuilding: (patch: Partial<BuildingInfo>) => void;
  onValidate: () => void;
  onFindPath: (startId: string, goalId: string) => PathResult | null;
  onHighlightPath: (nodeIds: string[]) => void;
  onSimulationNodeChange: (nodeId: string | null) => void;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'graph',    label: 'Graph',    icon: '⬡' },
  { id: 'validate', label: 'Validate', icon: '✓' },
  { id: 'path',     label: 'Route',    icon: '⟶' },
  { id: 'building', label: 'Building', icon: '▦' },
];

export default function Sidebar({
  nodes, edges, building,
  selectedNodeId, selectedEdgeId,
  validationResult,
  onSelectNode, onSelectEdge,
  onDeselectNode, onDeselectEdge,
  onUpdateNode, onDeleteNode,
  onUpdateEdge, onDeleteEdge,
  onUpdateBuilding,
  onValidate,
  onFindPath, onHighlightPath,
  onSimulationNodeChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('graph');

  // Simulation state lives here so it survives tab switches
  const [simActive, setSimActive] = useState(false);
  const [simResult, setSimResult] = useState<PathResult | null>(null);
  const [simStartId, setSimStartId] = useState('');
  const [simGoalId, setSimGoalId] = useState('');

  const getNodeName = (id: string) => nodes.find(n => n.id === id)?.name || id;

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) ?? null : null;

  const handleRouteFound = (result: PathResult, startId: string, goalId: string) => {
    setSimResult(result);
    setSimStartId(startId);
    setSimGoalId(goalId);
    setSimActive(false); // reset simulation when a new route is found
  };

  const startSimulation = () => {
    if (simResult) setSimActive(true);
  };

  const stopSimulation = () => {
    setSimActive(false);
    onSimulationNodeChange(null);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0c0e16', borderLeft: '1px solid #1e2a3d', width: 280, minWidth: 280 }}>
      {/* Tab bar */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid #1e2a3d' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 flex flex-col items-center justify-center py-2 transition-colors"
            style={{
              background: tab === t.id ? '#111520' : 'transparent',
              borderBottom: `2px solid ${tab === t.id ? '#22d3ee' : 'transparent'}`,
              color: tab === t.id ? '#22d3ee' : '#4a5568',
              fontFamily: 'DM Mono',
              fontSize: 9,
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}>
            <span style={{ fontSize: 13, marginBottom: 2 }}>{t.icon}</span>
            <span>{t.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>

        {/* ── GRAPH TAB ── */}
        {tab === 'graph' && (
          <>
            {selectedNode && (
              <div className="mb-4 pb-4" style={{ borderBottom: '1px solid #1e2a3d' }}>
                <NodePanel
                  node={selectedNode}
                  onUpdate={patch => onUpdateNode(selectedNode.id, patch)}
                  onDelete={() => onDeleteNode(selectedNode.id)}
                  onDeselect={onDeselectNode}
                />
              </div>
            )}
            {selectedEdge && (
              <div className="mb-4 pb-4" style={{ borderBottom: '1px solid #1e2a3d' }}>
                <EdgePanel
                  edge={selectedEdge}
                  onUpdate={patch => onUpdateEdge(selectedEdge.id, patch)}
                  onDelete={() => onDeleteEdge(selectedEdge.id)}
                  onDeselect={onDeselectEdge}
                  getNodeName={getNodeName}
                />
              </div>
            )}

            <div className="mb-3">
              <SectionHeader label="NODES" count={nodes.length}/>
              <NodeList nodes={nodes} selectedId={selectedNodeId}
                onSelect={onSelectNode} onDelete={onDeleteNode}/>
            </div>

            <div>
              <SectionHeader label="EDGES" count={edges.length}/>
              <EdgeList edges={edges} selectedId={selectedEdgeId}
                onSelect={onSelectEdge} onDelete={onDeleteEdge} getNodeName={getNodeName}/>
            </div>
          </>
        )}

        {/* ── VALIDATE TAB ── */}
        {tab === 'validate' && (
          <ValidationPanel result={validationResult} onValidate={onValidate}/>
        )}

        {/* ── ROUTE / SIMULATION TAB ── */}
        {tab === 'path' && (
          simActive && simResult ? (
            <SimulationPanel
              nodes={nodes}
              edges={edges}
              pathResult={simResult}
              startId={simStartId}
              goalId={simGoalId}
              onCurrentNodeChange={onSimulationNodeChange}
              onClose={stopSimulation}
            />
          ) : (
            <>
              <PathfindingPanel
                nodes={nodes}
                onFindPath={onFindPath}
                onHighlightPath={onHighlightPath}
                onRouteFound={handleRouteFound}
              />
              {simResult && !simActive && (
                <button onClick={startSimulation}
                  className="w-full h-8 rounded text-xs mt-3 transition-all"
                  style={{ background: '#22d3ee18', border: '1px solid #22d3ee66', color: '#22d3ee', fontFamily: 'IBM Plex Sans' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#22d3ee28')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#22d3ee18')}>
                  ▶ Simulate Navigation
                </button>
              )}
            </>
          )
        )}

        {/* ── BUILDING TAB ── */}
        {tab === 'building' && (
          <BuildingPanel
            building={building}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            onUpdate={onUpdateBuilding}
          />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#4a5568', letterSpacing: '0.1em' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#2d3f5a' }}>{count}</span>
    </div>
  );
}
