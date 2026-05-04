import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { GitBranchPlus, GitBranch, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Info, X, Navigation } from 'lucide-react';
import TooltipButton from './TooltipButton';
import { findParentWithMultipleChildren, countNodes } from '../utils/treeUtils';
import { getOpeningName, isTheoryPosition, useOpeningTheory } from '../utils/openingTheory';

export interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
  isPending?: boolean;
  title?: string;
  description?: string;
  quality?: 'blunder' | 'mistake' | 'good' | 'great';
}

interface ForceTreeProps {
  data: TreeNode;
  currentFen: string;
  onNodeClick: (node: any) => void;
  onNodeUpdate?: (nodeFen: string, title: string, description: string, quality?: TreeNode['quality']) => void;
  isDeleteMode?: boolean;
  tempTreeData?: TreeNode | null;
  isFullscreen?: boolean;
}

// ── Quality helpers ────────────────────────────────────────────────────────
type Quality = TreeNode['quality'];

const QUALITY_COLOR: Record<NonNullable<Quality>, string> = {
  blunder: '#ef4444',   // red
  mistake: '#f97316',   // light red / orange-red
  good:    '#ec4899',   // pink
  great:   '#ff006e',   // hot pink
};

const QUALITY_LABEL: Record<NonNullable<Quality>, string> = {
  blunder: '??',
  mistake: '?',
  good:    '!',
  great:   '!!',
};

const QUALITY_TOOLTIP: Record<NonNullable<Quality>, string> = {
  blunder: 'Blunder (??)',
  mistake: 'Mistake (?)',
  good:    'Good Move (!)',
  great:   'Great Move (!!)',
};

function qualityNodeColor(quality?: Quality): string | null {
  if (!quality) return null;
  return QUALITY_COLOR[quality];
}

// ── Tree traversal helpers ────────────────────────────────────────────────
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

function findNodeByFen(node: TreeNode, targetFen: string): TreeNode | null {
  if (node.fen === targetFen) return node;
  for (const child of node.children) {
    const found = findNodeByFen(child, targetFen);
    if (found) return found;
  }
  return null;
}

function findParentByFen(node: TreeNode, targetFen: string, parent: TreeNode | null = null): TreeNode | null {
  if (node.fen === targetFen) return parent;
  for (const child of node.children) {
    const found = findParentByFen(child, targetFen, node);
    if (found) return found;
  }
  return null;
}

/**
 * Tangle-free layout via d3.tree (Reingold-Tilford).
 * Returns "home" positions; the float animation drifts ±AMPLITUDE px from these.
 */
