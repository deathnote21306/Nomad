import type { NavNode, NavEdge, PathResult } from '../types';

interface AdjEntry {
  nodeId: string;
  edgeId: string;
  distance: number;
  instruction: string;
}

function buildAdjacency(nodes: NavNode[], edges: NavEdge[]): Map<string, AdjEntry[]> {
  const adj = new Map<string, AdjEntry[]>();
  for (const n of nodes) adj.set(n.id, []);

  for (const e of edges) {
    const from = adj.get(e.from);
    const to   = adj.get(e.to);
    const dist = e.distance?.relative_distance ?? 0.1;

    if (from) from.push({ nodeId: e.to, edgeId: e.id, distance: dist, instruction: e.instruction });
    if (e.bidirectional && to) {
      to.push({ nodeId: e.from, edgeId: e.id, distance: dist, instruction: e.instruction });
    }
  }
  return adj;
}

/** Dijkstra — returns ordered node IDs + instructions, or null if no path */
export function dijkstra(
  nodes: NavNode[],
  edges: NavEdge[],
  startId: string,
  goalId: string
): PathResult | null {
  const adj = buildAdjacency(nodes, edges);

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const prevInstruction = new Map<string, string>();
  const visited = new Set<string>();

  for (const n of nodes) dist.set(n.id, Infinity);
  dist.set(startId, 0);
  prev.set(startId, null);

  // Simple priority queue via sorted array (fine for small graphs)
  const pq: { id: string; d: number }[] = [{ id: startId, d: 0 }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const { id: u } = pq.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === goalId) break;

    for (const { nodeId: v, distance: w, instruction } of adj.get(u) ?? []) {
      const alt = (dist.get(u) ?? Infinity) + w;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
        prevInstruction.set(v, instruction);
        pq.push({ id: v, d: alt });
      }
    }
  }

  if ((dist.get(goalId) ?? Infinity) === Infinity) return null;

  // Reconstruct path
  const nodeIds: string[] = [];
  const instructions: string[] = [];
  let cur: string | null | undefined = goalId;
  while (cur != null) {
    nodeIds.unshift(cur);
    const instr = prevInstruction.get(cur);
    if (instr) instructions.unshift(instr);
    cur = prev.get(cur);
  }

  return { nodeIds, instructions, totalDistance: dist.get(goalId) ?? 0 };
}
