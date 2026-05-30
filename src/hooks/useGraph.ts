import { useReducer, useCallback, useEffect } from 'react';
import type { NavNode, NavEdge, BuildingInfo, NodeType, EdgeType } from '../types';
import { generateNodeId, generateEdgeId, computeEdgeMetadata } from '../utils/graph';

const STORAGE_KEY = 'floorplan_graph_v1';

interface GraphState {
  nodes: NavNode[];
  edges: NavEdge[];
  building: BuildingInfo;
  createdAt: string;
}

type Action =
  | { type: 'ADD_NODE'; payload: NavNode }
  | { type: 'UPDATE_NODE'; id: string; patch: Partial<NavNode> }
  | { type: 'DELETE_NODE'; id: string }
  | { type: 'ADD_EDGE'; payload: NavEdge }
  | { type: 'UPDATE_EDGE'; id: string; patch: Partial<NavEdge> }
  | { type: 'DELETE_EDGE'; id: string }
  | { type: 'UPDATE_BUILDING'; patch: Partial<BuildingInfo> }
  | { type: 'IMPORT'; state: GraphState }
  | { type: 'CLEAR' };

const defaultBuilding: BuildingInfo = { name: '', floor: '1', source_image: '', notes: [] };

function reducer(state: GraphState, action: Action): GraphState {
  switch (action.type) {
    case 'ADD_NODE':
      return { ...state, nodes: [...state.nodes, action.payload] };

    case 'UPDATE_NODE':
      return {
        ...state,
        nodes: state.nodes.map(n => n.id === action.id ? { ...n, ...action.patch } : n),
      };

    case 'DELETE_NODE':
      return {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.id),
        edges: state.edges.filter(e => e.from !== action.id && e.to !== action.id),
      };

    case 'ADD_EDGE':
      return { ...state, edges: [...state.edges, action.payload] };

    case 'UPDATE_EDGE':
      return {
        ...state,
        edges: state.edges.map(e => e.id === action.id ? { ...e, ...action.patch } : e),
      };

    case 'DELETE_EDGE':
      return { ...state, edges: state.edges.filter(e => e.id !== action.id) };

    case 'UPDATE_BUILDING':
      return { ...state, building: { ...state.building, ...action.patch } };

    case 'IMPORT':
      return action.state;

    case 'CLEAR':
      return { nodes: [], edges: [], building: defaultBuilding, createdAt: new Date().toISOString() };

    default:
      return state;
  }
}

function loadFromStorage(): GraphState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GraphState;
  } catch { return null; }
}

function getInitialState(): GraphState {
  return loadFromStorage() ?? {
    nodes: [],
    edges: [],
    building: defaultBuilding,
    createdAt: new Date().toISOString(),
  };
}

export function useGraph() {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);

  // Persist to localStorage on every state change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  }, [state]);

  const addNode = useCallback((
    x: number, y: number,
    type: NodeType, name: string,
    floor: string
  ): NavNode => {
    const id = generateNodeId(type, name, state.nodes);
    const node: NavNode = {
      id, type, name, x, y, floor,
      notes: '',
      visual_landmarks: [],
      confidence: 1.0,
    };
    dispatch({ type: 'ADD_NODE', payload: node });
    return node;
  }, [state.nodes]);

  const updateNode = useCallback((id: string, patch: Partial<NavNode>) => {
    dispatch({ type: 'UPDATE_NODE', id, patch });
  }, []);

  const deleteNode = useCallback((id: string) => {
    dispatch({ type: 'DELETE_NODE', id });
  }, []);

  const addEdge = useCallback((fromId: string, toId: string): NavEdge | null => {
    const fromNode = state.nodes.find(n => n.id === fromId);
    const toNode   = state.nodes.find(n => n.id === toId);
    if (!fromNode || !toNode) return null;

    // Prevent duplicate edges
    const exists = state.edges.some(
      e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
    );
    if (exists) return null;

    const id = generateEdgeId(fromId, toId, state.edges);
    const meta = computeEdgeMetadata(fromNode, toNode, state.edges);
    const edge: NavEdge = {
      id, from: fromId, to: toId,
      ...meta,
      notes: '',
      expected_visual_landmarks: [],
    };
    dispatch({ type: 'ADD_EDGE', payload: edge });
    return edge;
  }, [state.nodes, state.edges]);

  const updateEdge = useCallback((id: string, patch: Partial<NavEdge>) => {
    dispatch({ type: 'UPDATE_EDGE', id, patch });
  }, []);

  const deleteEdge = useCallback((id: string) => {
    dispatch({ type: 'DELETE_EDGE', id });
  }, []);

  const updateBuilding = useCallback((patch: Partial<BuildingInfo>) => {
    dispatch({ type: 'UPDATE_BUILDING', patch });
  }, []);

  const importState = useCallback((s: GraphState) => {
    dispatch({ type: 'IMPORT', state: s });
  }, []);

  const clearGraph = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return {
    nodes: state.nodes,
    edges: state.edges,
    building: state.building,
    createdAt: state.createdAt,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    updateEdge,
    deleteEdge,
    updateBuilding,
    importState,
    clearGraph,
  };
}
