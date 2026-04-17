import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';

export interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
  isPending?: boolean;
}

interface ForceTreeProps {
  data: TreeNode;
  currentFen: string;
  onNodeClick: (node: any) => void;
}

// Compute the path (list of FENs) from root to a given FEN
function pathToNode(root: TreeNode, targetFen: string): Set<string> {
  const path: string[] = [];
  function dfs(node: TreeNode): boolean {
    path.push(node.fen);
    if (node.fen === targetFen) return true;
    for (const child of node.children) {
      if (dfs(child)) return true;
    }
    path.pop();
    return false;
  }
  dfs(root);
  return new Set(path);
}

// Assign depth levels for a tree-like x-force
function assignDepths(node: TreeNode, depth = 0, depthMap = new Map<string, number>()) {
  depthMap.set(node.fen, depth);
  for (const child of node.children) assignDepths(child, depth + 1, depthMap);
  return depthMap;
}

export default function ForceTree({ data, currentFen, onNodeClick }: ForceTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusMode, setFocusMode] = useState(false);

  // Memoized path calculation for performance
  const activePath = useMemo(() => pathToNode(data, currentFen), [data, currentFen]);

  const draw = useCallback(() => {
    if (!data || !svgRef.current) return;

    const nodes: any[] = [];
    const links: any[] = [];
    const depthMap = assignDepths(data);

    // Flatten and build graph nodes/links
    const tempNodesMap = new Map();
    function buildGraph(node: TreeNode, parentFen: string | null = null) {
      const depth = depthMap.get(node.fen) ?? 0;
      const onPath = activePath.has(node.fen);
      const isVisible = !focusMode || onPath || (parentFen && activePath.has(parentFen));

      if (isVisible) {
        if (!tempNodesMap.has(node.fen)) {
          const n = {
            id: node.fen, 
            fen: node.fen,
            move: node.move ?? 'Start',
            isPending: node.isPending ?? false,
            depth,
            onPath,
          };
          tempNodesMap.set(node.fen, n);
          nodes.push(n);
        }

        if (parentFen && tempNodesMap.has(parentFen)) {
          links.push({
            source: parentFen,
            target: node.fen,
            isPending: node.isPending ?? false,
            onPath: onPath && activePath.has(parentFen)
          });
        }
      }

      for (const child of node.children) {
        buildGraph(child, node.fen);
      }
    }
    buildGraph(data);

    const el = svgRef.current;
    const width = el.clientWidth || 600;
    const height = el.clientHeight || 500;
    const maxDepth = Math.max(1, ...nodes.map(n => n.depth));

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on('zoom', event => g.attr('transform', event.transform));
    svg.call(zoom);

    const g = svg.append('g');

    // ── Force simulation: Hierarchical Root-like Structure ──────────────────
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100).strength(1))
      .force('charge', d3.forceManyBody().strength(-400).distanceMax(300))
      // Stable horizontal layout: root on left, leaves on right
      .force('x', d3.forceX((d: any) => (d.depth / (maxDepth || 1)) * (width * 0.8) + width * 0.1).strength(0.8))
      // Spread vertically
      .force('y', d3.forceY(height / 2).strength(0.1))
      .force('collision', d3.forceCollide(35))
      .alphaDecay(0.05)
      .velocityDecay(0.4);

    // Root is fixed to stay on the left side
    const rootNode = nodes.find(n => n.depth === 0);
    if (rootNode) { 
      rootNode.fx = width * 0.1; 
      rootNode.fy = height / 2; 
    }

    // Links: Thick white lines for the active path
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', (d: any) => {
        if (d.onPath) return 'rgba(255, 255, 255, 1)'; // Full white line
        if (d.isPending) return '#f59e0b';
        return 'var(--border-color-focus)';
      })
      .attr('stroke-width', (d: any) => d.onPath ? 4 : 2)
      .attr('stroke-dasharray', (d: any) => d.isPending ? '6,4' : '0')
      .attr('stroke-opacity', (d: any) => d.onPath ? 1 : 0.4);

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('cursor', 'pointer')
      .on('click', (_evt, d) => onNodeClick(d));

    node.append('circle')
      .attr('r', (d: any) => d.fen === currentFen ? 12 : 8)
      .attr('fill', (d: any) => {
        if (d.fen === currentFen) return 'var(--accent-color)';
        if (d.onPath) return 'white';
        return 'var(--panel-bg)';
      })
      .attr('stroke', (d: any) => {
        if (d.fen === currentFen) return 'white';
        if (d.onPath) return 'white';
        return 'var(--accent-color)';
      })
      .attr('stroke-width', (d: any) => d.onPath ? 3 : 2)
      .attr('filter', (d: any) => d.onPath ? 'drop-shadow(0 0 4px rgba(255,255,255,0.8))' : 'none');

    node.append('text')
      .text((d: any) => d.move ?? '')
      .attr('dx', 15)
      .attr('dy', 5)
      .attr('font-size', 12)
      .attr('font-weight', (d: any) => d.onPath ? 'bold' : 'normal')
      .attr('fill', (d: any) => d.onPath ? 'white' : 'var(--text-muted)')
      .attr('pointer-events', 'none');

    // Drag support
    node.call(d3.drag<SVGGElement, any>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        // Keep root fixed
        if (rootNode) { rootNode.fx = width * 0.1; rootNode.fy = height / 2; }
      })
    );

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [data, currentFen, focusMode, activePath, onNodeClick]);

  useEffect(() => {
    const cleanup = draw();
    return () => cleanup?.();
  }, [draw]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, zIndex: 20 }}>
        <button
          onClick={() => setFocusMode(f => !f)}
          style={{
            padding: '0.4rem 0.8rem',
            background: focusMode ? 'white' : 'rgba(0,0,0,0.5)',
            color: focusMode ? '#000' : '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.2s'
          }}
        >
          {focusMode ? 'SHOW ALL' : 'FOCUS BRANCH'}
        </button>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
