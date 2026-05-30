import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { NavNode, NavEdge, ToolMode, NodeType } from '../types';
import { NODE_COLORS } from '../types';

interface Props {
  nodes: NavNode[];
  edges: NavEdge[];
  imageSrc: string | null;
  tool: ToolMode;
  nodeType: NodeType;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectingFromId: string | null;
  highlightedPath: string[];
  simulationNodeId: string | null;
  onCanvasClick: (x: number, y: number) => void;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
  onNodeDragEnd: (id: string, x: number, y: number) => void;
  onConnectSecond: (id: string) => void;
}

interface ViewBox { x: number; y: number; w: number; h: number }

const MIN_ZOOM_FACTOR = 0.05; // 5% of natural size
const MAX_ZOOM_FACTOR = 20;

// Node visual sizes — absolute SVG units, scaled to image width
const nodeRadius = (imgW: number) => imgW * 0.013;
const nodeFontSize = (imgW: number) => imgW * 0.016;
const edgeStrokeWidth = (imgW: number) => imgW * 0.004;
const labelOffset = (imgW: number) => imgW * 0.018;

function NodeMarker({
  node, imgW, isSelected, isConnectingFrom, isInPath,
  tool, onClick, onDragEnd,
}: {
  node: NavNode; imgW: number;
  isSelected: boolean; isConnectingFrom: boolean; isInPath: boolean;
  tool: ToolMode;
  onClick: (e: React.MouseEvent) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGGElement>(null);
  const dragging = useRef(false);
  const svgEl = useRef<SVGSVGElement | null>(null);

  const cx = node.x * imgW;
  const cy = node.y * imgW; // use imgW for both to keep aspect; actual y = node.y * imgH
  // We use separate: cx = node.x * imgW, cy = node.y * imgH — handled by caller placing SVG
  const color = NODE_COLORS[node.type];
  const r = nodeRadius(imgW);
  const fs = nodeFontSize(imgW);
  const lo = labelOffset(imgW);

  // Drag handling via SVG pointer events
  const handlePointerDown = (e: React.PointerEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);

    // Find parent SVG
    let el = e.currentTarget as Element;
    while (el && el.tagName !== 'svg') el = el.parentElement!;
    svgEl.current = el as SVGSVGElement;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !svgEl.current) return;
    e.stopPropagation();
    const pt = svgEl.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svgEl.current.getScreenCTM()!.inverse());
    onDragEnd(sp.x / imgW, sp.y / (imgW * (1 / 1))); // provisional — finalised on pointerup
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.current || !svgEl.current) return;
    e.stopPropagation();
    dragging.current = false;
    const pt = svgEl.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svgEl.current.getScreenCTM()!.inverse());
    onDragEnd(sp.x / imgW, sp.y / imgW);
  };

  const ringOpacity = isSelected ? 1 : isConnectingFrom ? 0.8 : isInPath ? 0.6 : 0;
  const ringColor   = isConnectingFrom ? '#fbbf24' : isInPath ? '#34d399' : '#22d3ee';

  return (
    <g
      ref={svgRef}
      style={{ cursor: tool === 'select' ? 'grab' : tool === 'delete' ? 'not-allowed' : 'pointer' }}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Selection / connecting / path ring */}
      {ringOpacity > 0 && (
        <circle cx={0} cy={0} r={r * 1.7} fill="none" stroke={ringColor} strokeWidth={r * 0.25} opacity={ringOpacity} />
      )}
      {/* Main circle */}
      <circle cx={0} cy={0} r={r} fill={color} stroke="#080a0f" strokeWidth={r * 0.2}
        opacity={node.type === 'obstacle_zone' ? 0.5 : 0.95}
      />
      {/* Label */}
      <text
        x={r + lo * 0.4} y={0}
        fontSize={fs} fill="#f0f4ff"
        dominantBaseline="middle"
        style={{ fontFamily: 'DM Mono, monospace', pointerEvents: 'none', userSelect: 'none' }}
        stroke="#080a0f" strokeWidth={fs * 0.12} paintOrder="stroke"
      >
        {node.name || node.id}
      </text>
    </g>
  );
}

