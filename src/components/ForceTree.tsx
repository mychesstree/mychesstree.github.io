import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { GitBranchPlus, GitBranch, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Info, X, Navigation } from 'lucide-react';
import TooltipButton from './TooltipButton';
import { findParentWithMultipleChildren } from '../utils/treeUtils';

export interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
  isPending?: boolean;
  title?: string;
  description?: string;
}

interface ForceTreeProps {
  data: TreeNode;
  currentFen: string;
  onNodeClick: (node: any) => void;
  onNodeUpdate?: (nodeFen: string, title: string, description: string) => void;
  isDeleteMode?: boolean;
  tempTreeData?: TreeNode | null;
  isFullscreen?: boolean;
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

// Calculate optimal vertical positions for branches to minimize crossings
function calculateBranchPositions(node: TreeNode, depthMap: Map<string, number>): Map<string, number> {
  const positions = new Map<string, number>();
  const branchGroups = new Map<number, Array<{node: TreeNode, parentFen: string}>>();
  
  // Group nodes by depth and track their parent
  function traverse(currentNode: TreeNode, parentFen: string | null = null) {
    const depth = depthMap.get(currentNode.fen) ?? 0;
    
    if (!branchGroups.has(depth)) {
      branchGroups.set(depth, []);
    }
    
    if (parentFen) {
      branchGroups.get(depth)!.push({ node: currentNode, parentFen });
    }
    
    for (const child of currentNode.children) {
      traverse(child, currentNode.fen);
    }
  }
  
  traverse(node);
  
  // For each depth level, calculate optimal positions
  branchGroups.forEach((nodesAtDepth) => {
    if (nodesAtDepth.length <= 1) {
      // Single node at this depth - center it
      nodesAtDepth.forEach(({ node }) => {
        positions.set(node.fen, 0);
      });
      return;
    }
    
    // Multiple nodes - analyze parent relationships to minimize crossings
    const parentGroups = new Map<string, number[]>();
    
    // Group by parent and assign initial positions
    nodesAtDepth.forEach(({ parentFen }, index) => {
      if (!parentGroups.has(parentFen)) {
        parentGroups.set(parentFen, []);
      }
      parentGroups.get(parentFen)!.push(index);
    });
    
    // Calculate positions that minimize crossings
    let currentPosition = 0;
    const sortedParents = Array.from(parentGroups.keys()).sort((a, b) => {
      // Sort parents by their own positions to maintain consistency
      const posA = positions.get(a) || 0;
      const posB = positions.get(b) || 0;
      return posA - posB;
    });
    
    sortedParents.forEach(parentFen => {
      const childIndices = parentGroups.get(parentFen)!;
      const groupSize = childIndices.length;
      
      // Center the group around currentPosition
      const groupStart = currentPosition - (groupSize - 1) * 30;
      
      childIndices.forEach((nodeIndex, i) => {
        const { node } = nodesAtDepth[nodeIndex];
        const position = groupStart + i * 60; // 60px spacing between siblings
        positions.set(node.fen, position);
      });
      
      currentPosition += groupSize * 10 + 20; // Add gap between groups
    });
    
    // Center all positions around 0
    const positionsArray = Array.from(positions.values());
    const minPos = Math.min(...positionsArray);
    const maxPos = Math.max(...positionsArray);
    const centerOffset = -(minPos + maxPos) / 2;
    
    positions.forEach((pos, fen) => {
      positions.set(fen, pos + centerOffset);
    });
  });
  
  return positions;
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

export default function ForceTree({ data, currentFen, onNodeClick, onNodeUpdate, isDeleteMode, tempTreeData, isFullscreen }: ForceTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [showNodeInfoModal, setShowNodeInfoModal] = useState(false);
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeDescription, setNodeDescription] = useState('');
  const [navMenuExpanded, setNavMenuExpanded] = useState(false);
  const currentTree = tempTreeData || data;
  const activePath = useMemo(() => pathToNode(data, currentFen), [data, currentFen]);
  const currentNode = useMemo(() => findNodeByFen(currentTree, currentFen), [currentTree, currentFen]);

  const navigateToNode = useCallback((target?: TreeNode | null) => {
    if (!target) return;
    onNodeClick({ fen: target.fen, move: target.move || 'Start' });
  }, [onNodeClick]);

  const navigateLeft = useCallback(() => {
    navigateToNode(findParentByFen(currentTree, currentFen));
  }, [currentTree, currentFen, navigateToNode]);

  const navigateRight = useCallback(() => {
    navigateToNode(currentNode?.children[0]);
  }, [currentNode, navigateToNode]);

  // Navigate up - use findParentWithMultipleChildren logic like keyboard navigation
  const navigateUp = useCallback(() => {
    const result = findParentWithMultipleChildren(currentTree, currentFen);
    if (result) {
      const { parent, currentChildIndex } = result;
      const nextIndex = currentChildIndex === 0 ? parent.children.length - 1 : currentChildIndex - 1;
      navigateToNode(parent.children[nextIndex]);
    }
  }, [currentTree, currentFen, navigateToNode]);

  // Navigate down - use findParentWithMultipleChildren logic like keyboard navigation
  const navigateDown = useCallback(() => {
    const result = findParentWithMultipleChildren(currentTree, currentFen);
    if (result) {
      const { parent, currentChildIndex } = result;
      const nextIndex = currentChildIndex === parent.children.length - 1 ? 0 : currentChildIndex + 1;
      navigateToNode(parent.children[nextIndex]);
    }
  }, [currentTree, currentFen, navigateToNode]);

  // Identify temporary nodes (nodes that exist in tempTreeData but not in main data)
  const tempFens = useMemo(() => {
    if (!tempTreeData) return new Set<string>();
    const fens = new Set<string>();
    const mainFens = new Set<string>();
    
    // Collect all FENs from main tree
    const collectMain = (node: TreeNode) => {
      mainFens.add(node.fen);
      node.children.forEach(collectMain);
    };
    collectMain(data);
    
    // Collect FENs from temp tree that don't exist in main tree
    const collectTemp = (node: TreeNode) => {
      if (!mainFens.has(node.fen)) {
        fens.add(node.fen);
      }
      node.children.forEach(collectTemp);
    };
    collectTemp(tempTreeData);
    
    return fens;
  }, [tempTreeData, data]);

  const draw = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const nodes: any[] = [];
    const links: any[] = [];
    const depthMap = assignDepths(currentTree);
    const branchPositions = calculateBranchPositions(currentTree, depthMap);
    const tempNodesMap = new Map();

    function buildGraph(node: TreeNode, parentFen: string | null = null) {
      const depth = depthMap.get(node.fen) ?? 0;
      const onPath = activePath.has(node.fen);
      const isVisible = !focusMode || onPath || (parentFen && activePath.has(parentFen));
      const isTemp = tempFens.has(node.fen);

      if (isVisible) {
        if (!tempNodesMap.has(node.fen)) {
          const n = { id: node.fen, fen: node.fen, move: node.move ?? 'Start', isPending: !!node.isPending, depth, onPath, isTemp };
          tempNodesMap.set(node.fen, n);
          nodes.push(n);
        }
        if (parentFen && tempNodesMap.has(parentFen)) {
          links.push({ source: parentFen, target: node.fen, isPending: !!node.isPending, onPath: onPath && activePath.has(parentFen), isTemp });
        }
      }
      for (const child of node.children) buildGraph(child, node.fen);
    }
    
    buildGraph(currentTree);

    
    const el = svgRef.current;
    // Use full window dimensions in fullscreen mode, otherwise use container dimensions
    const containerWidth = isFullscreen ? window.innerWidth : (containerRef.current.clientWidth || 600);
    const height = isFullscreen ? window.innerHeight : (containerRef.current.clientHeight || 500);
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
      const baseX = (node.depth * 150) + 10;
      const isEvenDepth = node.depth % 2 === 0;
      const offset = isEvenDepth ? -20 : 20; // 30px extra for odd depths
      node.fx = baseX + offset; // Fix x position
    });

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-350).distanceMax(250))
      // Remove x force since we're fixing positions
      .force('x', d3.forceX(d => d.fx || 0).strength(0))
      // Use calculated branch positions to prevent crisscrossing
      .force('y', d3.forceY((d: any) => {
        if (d.yOffset !== undefined) return (height / 2) + d.yOffset;
        // Use calculated branch position if available
        const branchPosition = branchPositions.get(d.fen);
        if (branchPosition !== undefined) {
          return (height / 2) + branchPosition;
        }
        // Fallback to subtle vertical spread
        const depthSpread = (d.depth / maxDepth) * 50;
        const randomOffset = 2 * depthSpread;
        return (height / 2) + randomOffset;
      }).strength(0.4)) // Moderate strength for subtle positioning
      .force('collision', d3.forceCollide(35))
      .alphaDecay(0.04);

    const rootNode = nodes.find(n => n.depth === 0);
    if (rootNode) { rootNode.fx = 100; rootNode.fy = height / 2; }

    const link = g.append('g').selectAll('line').data(links).enter().append('line')
      .attr('stroke', (d: any) => d.isTemp ? '#666' : d.onPath ? 'white' : d.isPending ? '#f59e0b' : 'var(--border-color-focus)')
      .attr('stroke-width', (d: any) => d.isTemp ? 2 : d.onPath ? 4 : 2)
      .attr('stroke-dasharray', (d: any) => d.isTemp ? '3,4' : d.isPending ? '6,4' : '0')
      .attr('stroke-opacity', (d: any) => d.isTemp ? 0.8 : d.onPath ? 1 : 0.4);

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
        if (d.isTemp) return '#f5f5f5';
        if (d.fen === currentFen) return 'var(--accent-color)';
        // Color based on whose turn it is at this position (flip: white turn = dark node)
        const isWhiteTurn = d.fen.split(' ')[1] === 'w';
        return isWhiteTurn ? '#333' : '#fff';
      })
      .attr('stroke', (d: any) => {
        if (d.isTemp) return '#999';
        if (d.onPath) return '#fff';
        return 'var(--accent-color)';
      })
      .attr('stroke-width', (d: any) => d.isTemp ? 1 : d.onPath ? 3 : 2);

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
  }, [data, currentFen, currentTree, focusMode, activePath, onNodeClick, isDeleteMode, tempFens, isFullscreen]);

  const centerOnFen = useCallback((fen: string) => {
    if (!svgRef.current || !containerRef.current) return;

    const el = svgRef.current;
    const containerWidth = isFullscreen ? window.innerWidth : (containerRef.current.clientWidth || 600);
    const height = isFullscreen ? window.innerHeight : (containerRef.current.clientHeight || 500);
    const scale = d3.zoomTransform(el).k || 1;
    const nodeElements = d3.select(el).selectAll('g').filter((d: any) => d && d.fen === fen);
    if (nodeElements.size() === 0) return;

    const nodeData = nodeElements.datum() as any;
    if (nodeData?.x === undefined || nodeData?.y === undefined) return;

    const x = -nodeData.x * scale + containerWidth / 2;
    const y = -nodeData.y * scale + height / 2;
    const zoom = d3.zoom<SVGSVGElement, unknown>();
    d3.select(el)
      .transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  }, [isFullscreen]);

  // Auto-center on current node when currentFen changes
  useEffect(() => {
    const currentNodeForFen = findNodeByFen(data, currentFen);
    if (!currentNodeForFen) return;

    // Wait for the simulation to stabilize, then center
    const timeoutId = setTimeout(() => {
      centerOnFen(currentFen);
    }, 100); // Small delay to ensure simulation has positioned nodes

    return () => clearTimeout(timeoutId);
  }, [currentFen, data, centerOnFen]);

  // Handle keyboard events for arrow key navigation
  useEffect(() => {
    const navigationTimeoutRef = { current: null as number | null };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation(); // Stop event bubbling
        navigateLeft();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation(); // Stop event bubbling
        navigateRight();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation(); // Stop event bubbling
        navigateUp();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation(); // Stop event bubbling
        navigateDown();
      }
    };

    // Add event listener to the container div
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown, { capture: true }); // Use capture phase
      // Make sure container is focusable
      container.setAttribute('tabindex', '0');
    }

    return () => {
      if (container) {
        container.removeEventListener('keydown', handleKeyDown, { capture: true });
      }
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, [navigateLeft, navigateRight, navigateUp, navigateDown]);

  
  useEffect(() => {
    return draw();
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: '0.5rem', zIndex: 20 }}>
        {(() => {
          const hasTitle = currentNode?.title;
          
          return (
            <>
              <TooltipButton
                tooltip="Node Information"
                onClick={() => {
                  if (currentNode) {
                    setNodeTitle(currentNode.title || '');
                    setNodeDescription(currentNode.description || '');
                    setShowNodeInfoModal(true);
                  }
                }}
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
                <Info size={20} />
              </TooltipButton>
              {hasTitle && (
                <div style={{
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  maxWidth: '200px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {currentNode.title}
                </div>
              )}
            </>
          );
        })()}
      </div>
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '0.5rem', zIndex: 20 }}>
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

      {/* Expandable Navigation Menu */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 20 }}>
        {navMenuExpanded && (
          <div style={{
            position: 'absolute',
            bottom: 48,
            right: 0,
            width: 120, // 3 buttons + 2 gaps
            height: 120 // 3 buttons + 2 gaps
          }}>
            {/* W button - WASD layout (top center) */}
            <TooltipButton
              tooltip="Navigate Up (Arrow key)"
              onClick={navigateUp}
              className="btn btn-secondary"
              style={{
                position: 'absolute',
                top: 42,
                left: '50%',
                transform: 'translateX(-50%)',
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
              <ChevronUp size={20} />
            </TooltipButton>
            
            {/* A button - WASD layout (middle left) */}
            <TooltipButton
              tooltip="Navigate Left (Arrow key)"
              onClick={navigateLeft}
              className="btn btn-secondary"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
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
            
            {/* D button - WASD layout (middle right) */}
            <TooltipButton
              tooltip="Navigate Right (Arrow key)"
              onClick={navigateRight}
              className="btn btn-secondary"
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
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
            
            {/* S button - WASD layout (bottom center) */}
            <TooltipButton
              tooltip="Navigate Down (Arrow key)"
              onClick={navigateDown}
              className="btn btn-secondary"
              style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
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
              <ChevronDown size={20} />
            </TooltipButton>
          </div>
        )}
        
        {/* Main navigation toggle button */}
        <TooltipButton
          tooltip="Navigation Controls"
          onClick={() => {
            setNavMenuExpanded(!navMenuExpanded);
            centerOnFen(currentFen);
          }}
          className="btn btn-secondary"
          style={{
            padding: 0,
            width: 36,
            height: 36,
            background: navMenuExpanded ? 'white' : 'rgba(0,0,0,0.5)',
            color: navMenuExpanded ? '#000' : '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
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
      
      {/* Node Info Modal */}
      {showNodeInfoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ 
            maxWidth: 400, 
            width: '100%', 
            position: 'relative',
            padding: '1.5rem'
          }}>
            <button 
              onClick={() => setShowNodeInfoModal(false)} 
              style={{ 
                position: 'absolute', 
                top: 12, 
                right: 12, 
                background: 'none', 
                border: 'none', 
                color: 'var(--text-muted)' 
              }}
            >
              <X size={24} />
            </button>
            
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={20} color="var(--accent-color)" />
              Node Information
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Title (max 20 characters)
                </label>
                <input
                  type="text"
                  value={nodeTitle}
                  onChange={(e) => setNodeTitle(e.target.value.substring(0, 20))}
                  placeholder="Enter node title..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9rem',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)'
                  }}
                  maxLength={20}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {nodeTitle.length}/20
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Description (max 100 characters)
                </label>
                <textarea
                  value={nodeDescription}
                  onChange={(e) => setNodeDescription(e.target.value.substring(0, 100))}
                  placeholder="Enter node description..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9rem',
                    minHeight: '80px',
                    resize: 'vertical',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)'
                  }}
                  maxLength={100}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {nodeDescription.length}/100
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  onClick={() => setShowNodeInfoModal(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (onNodeUpdate) {
                      onNodeUpdate(currentFen, nodeTitle.trim(), nodeDescription.trim());
                    }
                    setShowNodeInfoModal(false);
                  }}
                  className="btn"
                  style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
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
