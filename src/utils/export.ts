import type { NavNode, NavEdge, BuildingInfo, ExportGraph } from '../types';

export function buildExportJson(
  nodes: NavNode[],
  edges: NavEdge[],
  building: BuildingInfo,
  createdAt: string
): ExportGraph {
  return {
    building: {
      ...building,
      coordinate_system: {
        type: 'normalized_image_coordinates',
        x_range: [0, 1],
        y_range: [0, 1],
        origin: 'top_left',
      },
    },
    nodes,
    edges,
    metadata: {
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      version: '0.1',
    },
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportJson(raw: string): {
  nodes: NavNode[];
  edges: NavEdge[];
  building: BuildingInfo;
} | null {
  try {
    const data = JSON.parse(raw) as ExportGraph;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const edges = Array.isArray(data.edges) ? data.edges : [];
    const building: BuildingInfo = data.building ?? { name: '', floor: '', source_image: '', notes: [] };
    return { nodes, edges, building };
  } catch {
    return null;
  }
}
