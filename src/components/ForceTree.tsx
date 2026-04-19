import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { GitBranchPlus, GitBranch } from 'lucide-react';

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
  isDeleteMode?: boolean;
}

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

function assignDepths(node: TreeNode, depth = 0, depthMap = new Map<string, number>()) {
  depthMap.set(node.fen, depth);
  for (const child of node.children) assignDepths(child, depth + 1, depthMap);
  return depthMap;
}

export default function ForceTree({ data, currentFen, onNodeClick, isDeleteMode }: ForceTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const activePath = useMemo(() => pathToNode(data, currentFen), [data, currentFen]);

  const draw = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const nodes: any[] = [];
    const links: any[] = [];
    const depthMap = assignDepths(data);
    const tempNodesMap = new Map();

    function buildGraph(node: TreeNode, parentFen: string | null = null) {
      const depth = depthMap.get(node.fen) ?? 0;
      const onPath = activePath.has(node.fen);
      const isVisible = !focusMode || onPath || (parentFen && activePath.has(parentFen));

      if (isVisible) {
        if (!tempNodesMap.has(node.fen)) {
          const n = { id: node.fen, fen: node.fen, move: node.move ?? 'Start', isPending: !!node.isPending, depth, onPath };
          tempNodesMap.set(node.fen, n);
          nodes.push(n);
        }
        if (parentFen && tempNodesMap.has(parentFen)) {
          links.push({ source: parentFen, target: node.fen, isPending: !!node.isPending, onPath: onPath && activePath.has(parentFen) });
        }
      }
      for (const child of node.children) buildGraph(child, node.fen);
    }
    buildGraph(data);

    const el = svgRef.current;
    const containerWidth = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;
    const maxDepth = Math.max(1, ...nodes.map(n => n.depth));

    // Widen the horizontal space: at least 200px per depth
    const totalWidth = Math.max(containerWidth, (maxDepth + 1) * 200);

    const svg = d3.select(el)
      .attr('width', totalWidth)
      .attr('height', height);
    svg.selectAll('*').remove();
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 5]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    // Apply the current transform to the new group to prevent reset/snapback
    const currentTransform = d3.zoomTransform(el);
    g.attr('transform', currentTransform.toString());

    const centerNode = (d: any) => {
      const scale = d3.zoomTransform(el).k || 1;
      const x = -d.x * scale + containerWidth / 2;
      const y = -d.y * scale + height / 2;
      svg.transition().duration(600).ease(d3.easeCubicOut).call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    };

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(120).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-500).distanceMax(400))
      // Spread nodes horizontally by depth
      .force('x', d3.forceX((d: any) => (d.depth * 200) + 100).strength(1))
      .force('y', d3.forceY(height / 2).strength(0.1))
      .force('collision', d3.forceCollide(45))
      .alphaDecay(0.04);

    const rootNode = nodes.find(n => n.depth === 0);
    if (rootNode) { rootNode.fx = 100; rootNode.fy = height / 2; }

    const link = g.append('g').selectAll('line').data(links).enter().append('line')
      .attr('stroke', (d: any) => d.onPath ? 'white' : d.isPending ? '#f59e0b' : 'var(--border-color-focus)')
      .attr('stroke-width', (d: any) => d.onPath ? 4 : 2)
      .attr('stroke-dasharray', (d: any) => d.isPending ? '6,4' : '0')
      .attr('stroke-opacity', (d: any) => d.onPath ? 1 : 0.4);

    const node = g.append('g').selectAll('g').data(nodes).enter().append('g')
      .style('cursor', isDeleteMode ? 'crosshair' : 'pointer')
      .on('click', (_e, d) => {
        centerNode(d);
        onNodeClick(d);
      })
      .on('mouseenter', (_e, d: any) => {
        if (isDeleteMode && d.depth > 0) {
          d3.select(_e.currentTarget).select('circle').transition().duration(200).attr('r', 15).attr('stroke', '#ef4444').attr('stroke-width', 3);
        }
      })
      .on('mouseleave', (_e, d: any) => {
        if (isDeleteMode && d.depth > 0) {
          const isCurrent = d.fen === currentFen;
          d3.select(_e.currentTarget).select('circle').transition().duration(200)
            .attr('r', isCurrent ? 12 : 8)
            .attr('stroke', d.onPath ? 'white' : 'var(--accent-color)')
            .attr('stroke-width', d.onPath ? 3 : 2);
        }
      });

    node.append('circle').attr('r', (d: any) => d.fen === currentFen ? 12 : 8)
      .attr('fill', (d: any) => d.fen === currentFen ? 'var(--accent-color)' : d.onPath ? 'white' : 'var(--panel-bg)')
      .attr('stroke', (d: any) => d.onPath ? 'white' : 'var(--accent-color)')
      .attr('stroke-width', (d: any) => d.onPath ? 3 : 2);

    node.append('text').text((d: any) => d.move ?? '').attr('dx', 0).attr('dy', -20)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12).attr('font-weight', (d: any) => d.onPath ? 'bold' : 'normal')
      .attr('fill', '#fda4af').attr('pointer-events', 'none');

    node.call(d3.drag<SVGGElement, any>()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; if (rootNode) { rootNode.fx = 100; rootNode.fy = height / 2; } })
    );

    simulation.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y).attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [data, currentFen, focusMode, activePath, onNodeClick, isDeleteMode]);

  useEffect(() => {
    return draw();
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '0.5rem', zIndex: 20 }}>
        <button 
          onClick={() => setFocusMode(f => !f)} 
          className="btn btn-secondary"
          data-tooltip={focusMode ? "Show All Branches" : "Focus Current Branch"}
          style={{ 
            padding: 0, 
            width: 36, 
            height: 36, 
            background: focusMode ? 'white' : 'rgba(0,0,0,0.5)', 
            color: focusMode ? '#000' : '#fff', 
            border: '1px solid var(--border-color)', 
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {focusMode ? <GitBranchPlus size={20} /> : <GitBranch size={20} />}
        </button>
      </div>
      <svg ref={svgRef} style={{ display: 'block' }} />
      {isDeleteMode && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)' }}>
          DELETE MODE ACTIVE: CLICK A BRANCH TO REMOVE IT
        </div>
      )}
    </div>
  );
}
