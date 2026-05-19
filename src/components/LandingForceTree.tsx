import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { supabase } from '../lib/supabase';
import type { TreeNode } from '../types/tree';

const LANDING_TREE_ID = '839fc96f-edfd-477b-b114-390e1a6f52e2';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_NODES = 90;

type RenderNode = {
  id: string;
  fen: string;
  move: string;
  x: number;
  y: number;
  depth: number;
  isMainline: boolean;
};

type RenderLink = {
  source: RenderNode;
  target: RenderNode;
  isMainline: boolean;
};

type TreeRecord = {
  title?: string;
  color?: string;
  tree_data?: TreeNode;
};

const fallbackTree: TreeNode = {
  fen: START_FEN,
  children: [
    {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e4',
      children: [
        {
          fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          move: 'e5',
          children: [
            {
              fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
              move: 'Nf3',
              children: [
                {
                  fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
                  move: 'Nc6',
                  children: [
                    {
                      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
                      move: 'Bc4',
                      children: [],
                    },
                    {
                      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3',
                      move: 'd4',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          move: 'c5',
          children: [
            {
              fen: 'rnbqkbnr/pp1ppppp/8/2p5/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2',
              move: 'd4',
              children: [],
            },
          ],
        },
      ],
    },
    {
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      move: 'd4',
      children: [
        {
          fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
          move: 'd5',
          children: [],
        },
      ],
    },
  ],
};

function limitTree(node: TreeNode, limit = MAX_NODES) {
  let count = 0;

  function clone(current: TreeNode): TreeNode | null {
    if (count >= limit) return null;
    count += 1;

    const children: TreeNode[] = [];
    for (const child of current.children || []) {
      const next = clone(child);
      if (next) children.push(next);
      if (count >= limit) break;
    }

    return { ...current, children };
  }

  return clone(node) || fallbackTree;
}

function collectMainline(node: TreeNode) {
  const fens = new Set<string>();
  let current: TreeNode | undefined = node;

  while (current) {
    fens.add(current.fen);
    current = current.children?.[0];
  }

  return fens;
}

function buildLayout(root: TreeNode, width: number, height: number) {
  const mainlineFens = collectMainline(root);
  const hierarchy = d3.hierarchy(root, node => node.children);
  const treeLayout = d3.tree<TreeNode>().nodeSize([48, 128]);
  const laidOut = treeLayout(hierarchy);
  const nodes: RenderNode[] = [];

  laidOut.each(node => {
    nodes.push({
      id: node.data.fen,
      fen: node.data.fen,
      move: node.data.move || 'Start',
      x: node.y,
      y: node.x,
      depth: node.depth,
      isMainline: mainlineFens.has(node.data.fen),
    });
  });

  const minX = d3.min(nodes, node => node.x) ?? 0;
  const maxX = d3.max(nodes, node => node.x) ?? width;
  const minY = d3.min(nodes, node => node.y) ?? 0;
  const maxY = d3.max(nodes, node => node.y) ?? height;
  const contentWidth = Math.max(maxX - minX, 1);
  const contentHeight = Math.max(maxY - minY, 1);
  const scale = Math.min(width / (contentWidth + 180), height / (contentHeight + 140), 1.08);
  const offsetX = width - contentWidth * scale - 56;
  const offsetY = height / 2 - ((minY + maxY) / 2) * scale;

  const nodeMap = new Map<string, RenderNode>();
  nodes.forEach(node => {
    node.x = (node.x - minX) * scale + offsetX;
    node.y = node.y * scale + offsetY;
    nodeMap.set(node.id, node);
  });

  const links: RenderLink[] = [];
  laidOut.links().forEach(link => {
    const source = nodeMap.get(link.source.data.fen);
    const target = nodeMap.get(link.target.data.fen);
    if (source && target) {
      links.push({
        source,
        target,
        isMainline: source.isMainline && target.isMainline,
      });
    }
  });

  return { nodes, links };
}

export default function LandingForceTree() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<TreeNode>(fallbackTree);
  const [size, setSize] = useState({ width: 1200, height: 760 });

  useEffect(() => {
    let isMounted = true;

    async function loadLandingTree() {
      const { data, error } = await supabase
        .from('trees')
        .select('title, color, tree_data')
        .eq('id', LANDING_TREE_ID)
        .eq('is_public', true)
        .maybeSingle<TreeRecord>();

      if (!isMounted || error || !data?.tree_data) return;

      setTree(limitTree(data.tree_data));
    }

    loadLandingTree();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const updateSize = () => {
      setSize({
        width: element.clientWidth || 1200,
        height: element.clientHeight || 760,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const { nodes, links } = useMemo(() => buildLayout(tree, size.width, size.height), [size.height, size.width, tree]);
  const nodeCount = nodes.length;

  return (
    <div ref={wrapperRef} className="landing-force-tree" aria-hidden="true">
      <svg className="landing-force-tree-svg" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="landing-tree-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="landing-tree-links">
          {links.map(link => (
            <line
              key={`${link.source.id}-${link.target.id}`}
              x1={link.source.x}
              y1={link.source.y}
              x2={link.target.x}
              y2={link.target.y}
              className={link.isMainline ? 'landing-tree-link is-mainline' : 'landing-tree-link'}
            />
          ))}
        </g>

        <g className="landing-tree-nodes">
          {nodes.map((node, index) => (
            <g
              key={node.id}
              className={node.isMainline ? 'landing-tree-node is-mainline' : 'landing-tree-node'}
              transform={`translate(${node.x} ${node.y})`}
              style={{ animationDelay: `${(index % 12) * 390}ms` }}
            >
              <circle r={node.isMainline ? 7 : 4.5} />
              {(node.isMainline || node.depth < 3) && (
                <text x={0} y={node.isMainline ? -15 : -11}>
                  {node.move}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>

      <div className="landing-tree-badge">
        <span>Featured opening tree</span>
        <strong>{nodeCount} nodes</strong>
      </div>
    </div>
  );
}
