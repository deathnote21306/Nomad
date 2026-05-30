import React, { useState, useCallback } from 'react';
import type { ToolMode, NodeType, NavNode, NavEdge, BuildingInfo, ValidationResult } from './types';
import { useGraph } from './hooks/useGraph';
import { validateGraph } from './utils/graph';
import { buildExportJson, downloadJson, parseImportJson } from './utils/export';
import { dijkstra } from './utils/pathfinding';
import Toolbar from './components/Toolbar';
import FloorPlanCanvas from './components/FloorPlanCanvas';
import Sidebar from './components/Sidebar';

export default function App() {
  const {
    nodes, edges, building, createdAt,
    addNode, updateNode, deleteNode,
    addEdge, updateEdge, deleteEdge,
    updateBuilding, importState, clearGraph,
  } = useGraph();

  const [tool, setTool] = useState<ToolMode>('select');
  const [nodeType, setNodeType] = useState<NodeType>('room');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [simulationNodeId, setSimulationNodeId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // ─── Canvas interactions ──────────────────────────────────────────────────

  const handleCanvasClick = useCallback((nx: number, ny: number) => {
    if (tool !== 'add_node') return;
    const node = addNode(nx, ny, nodeType, '', building.floor);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, [tool, nodeType, addNode, building.floor]);

  const handleNodeClick = useCallback((id: string) => {
    if (tool === 'delete') {
      deleteNode(id);
      if (selectedNodeId === id) setSelectedNodeId(null);
      return;
    }
    if (tool === 'connect') {
      if (!connectingFromId) {
        setConnectingFromId(id);
      } else {
        if (connectingFromId !== id) {
          addEdge(connectingFromId, id);
        }
        setConnectingFromId(null);
      }
      return;
    }
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, [tool, connectingFromId, addEdge, deleteNode, selectedNodeId]);

  const handleEdgeClick = useCallback((id: string) => {
    if (tool === 'delete') {
      deleteEdge(id);
      if (selectedEdgeId === id) setSelectedEdgeId(null);
      return;
    }
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, [tool, deleteEdge, selectedEdgeId]);

  const handleNodeDragEnd = useCallback((id: string, nx: number, ny: number) => {
    updateNode(id, { x: nx, y: ny });
  }, [updateNode]);

  const handleConnectSecond = useCallback((id: string) => {
    if (!connectingFromId || connectingFromId === id) {
      setConnectingFromId(null);
      return;
    }
    addEdge(connectingFromId, id);
    setConnectingFromId(null);
  }, [connectingFromId, addEdge]);

  // ─── Tool changes ─────────────────────────────────────────────────────────

  const handleToolChange = (t: ToolMode) => {
    setTool(t);
    setConnectingFromId(null);
    if (t !== 'select') {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  // ─── Export / Import / Validate / Clear ──────────────────────────────────

  const handleExport = () => {
    const data = buildExportJson(nodes, edges, building, createdAt);
    const safeName = (building.name || 'graph').toLowerCase().replace(/\s+/g, '_');
    downloadJson(data, `${safeName}_nav_graph.json`);
  };

  const handleImport = (raw: string) => {
    const parsed = parseImportJson(raw);
    if (!parsed) { alert('Invalid JSON — could not parse navigation graph.'); return; }
    importState({
      nodes: parsed.nodes,
      edges: parsed.edges,
      building: parsed.building,
      createdAt: new Date().toISOString(),
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setHighlightedPath([]);
    setValidationResult(null);
  };

  const handleValidate = () => {
    setValidationResult(validateGraph(nodes, edges));
  };

  const handleClear = () => {
    if (!confirm('Clear all nodes and edges?')) return;
    clearGraph();
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setHighlightedPath([]);
    setValidationResult(null);
    setConnectingFromId(null);
  };

  const handleImageUpload = (src: string) => {
    setImageSrc(src);
  };

  // ─── Pathfinding ──────────────────────────────────────────────────────────

  const handleFindPath = useCallback((startId: string, goalId: string) => {
    return dijkstra(nodes, edges, startId, goalId);
  }, [nodes, edges]);

  // ─── Sidebar wiring ───────────────────────────────────────────────────────

  const handleUpdateNode = (id: string, patch: Partial<NavNode>) => {
    updateNode(id, patch);
  };

  const handleDeleteNode = (id: string) => {
    deleteNode(id);
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleUpdateEdge = (id: string, patch: Partial<NavEdge>) => {
    updateEdge(id, patch);
  };

  const handleDeleteEdge = (id: string) => {
    deleteEdge(id);
    if (selectedEdgeId === id) setSelectedEdgeId(null);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#080a0f', fontFamily: 'IBM Plex Sans' }}>
      <Toolbar
        tool={tool}
        nodeType={nodeType}
        onToolChange={handleToolChange}
        onNodeTypeChange={setNodeType}
        onImageUpload={handleImageUpload}
        onExport={handleExport}
        onImport={handleImport}
        onClear={handleClear}
        onValidate={handleValidate}
      />

      <div className="flex flex-1 overflow-hidden">
        <FloorPlanCanvas
          nodes={nodes}
          edges={edges}
          imageSrc={imageSrc}
          tool={tool}
          nodeType={nodeType}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          connectingFromId={connectingFromId}
          highlightedPath={highlightedPath}
          simulationNodeId={simulationNodeId}
          onCanvasClick={handleCanvasClick}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onNodeDragEnd={handleNodeDragEnd}
          onConnectSecond={handleConnectSecond}
        />

        <Sidebar
          nodes={nodes}
          edges={edges}
          building={building}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          validationResult={validationResult}
          onSelectNode={id => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
          onSelectEdge={id => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
          onDeselectNode={() => setSelectedNodeId(null)}
          onDeselectEdge={() => setSelectedEdgeId(null)}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onUpdateEdge={handleUpdateEdge}
          onDeleteEdge={handleDeleteEdge}
          onUpdateBuilding={updateBuilding}
          onValidate={handleValidate}
          onFindPath={handleFindPath}
          onHighlightPath={setHighlightedPath}
          onSimulationNodeChange={setSimulationNodeId}
        />
      </div>
    </div>
  );
}
