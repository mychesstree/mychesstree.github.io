import { Chess } from 'chess.js';
import type { TreeNode } from '../types/tree';
import { parsePgn } from './pgnParser';

// Tree traversal utilities
export function findNode(node: TreeNode, fen: string): TreeNode | null {
  if (node.fen === fen) return node;
  for (const child of node.children) {
    const hit = findNode(child, fen);
    if (hit) return hit;
  }
  return null;
}

export function getNodeDepth(node: TreeNode, targetFen: string, currentDepth = 0): number | null {
  if (node.fen === targetFen) return currentDepth;
  for (const child of node.children) {
    const depth = getNodeDepth(child, targetFen, currentDepth + 1);
    if (depth !== null) return depth;
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
  const arrows: Array<{ startSquare: string; endSquare: string; color: string; id: string }> = [];
  
  for (const child of currentNode.children) {
    // Get all possible moves from current position
    const moves = chess.moves({ verbose: true });
    
    for (const move of moves) {
      // Make the move and check if it leads to the child position
      const testChess = new Chess(currentFen);
      try {
        const result = testChess.move(move);
        if (result && testChess.fen() === child.fen) {
          // Found the move, create white arrow with unique ID
          const arrow = uciToWhiteArrow(move.from + move.to);
          if (arrow) {
            // Create unique ID using timestamp and random number to avoid duplicates
            const uniqueId = `${move.from}-${move.to}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            arrows.push({ ...arrow, id: uniqueId });
          }
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
  // Use the enhanced PGN parser for better compatibility
  const games = parsePgn(pgn);
  
  if (games.length === 0) {
    return { moves: [], finalFen: new Chess().fen() };
  }
  
  // Extract moves from the first game (for backward compatibility)
  const game = games[0];
  const moves = game.moves.map(m => m.san);
  const finalFen = game.moves.length > 0 ? game.moves[game.moves.length - 1].fen : new Chess().fen();
  
  return { moves, finalFen };
}

// PGN Import utilities
export function findDivergencePoint(tree: TreeNode, moves: string[]): { divergenceIndex: number; divergenceNode: TreeNode | null } {
  const game = new Chess();
  let currentNode = tree;
  
  for (let i = 0; i < moves.length; i++) {
    const moveResult = game.move(moves[i]);
    if (!moveResult) break;
    
    const gameFen = game.fen();
    
    // Find if this position exists in our tree at current node
    const matchingChild = currentNode.children.find(c => c.fen === gameFen);
    
    if (matchingChild) {
      currentNode = matchingChild;
    } else {
      // Found divergence point
      return { divergenceIndex: i, divergenceNode: currentNode };
    }
  }
  
  // All moves exist in tree
  return { divergenceIndex: moves.length, divergenceNode: currentNode };
}

export function extractMovesFromTree(tree: TreeNode): string[] {
  const moves: string[] = [];
  
  function traverse(node: TreeNode) {
    if (node.move) {
      moves.push(node.move);
    }
    for (const child of node.children) {
      traverse(child);
    }
  }
  
  traverse(tree);
  return moves;
}

export function findDuplicateGameBranch(parent: TreeNode, targetBranch: TreeNode): TreeNode | null {
  // Check if any child has the same game ID in the title
  // This is more reliable than just checking the first move
  if (targetBranch.title) {
    const gameIdMatch = targetBranch.title.match(/Game ID: (\w+)/);
    if (gameIdMatch) {
      const targetGameId = gameIdMatch[1];
      for (const child of parent.children) {
        if (child.title) {
          const childGameIdMatch = child.title.match(/Game ID: (\w+)/);
          if (childGameIdMatch && childGameIdMatch[1] === targetGameId) {
            return child;
          }
        }
      }
    }
  }
  return null;
}

export function findParentWithMultipleChildren(tree: TreeNode, startFen: string, maxDepth: number = 4): { parent: TreeNode; currentChildIndex: number; pathFen: string } | null {
  const findParent = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
    if (node.fen === targetFen) return parent;
    for (const child of node.children) {
      const found = findParent(child, targetFen, node);
      if (found) return found;
    }
    return null;
  };

  let currentFen = startFen;
  
  for (let depth = 0; depth < maxDepth; depth++) {
    const parent = findParent(tree, currentFen, null);
    if (!parent) break;
    
    if (parent.children.length > 1) {
      const currentIndex = parent.children.findIndex(child => child.fen === currentFen);
      if (currentIndex !== -1) {
        return { parent, currentChildIndex: currentIndex, pathFen: currentFen };
      }
    }
    currentFen = parent.fen;
  }
  return null;
}

export function addMovesAsVariation(tree: TreeNode, moves: string[], startIndex: number = 0): TreeNode {
  const clonedTree = JSON.parse(JSON.stringify(tree));
  const divergencePoint = findDivergencePoint(clonedTree, moves.slice(0, startIndex));
  
  if (!divergencePoint.divergenceNode) {
    return clonedTree; // Could not find divergence point
  }
  
  // Add remaining moves as new variation
  const game = new Chess();
  
  // Replay moves up to divergence point
  for (let i = 0; i < startIndex; i++) {
    game.move(moves[i]);
  }
  
  let currentParent = divergencePoint.divergenceNode;
  
  for (let i = startIndex; i < moves.length; i++) {
    try {
      const result = game.move(moves[i]);
      if (result) {
        const newNode: TreeNode = {
          fen: game.fen(),
          move: result.san,
          children: [],
          // Add basic node information from move
          title: `Move ${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'} ${result.san}`.substring(0, 20),
          description: `Position after ${result.san}`.substring(0, 100)
        };
        currentParent.children.push(newNode);
        currentParent = newNode;
      }
    } catch (e) {
      console.error('Failed to add move:', moves[i]);
      break;
    }
  }
  
  return clonedTree;
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
