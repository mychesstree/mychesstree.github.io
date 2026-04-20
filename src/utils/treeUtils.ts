import { Chess } from 'chess.js';
import type { TreeNode } from '../types/tree';

// Tree traversal utilities
export function findNode(node: TreeNode, fen: string): TreeNode | null {
  if (node.fen === fen) return node;
  for (const child of node.children) {
    const hit = findNode(child, fen);
    if (hit) return hit;
  }
  return null;
}

export function countNodes(node: TreeNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

export function hasDuplicateFen(root: TreeNode, targetFen: string, count = 0): number {
  if (root.fen === targetFen) count++;
  for (const child of root.children) {
    count = hasDuplicateFen(child, targetFen, count);
  }
  return count;
}

export function deleteNodeFromTree(parent: TreeNode, targetFen: string): boolean {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].fen === targetFen) {
      parent.children.splice(i, 1);
      return true;
    }
    if (deleteNodeFromTree(parent.children[i], targetFen)) return true;
  }
  return false;
}

export function stripPending(node: TreeNode): TreeNode {
  const { isPending: _removed, ...rest } = node;
  return { ...rest, children: node.children.map(stripPending) };
}

// Chess utilities
export function uciToArrow(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: 'rgba(225,29,72,0.85)' };
}

export function uciToWhiteArrow(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: 'rgba(255,255,255,0.85)' };
}

export function getChildMoveArrows(tree: TreeNode, currentFen: string) {
  const currentNode = findNode(tree, currentFen);
  if (!currentNode || !currentNode.children.length) return [];
  
  const chess = new Chess(currentFen);
  const arrows: Array<{ startSquare: string; endSquare: string; color: string }> = [];
  
  for (const child of currentNode.children) {
    // Get all possible moves from current position
    const moves = chess.moves({ verbose: true });
    
    for (const move of moves) {
      // Make the move and check if it leads to the child position
      const testChess = new Chess(currentFen);
      try {
        const result = testChess.move(move);
        if (result && testChess.fen() === child.fen) {
          // Found the move, create white arrow
          const arrow = uciToWhiteArrow(move.from + move.to);
          if (arrow) arrows.push(arrow);
          break;
        }
      } catch {
        continue;
      }
    }
  }
  
  return arrows;
}

export function parsePgnMoves(pgn: string): { moves: string[]; finalFen: string } {
  // Extract just the move text
  const moveText = pgn
    .replace(/\[[^\]]*\]/g, '')      // Remove [Event "..."] headers
    .replace(/\{[^}]*\}/g, '')       // Remove {comment} annotations  
    .replace(/\d+\.\s*\.\./g, ' ')  // Remove "1. ..." ellipsis
    .replace(/\d+\.\s*/g, ' ')       // Remove "1. " move numbers
    .trim();

  // Split into tokens - extract all potential moves
  const tokens = moveText.split(/\s+/);
  const rawMoves: string[] = [];
  
  for (const token of tokens) {
    // Remove result markers and keep only chess notation
    let clean = token.replace(/[^a-hKQRBNP12345678O=?+#]/g, '');
    if (!clean || clean.length < 2) continue;
    if (clean === '1-0' || clean === '0-1' || clean === '1/2-1/2' || clean === '*') continue;
    rawMoves.push(clean);
  }

  // Try to build move list by playing on a chess board
  const validMoves: string[] = [];
  const game = new Chess();
  
  for (const move of rawMoves) {
    try {
      const result = game.move(move);
      if (result) {
        validMoves.push(move);
      }
    } catch {
      // If exact match fails, try fuzzy match
      const possible = game.moves({ verbose: true });
      const matched = possible.find(m => 
        m.san === move || 
        m.san.replace(/[+#?!=]/g, '') === move.replace(/[+#?!=]/g, '') ||
        m.san.startsWith(move.replace(/[+#?!=]/g, ''))
      );
      if (matched) {
        try {
          game.move(matched.san);
          validMoves.push(matched.san);
        } catch {}
      }
    }
  }

  return { moves: validMoves, finalFen: game.fen() };
}

// Review utilities
export function calculateDuePositions(tree: TreeNode, reviews: Array<{ fen: string; next_review_date: string }>, treeColor: 'white' | 'black'): number {
  const reviewMap = new Map(reviews.map(r => [r.fen, new Date(r.next_review_date)]));
  let dueCount = 0;
  const isPlayerWhite = treeColor === 'white';

  function traverse(node: TreeNode) {
    const chess = new Chess(node.fen);
    const isWhiteTurn = chess.turn() === 'w';
    const isSideToMatch = isPlayerWhite ? isWhiteTurn : !isWhiteTurn;

    if (isSideToMatch && node.children && node.children.length > 0) {
      const nextReview = reviewMap.get(node.fen);
      const isDue = !nextReview || nextReview <= new Date();
      if (isDue) dueCount++;
    }

    if (node.children) {
      node.children.forEach(child => traverse(child));
    }
  }

  traverse(tree);
  return dueCount;
}