function computeTreeLayout(
  root: TreeNode,
  
  containerHeight: number,
  visibleFens: Set<string>
): Map<string, { x: number; y: number }> {
  function buildHierarchy(node: TreeNode): any {
    const visibleChildren = node.children
      .filter(c => visibleFens.has(c.fen))
      .map(buildHierarchy);
    return { id: node.fen, children: visibleChildren.length > 0 ? visibleChildren : undefined };
  }

  const hier = d3.hierarchy(buildHierarchy(root));
  const NODE_SEP_X = 160;
  const NODE_SEP_Y = 52;

  const laid = d3.tree<any>().nodeSize([NODE_SEP_Y, NODE_SEP_X])(hier);

  let minY = Infinity, maxY = -Infinity;
  laid.each(d => { if (d.x < minY) minY = d.x; if (d.x > maxY) maxY = d.x; });
  const verticalOffset = (containerHeight / 2) - ((maxY - minY) / 2) - minY;

  const positions = new Map<string, { x: number; y: number }>();
  laid.each((d: any) => {
    let customX = 80;
    for (let i = 1; i <= d.depth; i++) {
      if (i % 2 === 0) {
        customX += NODE_SEP_X * 0.5; // Black responses are closer
      } else {
        customX += NODE_SEP_X;
      }
    }
    positions.set(d.data.id, { x: customX, y: d.x + verticalOffset });
  });
  return positions;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ForceTree({
  data, currentFen, onNodeClick, onNodeUpdate, isDeleteMode, tempTreeData, isFullscreen,
}: ForceTreeProps) {
  useOpeningTheory();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const savedTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  const [focusMode, setFocusMode] = useState(false);
  const [showNodeInfoModal, setShowNodeInfoModal] = useState(false);
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeDescription, setNodeDescription] = useState('');
  const [nodeQuality, setNodeQuality] = useState<Quality>(undefined);
  const [navMenuExpanded, setNavMenuExpanded] = useState(false);

  const currentTree = tempTreeData || data;
  const activePath = useMemo(() => pathToNode(data, currentFen), [data, currentFen]);
  const currentNode = useMemo(() => findNodeByFen(currentTree, currentFen), [currentTree, currentFen]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigateToNode = useCallback((target?: TreeNode | null) => {
    if (!target) return;
    onNodeClick({ fen: target.fen, move: target.move || 'Start' });
  }, [onNodeClick]);

  const navigateLeft  = useCallback(() => navigateToNode(findParentByFen(currentTree, currentFen)), [currentTree, currentFen, navigateToNode]);
  const navigateRight = useCallback(() => navigateToNode(currentNode?.children[0]), [currentNode, navigateToNode]);

  const navigateUp = useCallback(() => {
    const result = findParentWithMultipleChildren(currentTree, currentFen);
    if (result) {
      const { parent, currentChildIndex } = result;
      navigateToNode(parent.children[currentChildIndex === 0 ? parent.children.length - 1 : currentChildIndex - 1]);
    }
  }, [currentTree, currentFen, navigateToNode]);

  const navigateDown = useCallback(() => {
    const result = findParentWithMultipleChildren(currentTree, currentFen);
    if (result) {
      const { parent, currentChildIndex } = result;
      navigateToNode(parent.children[currentChildIndex === parent.children.length - 1 ? 0 : currentChildIndex + 1]);
    }
  }, [currentTree, currentFen, navigateToNode]);

  // ── Temp FENs ─────────────────────────────────────────────────────────────
  const tempFens = useMemo(() => {
    if (!tempTreeData) return new Set<string>();
    const fens = new Set<string>();
    const mainFens = new Set<string>();
    const collectMain = (node: TreeNode) => { mainFens.add(node.fen); node.children.forEach(collectMain); };
    collectMain(data);
    const collectTemp = (node: TreeNode) => {
      if (!mainFens.has(node.fen)) fens.add(node.fen);
      node.children.forEach(collectTemp);
    };
    collectTemp(tempTreeData);
    return fens;
  }, [tempTreeData, data]);

  // ── Quality map: fen → quality (for fast lookup during draw) ─────────────
  const qualityMap = useMemo(() => {
    const map = new Map<string, Quality>();
    function collect(node: TreeNode) {
      if (node.quality) map.set(node.fen, node.quality);
      node.children.forEach(collect);
    }
    collect(currentTree);
    return map;
  }, [currentTree]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const el = svgRef.current;
    const containerWidth = isFullscreen ? window.innerWidth : (containerRef.current.clientWidth || 600);
    const height = isFullscreen ? window.innerHeight : (containerRef.current.clientHeight || 500);

    // 1. Visible FENs
    const visibleFens = new Set<string>();
    function collectVisible(node: TreeNode, parentFen: string | null = null) {
      const onPath = activePath.has(node.fen);
      const parentOnPath = parentFen ? activePath.has(parentFen) : true;
      if (!focusMode || onPath || parentOnPath) {
        visibleFens.add(node.fen);
        for (const child of node.children) collectVisible(child, node.fen);
      }
    }
    collectVisible(currentTree);

    // 2. Tangle-free layout
    const treePositions = computeTreeLayout(currentTree, height, visibleFens);

    // 3. Build node/link arrays
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeMap = new Map<string, any>();

    function buildGraph(node: TreeNode, parentFen: string | null = null, depth = 0) {
      if (!visibleFens.has(node.fen)) return;
      const onPath   = activePath.has(node.fen);
      const isTemp   = tempFens.has(node.fen);
      const isTheory = isTheoryPosition(node.fen);
      const quality  = qualityMap.get(node.fen);
      const pos = treePositions.get(node.fen) ?? { x: depth * 160 + 80, y: height / 2 };

      if (!nodeMap.has(node.fen)) {
        const n = {
          id: node.fen, fen: node.fen, move: node.move ?? 'Start',
          isPending: !!node.isPending, depth, onPath, isTemp, isTheory, quality,
          homeX: pos.x, homeY: pos.y, x: pos.x, y: pos.y, dragging: false,
          phaseX: 0, phaseY: 0,
        };
        nodeMap.set(node.fen, n);
        nodes.push(n);
      }
      if (parentFen && nodeMap.has(parentFen)) {
        links.push({
          source: parentFen, target: node.fen,
          isPending: !!node.isPending,
          onPath: onPath && activePath.has(parentFen),
          isTemp,
          isTheory: isTheory && isTheoryPosition(parentFen),
          quality,
        });
      }
      for (const child of node.children) buildGraph(child, node.fen, depth + 1);
    }
    buildGraph(currentTree);

    nodes.forEach((n, i) => {
      n.phaseX = (i * 1.6180339887) % (Math.PI * 2);
      n.phaseY = (i * 2.3999632297) % (Math.PI * 2);
    });

    // 4. SVG / zoom
    const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
    const totalWidth = Math.max(containerWidth, maxX + 120);

    const svg = d3.select(el).attr('width', totalWidth).attr('height', height);
    svg.selectAll('*').remove();
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', e => { savedTransformRef.current = e.transform; g.attr('transform', e.transform); });
    svg.call(zoom);
    svg.call(zoom.transform, savedTransformRef.current);
    g.attr('transform', savedTransformRef.current.toString());

    const centerNode = (d: any) => {
      const scale = savedTransformRef.current.k || 1;
      const t = d3.zoomIdentity
        .translate(-d.homeX * scale + containerWidth / 2, -d.homeY * scale + height / 2)
        .scale(scale);
      savedTransformRef.current = t;
      svg.transition().duration(600).ease(d3.easeCubicOut).call(zoom.transform, t);
    };

    const posLookup = new Map(nodes.map(n => [n.id, n]));

    // 4.5. Background Dotted Lines entering 5th and 10th move
    const NODE_SEP_X = 160;
    const minNodeY = d3.min(nodes, n => n.y) ?? 0;
    const maxNodeY = d3.max(nodes, n => n.y) ?? height;

    // Move 5 (after 4 full moves)
    const depth8_x = 80 + 4 * NODE_SEP_X + 4 * (NODE_SEP_X * 0.5);
    const line5X = depth8_x + NODE_SEP_X * 0.6;

    g.append('line')
      .attr('x1', line5X)
      .attr('y1', minNodeY - 2000)
      .attr('x2', line5X)
      .attr('y2', maxNodeY + 2000)
      .attr('stroke', 'var(--text-muted)')
      .attr('stroke-dasharray', '8,8')
      .attr('stroke-width', 2)
      .attr('opacity', 0.3)
      .lower();

    // Move 10 (after 9 full moves)
    const depth18_x = 80 + 9 * NODE_SEP_X + 9 * (NODE_SEP_X * 0.5);
    const line10X = depth18_x + NODE_SEP_X * 0.6;

    g.append('line')
      .attr('x1', line10X)
      .attr('y1', minNodeY - 2000)
      .attr('x2', line10X)
      .attr('y2', maxNodeY + 2000)
      .attr('stroke', 'var(--text-muted)')
      .attr('stroke-dasharray', '8,8')
      .attr('stroke-width', 2)
      .attr('opacity', 0.3)
      .lower();

    // 5. Links
    const link = g.append('g').selectAll('line').data(links).enter().append('line')
      .attr('x1', (d: any) => posLookup.get(d.source)?.x ?? 0)
      .attr('y1', (d: any) => posLookup.get(d.source)?.y ?? 0)
      .attr('x2', (d: any) => posLookup.get(d.target)?.x ?? 0)
      .attr('y2', (d: any) => posLookup.get(d.target)?.y ?? 0)
      .attr('stroke', (d: any) => {
        if (d.isTemp) return '#666';
        if (d.quality) return QUALITY_COLOR[d.quality as NonNullable<Quality>];
        if (d.onPath) return 'white';
        if (d.isPending) return '#f59e0b';
        if (d.isTheory) return '#ff4444';
        return 'var(--border-color-focus)';
      })
      .attr('stroke-width', (d: any) => d.onPath ? 4 : d.isTheory ? 2.5 : 2)
      .attr('stroke-dasharray', (d: any) => d.isTemp ? '3,4' : d.isPending ? '6,4' : '0')
      .attr('stroke-opacity', (d: any) => d.isTemp ? 0.8 : d.onPath ? 1 : d.isTheory ? 0.6 : d.quality ? 0.9 : 0.4);

    // 6. Nodes
    const node = g.append('g').selectAll('g').data(nodes).enter().append('g')
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      .style('cursor', isDeleteMode ? 'crosshair' : 'pointer')
      .on('click', (_e, d) => { centerNode(d); onNodeClick(d); })
      .on('mouseenter', (e, d: any) => {
        if (isDeleteMode && d.depth > 0)
          d3.select(e.currentTarget).select('circle')
            .transition().duration(200).attr('r', 15).attr('stroke', '#ef4444').attr('stroke-width', 3);
      })
      .on('mouseleave', (e, d: any) => {
        if (isDeleteMode && d.depth > 0)
          d3.select(e.currentTarget).select('circle')
            .transition().duration(200)
            .attr('r', d.fen === currentFen ? 12 : 8)
            .attr('stroke', d.onPath ? 'white' : 'var(--accent-color)')
            .attr('stroke-width', d.onPath ? 3 : 2);
      });

    node.append('circle')
      .attr('r', (d: any) => d.fen === currentFen ? 12 : 8)
      .attr('fill', (d: any) => {
        if (d.isTemp) return '#f5f5f5';
        if (d.fen === currentFen) return qualityNodeColor(d.quality) ?? 'var(--accent-color)';
        if (d.quality) return QUALITY_COLOR[d.quality as NonNullable<Quality>];
        return d.fen.split(' ')[1] === 'w' ? '#333' : '#fff';
      })
      .attr('stroke', (d: any) => {
        if (d.isTemp) return '#999';
        if (d.quality) return QUALITY_COLOR[d.quality as NonNullable<Quality>];
        if (d.onPath) return '#fff';
        return 'var(--accent-color)';
      })
      .attr('stroke-width', (d: any) => d.isTemp ? 1 : d.onPath || d.quality ? 3 : 2);

    // Move label
    node.append('text')
      .text((d: any) => d.move ?? '')
      .attr('dx', 0).attr('dy', -14).attr('text-anchor', 'middle')
      .attr('font-size', 12).attr('font-weight', (d: any) => d.onPath ? 'bold' : 'normal')
      .attr('fill', '#fff').attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)');

    
    // 7. Drag
    node.call(d3.drag<SVGGElement, any>()
      .on('start', function(_e, d) {
        d.dragging = true;
        (this.parentNode as Element)?.appendChild(this);
      })
      .on('drag', function(e, d) {
        d.x = e.x; d.y = e.y;
        d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
        link
          .filter((l: any) => l.source === d.id || l.target === d.id)
          .attr('x1', (l: any) => l.source === d.id ? d.x : posLookup.get(l.source)?.x ?? 0)
          .attr('y1', (l: any) => l.source === d.id ? d.y : posLookup.get(l.source)?.y ?? 0)
          .attr('x2', (l: any) => l.target === d.id ? d.x : posLookup.get(l.target)?.x ?? 0)
          .attr('y2', (l: any) => l.target === d.id ? d.y : posLookup.get(l.target)?.y ?? 0);
      })
      .on('end', function(_e, d) {
        d.dragging = false;
        d3.select(this).transition().duration(500).ease(d3.easeElasticOut.amplitude(1).period(0.4))
          .attr('transform', `translate(${d.homeX},${d.homeY})`);
        d.x = d.homeX; d.y = d.homeY;
        link
          .filter((l: any) => l.source === d.id || l.target === d.id)
          .transition().duration(500).ease(d3.easeElasticOut.amplitude(1).period(0.4))
          .attr('x1', (l: any) => posLookup.get(l.source)?.homeX ?? 0)
          .attr('y1', (l: any) => posLookup.get(l.source)?.homeY ?? 0)
          .attr('x2', (l: any) => posLookup.get(l.target)?.homeX ?? 0)
          .attr('y2', (l: any) => posLookup.get(l.target)?.homeY ?? 0);
      })
    );

    // 8. Float animation (disabled)
    const AMPLITUDE = 0;
    const SPEED = 0.0008;
    let rafId: number;
    const tick = (t: number) => {
      node.each(function(d: any) {
        if (d.dragging) return;
        d.x = d.homeX + Math.sin(t * SPEED + d.phaseX) * AMPLITUDE;
        d.y = d.homeY + Math.cos(t * SPEED * 0.7 + d.phaseY) * AMPLITUDE;
        d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
      });
      link
        .attr('x1', (l: any) => posLookup.get(l.source)?.x ?? 0)
        .attr('y1', (l: any) => posLookup.get(l.source)?.y ?? 0)
        .attr('x2', (l: any) => posLookup.get(l.target)?.x ?? 0)
        .attr('y2', (l: any) => posLookup.get(l.target)?.y ?? 0);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);

  }, [data, currentFen, currentTree, focusMode, activePath, onNodeClick, isDeleteMode, tempFens, isFullscreen, qualityMap]);

  // ── Center on FEN ─────────────────────────────────────────────────────────
  const centerOnFen = useCallback((fen: string) => {
    if (!svgRef.current || !containerRef.current) return;
    const el = svgRef.current;
    const containerWidth  = isFullscreen ? window.innerWidth  : (containerRef.current.clientWidth  || 600);
    const containerHeight = isFullscreen ? window.innerHeight : (containerRef.current.clientHeight || 500);
    const nodeEl = d3.select(el).selectAll<SVGGElement, any>('g').filter((d: any) => d && d.fen === fen);
    if (nodeEl.size() === 0) return;
    const d = nodeEl.datum() as any;
    if (d?.homeX === undefined) return;
    const scale = savedTransformRef.current.k || 1;
    const t = d3.zoomIdentity
      .translate(-d.homeX * scale + containerWidth / 2, -d.homeY * scale + containerHeight / 2)
      .scale(scale);
    savedTransformRef.current = t;
    const zoom = d3.zoom<SVGSVGElement, unknown>();
    d3.select(el).transition().duration(600).ease(d3.easeCubicOut).call(zoom.transform, t);
  }, [isFullscreen]);

  useEffect(() => {
    if (!findNodeByFen(data, currentFen)) return;
    const id = setTimeout(() => centerOnFen(currentFen), 60);
    return () => clearTimeout(id);
  }, [currentFen, data, centerOnFen]);

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const map: Record<string, () => void> = {
        ArrowLeft: navigateLeft, ArrowRight: navigateRight,
        ArrowUp: navigateUp,    ArrowDown: navigateDown,
      };
      const fn = map[event.key];
      if (fn) { event.preventDefault(); event.stopPropagation(); fn(); }
    };
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown, { capture: true });
      container.setAttribute('tabindex', '0');
    }
    return () => container?.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [navigateLeft, navigateRight, navigateUp, navigateDown]);

  useEffect(() => { return draw(); }, [draw]);

  // ── Info icon color ───────────────────────────────────────────────────────
  const infoIconColor = currentNode?.quality
    ? QUALITY_COLOR[currentNode.quality]
    : '#fff';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>

      {/* Top-left: node info pill */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: '0.5rem', zIndex: 20 }}>
        {(() => {
          const opening = currentNode ? getOpeningName(currentNode.fen) : null;
          const isRoot = currentNode && currentTree && currentNode.fen === currentTree.fen;
          const displayTitle = isRoot ? `${countNodes(currentTree)} nodes` : (currentNode?.title || opening);
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'rgba(0,0,0,0.5)', padding: '2px 8px 2px 2px',
              borderRadius: '6px',
              border: `1px solid ${currentNode?.quality ? QUALITY_COLOR[currentNode.quality] : 'var(--border-color)'}`,
              height: 40,
              transition: 'border-color 0.25s ease',
            }}>
              <TooltipButton
                tooltip="Node Information"
                onClick={() => {
                  if (currentNode) {
                    setNodeTitle(currentNode.title || getOpeningName(currentNode.fen) || '');
                    setNodeDescription(currentNode.description || '');
                    setNodeQuality(currentNode.quality);
                    setShowNodeInfoModal(true);
                  }
                }}
                className="btn btn-secondary"
                style={{ padding: 0, width: 34, height: 34, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Info size={20} color={infoIconColor} />
              </TooltipButton>
              {displayTitle && (
                <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: '600', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '4px' }}>
                  {displayTitle}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Top-right: focus mode toggle */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '0.5rem', zIndex: 20 }}>
        <TooltipButton
          tooltip={focusMode ? 'Show All Branches' : 'Focus Current Branch'}
          onClick={() => setFocusMode(f => !f)}
          className="btn btn-secondary"
          style={{ padding: 0, width: 36, height: 36, background: focusMode ? 'white' : 'rgba(0,0,0,0.5)', color: focusMode ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {focusMode ? <GitBranchPlus size={20} /> : <GitBranch size={20} />}
        </TooltipButton>
      </div>

      {/* Bottom-right: nav d-pad */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 20 }}>
        {navMenuExpanded && (
          <div style={{ position: 'absolute', bottom: 48, right: 0, width: 120, height: 120 }}>
            {([
              { tooltip: 'Navigate Up',    onClick: navigateUp,    Icon: ChevronUp,    style: { top: 42, left: '50%', transform: 'translateX(-50%)' } },
              { tooltip: 'Navigate Left',  onClick: navigateLeft,  Icon: ChevronLeft,  style: { bottom: 0, left: 0 } },
              { tooltip: 'Navigate Right', onClick: navigateRight, Icon: ChevronRight, style: { bottom: 0, right: 0 } },
              { tooltip: 'Navigate Down',  onClick: navigateDown,  Icon: ChevronDown,  style: { bottom: 0, left: '50%', transform: 'translateX(-50%)' } },
            ] as const).map(({ tooltip, onClick, Icon, style }) => (
              <TooltipButton key={tooltip} tooltip={`${tooltip} (Arrow key)`} onClick={onClick} className="btn btn-secondary"
                style={{ position: 'absolute', ...style, padding: 0, width: 36, height: 36, background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} />
              </TooltipButton>
            ))}
          </div>
        )}
        <TooltipButton
          tooltip="Navigation Controls"
          onClick={() => { setNavMenuExpanded(x => !x); centerOnFen(currentFen); }}
          className="btn btn-secondary"
          style={{ padding: 0, width: 36, height: 36, background: navMenuExpanded ? 'white' : 'rgba(0,0,0,0.5)', color: navMenuExpanded ? '#000' : '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Navigation size={20} />
        </TooltipButton>
      </div>

      <svg ref={svgRef} style={{ display: 'block' }} />

      {isDeleteMode && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)' }}>
          DELETE MODE ACTIVE: CLICK A BRANCH TO REMOVE IT
        </div>
      )}

      {/* ── Node Info Modal ──────────────────────────────────────────────── */}
      {showNodeInfoModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ maxWidth: 400, width: '100%', position: 'relative', padding: '1.5rem' }}>
            <button onClick={() => setShowNodeInfoModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={24} />
            </button>

            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={20} color={nodeQuality ? QUALITY_COLOR[nodeQuality] : 'var(--accent-color)'} />
              Node Information
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Title */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Title (max 20 characters)
                </label>
                <input type="text" value={nodeTitle} onChange={e => setNodeTitle(e.target.value.slice(0, 20))}
                  placeholder="Enter node title..."
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                  maxLength={20} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{nodeTitle.length}/20</div>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Description (max 100 characters)
                </label>
                <textarea value={nodeDescription} onChange={e => setNodeDescription(e.target.value.slice(0, 100))}
                  placeholder="Enter node description..."
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', minHeight: '80px', resize: 'vertical', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                  maxLength={100} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{nodeDescription.length}/100</div>
              </div>

              {/* Save row: quality buttons on left, Save on right */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                {/* Quality toggle buttons */}
                {(['blunder', 'mistake', 'good', 'great'] as NonNullable<Quality>[]).map(q => {
                  const isActive = nodeQuality === q;
                  return (
                    <TooltipButton
                      key={q}
                      tooltip={QUALITY_TOOLTIP[q]}
                      onClick={() => setNodeQuality(isActive ? undefined : q)}
                      className="btn"
                      style={{
                        padding: '0 0.6rem',
                        height: 38,
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        background: isActive ? QUALITY_COLOR[q] : 'var(--surface)',
                        color: isActive ? '#fff' : QUALITY_COLOR[q],
                        border: `2px solid ${QUALITY_COLOR[q]}`,
                        borderRadius: 'var(--radius-md)',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                        // subtle glow when active
                        boxShadow: isActive ? `0 0 8px ${QUALITY_COLOR[q]}88` : 'none',
                      }}
                    >
                      {QUALITY_LABEL[q]}
                    </TooltipButton>
                  );
                })}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Save */}
                <button
                  onClick={() => {
                    if (onNodeUpdate) {
                      const opening = getOpeningName(currentFen);
                      let finalTitle = nodeTitle.trim();
                      if (opening && finalTitle === opening.slice(0, 20).trim()) finalTitle = '';
                      onNodeUpdate(currentFen, finalTitle, nodeDescription.trim(), nodeQuality);
                    }
                    setShowNodeInfoModal(false);
                  }}
                  className="btn"
                  style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', flexShrink: 0 }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}