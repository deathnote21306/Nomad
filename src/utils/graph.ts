import type { NavNode, NavEdge, NodeType, EdgeType, ValidationResult } from '../types';
import {
  normalizedDistance,
  categoriseDistance,
  cardinalDirection,
  relativeDirection,
} from './geometry';

// ─── ID generation ────────────────────────────────────────────────────────────

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function generateNodeId(type: NodeType, name: string, existing: NavNode[]): string {
  const base = `${type}_${toSnakeCase(name)}`;
  const existingIds = new Set(existing.map(n => n.id));
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function generateEdgeId(fromId: string, toId: string, existing: NavEdge[]): string {
  const base = `edge_${fromId}_to_${toId}`;
  const existingIds = new Set(existing.map(e => e.id));
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

// ─── Edge type inference ───────────────────────────────────────────────────────

export function inferEdgeType(fromType: NodeType, toType: NodeType): EdgeType {
  const pair = `${fromType}>${toType}`;
  if (pair.includes('stairs'))   return 'stairs_connection';
  if (pair.includes('elevator')) return 'elevator_connection';
  if (pair.includes('exit'))     return 'exit_connection';
  if (pair.includes('door'))     return 'doorway_connection';
  if (fromType === 'hallway' || toType === 'hallway') return 'hallway_segment';
  return 'walkable_connection';
}

// ─── Instruction generation ───────────────────────────────────────────────────

export function generateInstruction(from: NavNode, to: NavNode): string {
  const fn = from.name || from.id;
  const tn = to.name || to.id;

  if (from.type === 'room'  && to.type === 'door')         return `Exit ${fn} through ${tn}.`;
  if (from.type === 'door'  && to.type === 'hallway')       return `Enter ${tn}.`;
  if (from.type === 'door'  && to.type === 'room')          return `Enter ${tn}.`;
  if (from.type === 'hallway' && to.type === 'intersection') return `Continue toward ${tn}.`;
  if (from.type === 'intersection' && to.type === 'hallway') return `Turn toward ${tn}.`;
  if (from.type === 'hallway' && to.type === 'room')         return `Continue until you reach ${tn}.`;
  if (from.type === 'hallway' && to.type === 'door')         return `Proceed to ${tn}.`;
  if (from.type === 'stairs' || to.type === 'stairs')        return `Use the stairs to continue to ${tn}.`;
  if (from.type === 'elevator' || to.type === 'elevator')    return `Use the elevator to continue to ${tn}.`;
  if (to.type === 'exit')                                    return `Proceed to ${tn} to exit the building.`;
  if (to.type === 'washroom')                                return `Continue to ${tn}.`;
  return `Proceed from ${fn} to ${tn}.`;
}

// ─── Auto-compute edge metadata ───────────────────────────────────────────────

export function computeEdgeMetadata(
  from: NavNode,
  to: NavNode,
  existing: NavEdge[]
): Omit<NavEdge, 'id' | 'from' | 'to' | 'notes' | 'expected_visual_landmarks'> {
  const dist = normalizedDistance(from, to);
  const cardinal = cardinalDirection(from, to);

  return {
    type: inferEdgeType(from.type, to.type),
    direction: {
      cardinal,
      relative: relativeDirection(cardinal),
      confidence: 0.8,
    },
    distance: {
      category: categoriseDistance(dist),
      relative_distance: Math.round(dist * 1000) / 1000,
    },
    instruction: generateInstruction(from, to),
    bidirectional: true,
    confidence: 1.0,
  };
}

// ─── Graph validation ─────────────────────────────────────────────────────────

export function validateGraph(nodes: NavNode[], edges: NavEdge[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const idCount = new Map<string, number>();

  // Duplicate node IDs
  for (const n of nodes) {
    idCount.set(n.id, (idCount.get(n.id) ?? 0) + 1);
  }
  for (const [id, count] of idCount.entries()) {
    if (count > 1) errors.push(`Duplicate node ID: "${id}" (${count} occurrences)`);
  }

  // Invalid coordinates
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) {
      errors.push(`Node "${n.id}" has missing coordinates.`);
    } else if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) {
      errors.push(`Node "${n.id}" has out-of-range coordinates (${n.x.toFixed(3)}, ${n.y.toFixed(3)}).`);
    }
  }

  // Edges pointing to missing nodes
  for (const e of edges) {
    if (!e.from || !e.to) {
      errors.push(`Edge "${e.id}" is missing from/to fields.`);
      continue;
    }
    if (!nodeMap.has(e.from)) errors.push(`Edge "${e.id}" references missing node "${e.from}".`);
    if (!nodeMap.has(e.to))   errors.push(`Edge "${e.id}" references missing node "${e.to}".`);
  }

  // Missing instructions
  for (const e of edges) {
    if (!e.instruction || e.instruction.trim() === '') {
      warnings.push(`Edge "${e.id}" has no instruction text.`);
    }
  }

  // Node connectivity
  const connectedNodeIds = new Set<string>();
  for (const e of edges) {
    connectedNodeIds.add(e.from);
    connectedNodeIds.add(e.to);
  }

  for (const n of nodes) {
    if (!connectedNodeIds.has(n.id)) {
      if (n.type === 'room' || n.type === 'hallway') {
        warnings.push(`Node "${n.name || n.id}" (${n.type}) has no edges — isolated.`);
      }
      if (n.type === 'stairs' || n.type === 'elevator') {
        warnings.push(`${n.type} "${n.name || n.id}" is not connected to anything.`);
      }
    }
  }

  // Rooms not connected to doors or hallways
  for (const n of nodes) {
    if (n.type !== 'room') continue;
    const roomEdges = edges.filter(e => e.from === n.id || e.to === n.id);
    const neighbours = roomEdges.map(e => nodeMap.get(e.from === n.id ? e.to : e.from));
    const hasDoorOrHallway = neighbours.some(nb => nb && (nb.type === 'door' || nb.type === 'hallway' || nb.type === 'intersection'));
    if (!hasDoorOrHallway && roomEdges.length > 0) {
      suggestions.push(`Room "${n.name || n.id}" is not connected to a door or hallway.`);
    }
  }

  if (nodes.length === 0) suggestions.push('No nodes yet — upload a floor plan and start annotating.');
  if (edges.length === 0 && nodes.length > 1) suggestions.push('No edges yet — switch to Connect mode to link nodes.');

  return { errors, warnings, suggestions };
}
