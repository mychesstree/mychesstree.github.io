import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { GitBranchPlus, GitBranch, ChevronLeft, ChevronRight } from 'lucide-react';
import TooltipButton from './TooltipButton';

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
  importedBranch?: TreeNode | null;
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

export default function ForceTree({ data, currentFen, onNodeClick, isDeleteMode, importedBranch }: ForceTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const activePath = useMemo(() => pathToNode(data, currentFen), [data, currentFen]);

  // Navigation functions
  const navigateLeft = useCallback(() => {
    // Find parent of current node
    const findParent = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
      if (node.fen === targetFen) return parent;
      for (const child of node.children) {
        const found = findParent(child, targetFen, node);
        if (found) return found;
      }
      return null;
    };

    // Check if we're in an imported branch first
    if (importedBranch && importedBranch.children.length > 0) {
      const isInImportedBranch = (fen: string): boolean => {
        const checkNode = (node: TreeNode): boolean => {
          if (node.fen === fen) return true;
          for (const child of node.children) {
            if (checkNode(child)) return true;
          }
          return false;
        };
        for (const child of importedBranch.children) {
          if (checkNode(child)) return true;
        }
        return false;
      };
      
      if (isInImportedBranch(currentFen)) {
        // Go back to the diverge point
        onNodeClick({ fen: importedBranch.fen, move: 'Start' });
        return;
      }
    }

    // Otherwise find parent in main tree
    const parentNode = findParent(data, currentFen, null);
    if (parentNode) {
      onNodeClick({ fen: parentNode.fen, move: parentNode.move || 'Start' });
    }
  }, [currentFen, data, importedBranch, onNodeClick]);

  const navigateRight = useCallback(() => {
    // Find current node in tree
    const findNode = (node: TreeNode, fen: string): TreeNode | null => {
      if (node.fen === fen) return node;
      for (const child of node.children) {
        const found = findNode(child, fen);
        if (found) return found;
      }
      return null;
    };

    const currentNode = findNode(data, currentFen);
    if (!currentNode) return;

    // Go to first child - check main tree first, then imported branch
    if (currentNode.children.length > 0) {
      const nextNode = currentNode.children[0];
      onNodeClick({ fen: nextNode.fen, move: nextNode.move || 'Start' });
    } else if (importedBranch && importedBranch.children.length > 0) {
      // Check if we're at the diverge point (importedBranch.fen)
      if (currentFen === importedBranch.fen && importedBranch.children.length > 0) {
        const branchNode = importedBranch.children[0];
        onNodeClick({ fen: branchNode.fen, move: branchNode.move || 'Start' });
      }
    }
  }, [currentFen, data, importedBranch, onNodeClick]);

  const importedFens = useMemo(() => {
    if (!importedBranch) return new Set<string>();
    const fens = new Set<string>();
    const collect = (node: TreeNode) => {
      fens.add(node.fen);
      node.children.forEach(collect);
    };
    if (importedBranch.children.length > 0) {
      importedBranch.children.forEach(collect);
    }
    return fens;
  }, [importedBranch]);

  const draw = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const nodes: any[] = [];
    const links: any[] = [];
    const depthMap = assignDepths(data);
    const tempNodesMap = new Map();

    function buildGraph(node: TreeNode, parentFen: string | null = null, isImported = false) {
      const depth = depthMap.get(node.fen) ?? 0;
      const onPath = activePath.has(node.fen);
      const isVisible = !focusMode || onPath || (parentFen && activePath.has(parentFen));

      if (isVisible) {
        if (!tempNodesMap.has(node.fen)) {
          const importedFlag = importedFens.has(node.fen);
          const n = { id: node.fen, fen: node.fen, move: node.move ?? 'Start', isPending: !!node.isPending, depth, onPath, isImported: importedFlag };
          tempNodesMap.set(node.fen, n);
          nodes.push(n);
        }
        if (parentFen && tempNodesMap.has(parentFen)) {
          const importedFlag = importedFens.has(node.fen);
          links.push({ source: parentFen, target: node.fen, isPending: !!node.isPending, onPath: onPath && activePath.has(parentFen), isImported: importedFlag });
        }
      }
      for (const child of node.children) buildGraph(child, node.fen, isImported);
    }
    buildGraph(data);

    // Add imported branch nodes - spread vertically below attach point
    if (importedBranch && importedBranch.children.length > 0) {
      const divergeFen = importedBranch.fen;
      const divergeNode = tempNodesMap.get(divergeFen);
      
      for (const branch of importedBranch.children) {
        // Link to diverge point
        links.push({ source: divergeFen, target: branch.fen, isPending: false, onPath: false, isImported: true });

        let importedDepth = (divergeNode?.depth ?? 0) + 1;
        
        const buildImportNode = (node: TreeNode, depth: number, yIndex: number) => {
          if (!tempNodesMap.has(node.fen)) {
            // Add yOffset to spread nodes vertically - 60px per position in chain
            const yOffset = yIndex * 60;
            const n = { id: node.fen, fen: node.fen, move: node.move ?? '', isPending: false, depth, onPath: false, isImported: true, yOffset };
            tempNodesMap.set(node.fen, n);
            nodes.push(n);
          }
          let childYIndex = 0;
          for (const child of node.children) {
            if (!tempNodesMap.has(child.fen)) {
              links.push({ source: node.fen, target: child.fen, isPending: false, onPath: false, isImported: true });
            }
            buildImportNode(child, depth + 1, childYIndex);
            childYIndex++;
          }
        };
        // Start yIndex at 0 and increment for each branch
        buildImportNode(branch, importedDepth, 0);
      }
    }

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

    // Set fixed x positions for alternating connection lengths
    nodes.forEach(node => {
      const baseX = (node.depth * 150) + 20;
      const isEvenDepth = node.depth % 2 === 0;
      const offset = isEvenDepth ? 0 : 30; // 30px extra for odd depths
      node.fx = baseX + offset; // Fix x position
    });

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-350).distanceMax(250))
      // Remove x force since we're fixing positions
      .force('x', d3.forceX(d => d.fx || 0).strength(0))
      // Add slight vertical spreading for deeper nodes
      .force('y', d3.forceY((d: any) => {
        if (d.yOffset !== undefined) return (height / 2) + d.yOffset;
        // Subtle vertical spread for deeper nodes only
        const depthSpread = (d.depth / maxDepth) * 50;
        const randomOffset = 2 * depthSpread;
        return (height / 2) + randomOffset;
      }).strength(0.2))
      .force('collision', d3.forceCollide(35))
      .alphaDecay(0.04);

    const rootNode = nodes.find(n => n.depth === 0);
    if (rootNode) { rootNode.fx = 100; rootNode.fy = height / 2; }

    const link = g.append('g').selectAll('line').data(links).enter().append('line')
      .attr('stroke', (d: any) => d.isImported ? '#fff' : d.onPath ? 'white' : d.isPending ? '#f59e0b' : 'var(--border-color-focus)')
      .attr('stroke-width', (d: any) => d.onPath ? 4 : 2)
      .attr('stroke-dasharray', (d: any) => d.isImported ? '4,4' : d.isPending ? '6,4' : '0')
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
      .attr('fill', (d: any) => {
        if (d.isImported) return '#fff';
        if (d.fen === currentFen) return 'var(--accent-color)';
        // Color based on whose turn it is at this position (flip: white turn = dark node)
        const isWhiteTurn = d.fen.split(' ')[1] === 'w';
        return isWhiteTurn ? '#333' : '#fff';
      })
      .attr('stroke', (d: any) => {
        if (d.isImported) return '#fff';
        if (d.onPath) return '#fff';
        return 'var(--accent-color)';
      })
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
  }, [data, currentFen, focusMode, activePath, onNodeClick, isDeleteMode, importedBranch]);

  // Auto-center on current node when currentFen changes
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const el = svgRef.current;
    const containerWidth = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;

    // Find the current node in the tree
    const findNode = (node: TreeNode, fen: string): TreeNode | null => {
      if (node.fen === fen) return node;
      for (const child of node.children) {
        const found = findNode(child, fen);
        if (found) return found;
      }
      return null;
    };

    const currentNode = findNode(data, currentFen);
    if (!currentNode) return;

    // Wait for the simulation to stabilize, then center
    const timeoutId = setTimeout(() => {
      const zoom = d3.zoom<SVGSVGElement, unknown>();
      const scale = d3.zoomTransform(el).k || 1;
      
      // Find the D3 node element with matching fen
      const nodeElements = d3.select(el).selectAll('g').filter((d: any) => d && d.fen === currentFen);
      if (nodeElements.size() > 0) {
        const nodeData = nodeElements.datum() as any;
        if (nodeData && nodeData.x !== undefined && nodeData.y !== undefined) {
          const x = -nodeData.x * scale + containerWidth / 2;
          const y = -nodeData.y * scale + height / 2;
          d3.select(el).transition().duration(600).ease(d3.easeCubicOut)
            .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
        }
      }
    }, 100); // Small delay to ensure simulation has positioned nodes

    return () => clearTimeout(timeoutId);
  }, [currentFen, data]);

  useEffect(() => {
    return draw();
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '0.5rem', zIndex: 20 }}>
        <TooltipButton
          tooltip="Navigate Back (Left)"
          onClick={navigateLeft}
          className="btn btn-secondary"
          style={{
            padding: 0,
            width: 36,
            height: 36,
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ChevronLeft size={20} />
        </TooltipButton>
        <TooltipButton
          tooltip="Navigate Forward (Right)"
          onClick={navigateRight}
          className="btn btn-secondary"
          style={{
            padding: 0,
            width: 36,
            height: 36,
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ChevronRight size={20} />
        </TooltipButton>
        <TooltipButton
          tooltip={focusMode ? "Show All Branches" : "Focus Current Branch"}
          onClick={() => setFocusMode(f => !f)}
          className="btn btn-secondary"
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
        </TooltipButton>
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
