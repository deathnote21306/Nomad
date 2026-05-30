export type NodeType =
  | 'room'
  | 'door'
  | 'hallway'
  | 'intersection'
  | 'stairs'
  | 'elevator'
  | 'exit'
  | 'washroom'
  | 'landmark'
  | 'obstacle_zone';

export type EdgeType =
  | 'walkable_connection'
  | 'doorway_connection'
  | 'hallway_segment'
  | 'stairs_connection'
  | 'elevator_connection'
  | 'exit_connection';

export type ToolMode = 'select' | 'add_node' | 'connect' | 'delete';

export interface NavNode {
  id: string;
  type: NodeType;
  name: string;
  x: number; // normalized 0–1 (left = 0)
  y: number; // normalized 0–1 (top = 0)
  floor: string;
  notes: string;
  visual_landmarks: string[];
  confidence: number;
}

export interface DirectionInfo {
  cardinal: string;
  relative: string;
  confidence: number;
}

export interface DistanceInfo {
  category: 'short' | 'medium' | 'long';
  relative_distance: number;
}

export interface NavEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  direction: DirectionInfo;
  distance: DistanceInfo;
  instruction: string;
  expected_visual_landmarks: string[];
  bidirectional: boolean;
  confidence: number;
  notes: string;
}

export interface BuildingInfo {
  name: string;
  floor: string;
  source_image: string;
  notes: string[];
}

export interface ExportGraph {
  building: BuildingInfo & {
    coordinate_system: {
      type: string;
      x_range: [number, number];
      y_range: [number, number];
      origin: string;
    };
  };
  nodes: NavNode[];
  edges: NavEdge[];
  metadata: {
    created_at: string;
    updated_at: string;
    version: string;
  };
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface PathResult {
  nodeIds: string[];
  instructions: string[];
  totalDistance: number;
}

// Colour / visual metadata by node type
export const NODE_COLORS: Record<NodeType, string> = {
  room:          '#3b82f6',
  door:          '#a78bfa',
  hallway:       '#6b7280',
  intersection:  '#f59e0b',
  stairs:        '#ef4444',
  elevator:      '#10b981',
  exit:          '#f97316',
  washroom:      '#06b6d4',
  landmark:      '#ec4899',
  obstacle_zone: '#b91c1c',
};

export const NODE_LABELS: Record<NodeType, string> = {
  room:          'Room',
  door:          'Door',
  hallway:       'Hallway',
  intersection:  'Intersection',
  stairs:        'Stairs',
  elevator:      'Elevator',
  exit:          'Exit',
  washroom:      'Washroom',
  landmark:      'Landmark',
  obstacle_zone: 'Obstacle Zone',
};

export const EDGE_LABELS: Record<EdgeType, string> = {
  walkable_connection:  'Walkable',
  doorway_connection:   'Doorway',
  hallway_segment:      'Hallway Segment',
  stairs_connection:    'Stairs',
  elevator_connection:  'Elevator',
  exit_connection:      'Exit',
};

export const NODE_ICONS: Record<NodeType, string> = {
  room:          '▪',
  door:          '🚪',
  hallway:       '━',
  intersection:  '✦',
  stairs:        '↕',
  elevator:      '⬆',
  exit:          '⬛',
  washroom:      '🚿',
  landmark:      '◆',
  obstacle_zone: '⚠',
};