export default function FloorPlanCanvas({
  nodes, edges, imageSrc, tool, nodeType,
  selectedNodeId, selectedEdgeId, connectingFromId, highlightedPath, simulationNodeId,
  onCanvasClick, onNodeClick, onEdgeClick, onNodeDragEnd, onConnectSecond,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [imgSize, setImgSize] = useState({ w: 1600, h: 900 });
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: 1600, h: 900 });

  // Pan state
  const isPanning = useRef(false);
  const panStart  = useRef({ clientX: 0, clientY: 0, vbX: 0, vbY: 0 });

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1600;
      const h = img.naturalHeight || 900;
      setImgSize({ w, h });
      setViewBox({ x: 0, y: 0, w, h });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const getSVGPoint = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
  }, []);

  // ── Zoom on wheel ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
      const cursor = getSVGPoint(e.clientX, e.clientY);
      setViewBox(prev => {
        const minW = imgSize.w * MIN_ZOOM_FACTOR;
        const maxW = imgSize.w * MAX_ZOOM_FACTOR;
        const newW = Math.min(Math.max(prev.w * factor, minW), maxW);
        const newH = newW * (prev.h / prev.w);
        const af = newW / prev.w;
        return {
          x: cursor.x - (cursor.x - prev.x) * af,
          y: cursor.y - (cursor.y - prev.y) * af,
          w: newW, h: newH,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [getSVGPoint, imgSize]);

  // ── Pan via middle-mouse or space+drag ────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = {
        clientX: e.clientX, clientY: e.clientY,
        vbX: viewBox.x, vbY: viewBox.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    setViewBox(prev => ({
      ...prev,
      x: panStart.current.vbX - (e.clientX - panStart.current.clientX) * scaleX,
      y: panStart.current.vbY - (e.clientY - panStart.current.clientY) * scaleY,
    }));
  };

  const handleMouseUp = () => { isPanning.current = false; };

  // ── Canvas click (add node / background click) ────────────────────────────
  const handleSVGClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target !== svgRef.current && (e.target as Element).tagName === 'image') {
      // clicked on the background image
    } else if ((e.target as Element).tagName !== 'image' && (e.target as Element) !== svgRef.current) {
      return; // clicked on a node/edge, not handled here
    }
    if (isPanning.current) return;
    const sp = getSVGPoint(e.clientX, e.clientY);
    onCanvasClick(sp.x / imgSize.w, sp.y / imgSize.h);
  };

  const cursorClass = {
    select:   'cursor-default',
    add_node: 'cursor-crosshair',
    connect:  'cursor-cell',
    delete:   'cursor-not-allowed',
  }[tool];

  // ── Render ────────────────────────────────────────────────────────────────
  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;
  const imgW = imgSize.w;
  const imgH = imgSize.h;
  const sw = edgeStrokeWidth(imgW);
  const pathSet = new Set(highlightedPath);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build path edge set
  const pathEdgeIds = new Set<string>();
  for (let i = 0; i < highlightedPath.length - 1; i++) {
    const a = highlightedPath[i], b = highlightedPath[i + 1];
    edges.forEach(e => {
      if ((e.from === a && e.to === b) || (e.bidirectional && e.from === b && e.to === a)) {
        pathEdgeIds.add(e.id);
      }
    });
  }

  const placeholder = !imageSrc;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-canvas ${cursorClass}`}
      style={{ background: '#080a0f' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {placeholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none"
          style={{ color: '#1e2a3d' }}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <rect x="4" y="4" width="72" height="72" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4"/>
            <path d="M20 40h40M40 20v40" stroke="currentColor" strokeWidth="2"/>
            <circle cx="40" cy="40" r="6" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, letterSpacing: '0.08em', color: '#2d3f5a' }}>
            UPLOAD A FLOOR PLAN TO BEGIN
          </p>
        </div>
      )}

      {/* Dot-grid background */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <defs>
          <pattern id="dotgrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="#1a2035"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)"/>
      </svg>

      <svg
        ref={svgRef}
        width="100%" height="100%"
        viewBox={vbStr}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleSVGClick}
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        {/* Floor plan image */}
        {imageSrc && (
          <image
            href={imageSrc}
            x={0} y={0}
            width={imgW} height={imgH}
            preserveAspectRatio="xMinYMin meet"
            style={{ opacity: 0.92 }}
          />
        )}

        {/* Edges */}
        {edges.map(edge => {
          const from = nodeMap.get(edge.from);
          const to   = nodeMap.get(edge.to);
          if (!from || !to) return null;

          const isSelected = edge.id === selectedEdgeId;
          const isPath     = pathEdgeIds.has(edge.id);
          const stroke     = isPath ? '#34d399' : isSelected ? '#22d3ee' : '#4a7fa5';
          const strokeW    = isPath ? sw * 2.5 : isSelected ? sw * 2 : sw;
          const opacity    = isSelected || isPath ? 1 : 0.6;

          const x1 = from.x * imgW, y1 = from.y * imgH;
          const x2 = to.x * imgW,   y2 = to.y * imgH;
          const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;

          return (
            <g key={edge.id} style={{ cursor: 'pointer' }}
              onClick={ev => { ev.stopPropagation(); onEdgeClick(edge.id, ev); }}>
              {/* Invisible fat hit area */}
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="transparent" strokeWidth={sw * 8} />
              {/* Visible line */}
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={stroke} strokeWidth={strokeW} opacity={opacity}
                strokeDasharray={edge.type === 'stairs_connection' || edge.type === 'elevator_connection' ? `${sw * 4} ${sw * 2}` : undefined}
              />
              {/* Direction arrow */}
              {!edge.bidirectional && (
                <polygon
                  points={`${midX},${midY - sw * 2} ${midX + sw * 2},${midY + sw * 1.5} ${midX - sw * 2},${midY + sw * 1.5}`}
                  fill={stroke} opacity={opacity}
                  transform={`rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 90}, ${midX}, ${midY})`}
                />
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const cx = node.x * imgW;
          const cy = node.y * imgH;
          const isConnectTarget = connectingFromId !== null && connectingFromId !== node.id;

          return (
            <g key={node.id} transform={`translate(${cx}, ${cy})`}>
              {/* Highlight ring for connect targets */}
              {isConnectTarget && tool === 'connect' && (
                <circle cx={0} cy={0} r={nodeRadius(imgW) * 2.2} fill="none"
                  stroke="#fbbf24" strokeWidth={nodeRadius(imgW) * 0.2} strokeDasharray={`${nodeRadius(imgW)} ${nodeRadius(imgW) * 0.5}`} opacity={0.5}
                />
              )}
              <NodeMarker
                node={node}
                imgW={imgW}
                isSelected={node.id === selectedNodeId}
                isConnectingFrom={node.id === connectingFromId}
                isInPath={pathSet.has(node.id)}
                tool={tool}
                onClick={ev => {
                  ev.stopPropagation();
                  if (tool === 'connect' && connectingFromId) {
                    onConnectSecond(node.id);
                  } else {
                    onNodeClick(node.id, ev);
                  }
                }}
                onDragEnd={(nx, ny) => {
                  // ny is currently nx * (imgH/imgW), fix it:
                  const realY = ny * imgW / imgH;
                  onNodeDragEnd(node.id,
                    Math.max(0, Math.min(1, nx)),
                    Math.max(0, Math.min(1, realY))
                  );
                }}
              />
            </g>
          );
        })}

        {/* Simulation current-position indicator */}
        {simulationNodeId && (() => {
          const n = nodeMap.get(simulationNodeId);
          if (!n) return null;
          const cx = n.x * imgW, cy = n.y * imgH;
          const r = nodeRadius(imgW);
          return (
            <g key="sim-pos" transform={`translate(${cx}, ${cy})`} style={{ pointerEvents: 'none' }}>
              <circle cx={0} cy={0} r={r * 3.2} fill="none" stroke="#22d3ee" strokeWidth={r * 0.25} className="sim-ping"/>
              <circle cx={0} cy={0} r={r * 2.2} fill="none" stroke="#22d3ee" strokeWidth={r * 0.15} className="sim-ping" style={{ animationDelay: '0.4s' }}/>
            </g>
          );
        })()}

        {/* Pathfinding path order numbers */}
        {highlightedPath.map((id, i) => {
          const node = nodeMap.get(id);
          if (!node) return null;
          const cx = node.x * imgW;
          const cy = node.y * imgH;
          const r  = nodeRadius(imgW);
          return (
            <g key={`pnum-${id}`} transform={`translate(${cx - r * 1.2}, ${cy - r * 1.2})`} style={{ pointerEvents: 'none' }}>
              <circle cx={0} cy={0} r={r * 0.7} fill="#34d399"/>
              <text x={0} y={0} textAnchor="middle" dominantBaseline="middle"
                fontSize={r * 0.9} fill="#080a0f"
                style={{ fontFamily: 'DM Mono', fontWeight: 500 }}>
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1" style={{ zIndex: 10 }}>
        {[
          { label: '+', action: () => setViewBox(p => ({ ...p, w: p.w * 0.7, h: p.h * 0.7 })), tip: 'Zoom in' },
          { label: '⟳', action: () => imageSrc && setViewBox({ x: 0, y: 0, w: imgW, h: imgH }), tip: 'Reset view' },
          { label: '−', action: () => setViewBox(p => ({ ...p, w: p.w * 1.4, h: p.h * 1.4 })), tip: 'Zoom out' },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} data-tooltip={btn.tip}
            className="w-8 h-8 rounded flex items-center justify-center text-sm font-mono transition-colors"
            style={{ background: '#161b2e', border: '1px solid #1e2a3d', color: '#8892a8' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#22d3ee')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8892a8')}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Mode hint */}
      {tool !== 'select' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded text-xs font-mono"
          style={{ background: '#161b2ecc', border: '1px solid #1e2a3d', color: '#8892a8', backdropFilter: 'blur(4px)' }}>
          {tool === 'add_node' && `Click to place ${nodeType.replace('_', ' ')}`}
          {tool === 'connect' && !connectingFromId && 'Click a node to start connecting'}
          {tool === 'connect' && connectingFromId && 'Click a second node to create edge'}
          {tool === 'delete' && 'Click a node or edge to delete it'}
        </div>
      )}
    </div>
  );
}
