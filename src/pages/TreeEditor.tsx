import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import TreeNotFound from './TreeNotFound';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import ForceTree from '../components/ForceTree';
import { useAuth } from '../hooks/useAuth';
import { useMobile } from '../hooks/useMobile';
import { ArrowLeft, Save, X, Share2, Trash2, Users, Import, Menu, Eye, Pencil, Globe, GlobeLock, Copy, Maximize } from 'lucide-react';
import TooltipButton from '../components/TooltipButton';
import MonthPicker from '../components/MonthPicker';
import { calientePieces, boardStyles } from '../lib/chessAssets';
import type { TreeNode } from '../types/tree';
import { uciToArrow, stripPending, findNode, countNodes, hasDuplicateFen, deleteNodeFromTree, parsePgnMoves, getChildMoveArrows, findDivergencePoint, addMovesAsVariation, extractMovesFromTree, findDuplicateGameBranch, findParentWithMultipleChildren } from '../utils/treeUtils';
import { parsePgn, pgnToTree, fetchLichessStudy, fetchLichessGames, fetchChesscomGames, processGamesToTree, filterDuplicateGames, type ArchivedGame } from '../utils/pgnParser';
import { studyCache } from '../utils/studyCache';
import { chesscomCache } from '../utils/chesscomCache';
import { useToast } from '../components/Toast';

// Component ─────────────────────────────────────────────────────────────────
export default function TreeEditor() {
  const { user, isGuest, getGuestTree, saveGuestTree } = useAuth();
  const isMobile = useMobile();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string; study?: string }>();
  const { error: showError, warning: showWarning, info: showInfo } = useToast();
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('study');

  const [treeMeta, setTreeMeta] = useState<any>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [treeNotFound, setTreeNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, active: false });
  const [isDeleteMode, setDeleteMode] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUsername, setShareUsername] = useState('');
  const [shareAccess, setShareAccess] = useState<'read' | 'edit'>('read');
  const [shareStatus, setShareStatus] = useState({ type: '', msg: '' });
  const [viewOnly, setViewOnly] = useState(false);
  const [existingShares, setExistingShares] = useState<any[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<'game' | 'study' | 'archive'>('game');
  const [importPgnText, setImportPgnText] = useState('');
  const [importedBranch] = useState<TreeNode | null>(null);
  const [studyUrl, setStudyUrl] = useState('');
  const [studyImportStatus, setStudyImportStatus] = useState<{ type: 'loading' | 'error' | 'success' | ''; msg: string }>({ type: '', msg: '' });
  
  // Archive import state
  const [archiveUsername, setArchiveUsername] = useState('');
  const [archiveColor, setArchiveColor] = useState<'white' | 'black' | 'both'>('both');
  const [archiveMaxMoves, setArchiveMaxMoves] = useState(10);
  const [isFetchingArchive, setIsFetchingArchive] = useState(false);
  const [fetchedGames, setFetchedGames] = useState<any[]>([]);
  const [archiveImportStatus, setArchiveImportStatus] = useState<{ type: 'loading' | 'error' | 'success' | ''; msg: string }>({ type: '', msg: '' });
  const [importedStudyChapters, setImportedStudyChapters] = useState<Array<{ name: string; tree: TreeNode }>>([]);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [showMenu, setShowMenu] = useState(false);
  const [showStudySelector, setShowStudySelector] = useState(false);
  const [cachedStudies, setCachedStudies] = useState<any[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);
  const [showChaptersModal, setShowChaptersModal] = useState(false);
  const [showChesscomModal, setShowChesscomModal] = useState(false);
  const [chesscomUsername, setChesscomUsername] = useState('');
  const [chesscomGames, setChesscomGames] = useState<any[]>([]);
  const [selectedChesscomGames, setSelectedChesscomGames] = useState<Set<string>>(new Set());
  const [isFetchingChesscomGames, setIsFetchingChesscomGames] = useState(false);
  const [chesscomImportStatus, setChesscomImportStatus] = useState<{ type: 'loading' | 'error' | 'success' | ''; msg: string }>({ type: '', msg: '' });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cachedChesscomEntries, setCachedChesscomEntries] = useState<any[]>([]);
  const [tempTreeData, setTempTreeData] = useState<TreeNode | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasFetchedGames, setHasFetchedGames] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [treeFullscreen, setTreeFullscreen] = useState(false);
  const [history, setHistory] = useState<TreeNode[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isPublic, setIsPublic] = useState(false);
  const [showPublicUrlModal, setShowPublicUrlModal] = useState(false);
  const [publicUrlCopied, setPublicUrlCopied] = useState(false);

  // Chess Ref
  const gameRef = useRef(new Chess());
  const [currentFen, setCurrentFen] = useState(() => gameRef.current.fen());

  // Helper function to add to history
  const addToHistory = useCallback((tree: TreeNode) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(tree)));
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  // Initialize history when tree data loads
  useEffect(() => {
    if (treeData && history.length === 0) {
      addToHistory(treeData);
    }
  }, [treeData, history.length, addToHistory]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newTree = history[historyIndex - 1];
      setTreeData(newTree);
      setHistoryIndex(prev => prev - 1);
      setHasPending(true);
    }
  }, [history, historyIndex]);

  // Keyboard navigation - left/right arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!treeData) return;
      
      // Undo functionality (Ctrl/Cmd + Z)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Find current node in tree
      const findNode = (node: TreeNode, fen: string): TreeNode | null => {
        if (node.fen === fen) return node;
        for (const child of node.children) {
          const found = findNode(child, fen);
          if (found) return found;
        }
        return null;
      };

      const currentNode = findNode(treeData, currentFen);
      if (!currentNode) return;

      if (e.key === 'ArrowRight') {
        // Go to first child (next move) - check tree first, then imported branch
        if (currentNode.children.length > 0) {
          const nextNode = currentNode.children[0];
          gameRef.current = new Chess(nextNode.fen);
          setCurrentFen(nextNode.fen);
        } else if (importedBranch && importedBranch.children.length > 0) {
          // Check if we're in an imported branch and find next node
          const findInImportedBranch = (node: TreeNode, targetFen: string): TreeNode | null => {
            if (node.fen === targetFen) return node;
            for (const child of node.children) {
              const found = findInImportedBranch(child, targetFen);
              if (found) return found;
            }
            return null;
          };

          // Check if we're at the diverge point
          if (currentFen === importedBranch.fen && importedBranch.children.length > 0) {
            const branchNode = importedBranch.children[0];
            gameRef.current = new Chess(branchNode.fen);
            setCurrentFen(branchNode.fen);
          } else {
            // Find current node in imported branch and go to its child
            const importedCurrentNode = findInImportedBranch(importedBranch, currentFen);
            if (importedCurrentNode && importedCurrentNode.children.length > 0) {
              const nextNode = importedCurrentNode.children[0];
              gameRef.current = new Chess(nextNode.fen);
              setCurrentFen(nextNode.fen);
            }
          }
        }
      } else if (e.key === 'ArrowLeft') {
        // Go to parent - check if we're in an imported branch first
        if (importedBranch && importedBranch.children.length > 0) {
          const findInImportedBranch = (node: TreeNode, targetFen: string): TreeNode | null => {
            if (node.fen === targetFen) return node;
            for (const child of node.children) {
              const found = findInImportedBranch(child, targetFen);
              if (found) return found;
            }
            return null;
          };

          const findParentInImportedBranch = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
            if (node.fen === targetFen) return parent;
            for (const child of node.children) {
              const found = findParentInImportedBranch(child, targetFen, node);
              if (found) return found;
            }
            return null;
          };
          
          // Check if we're in the imported branch
          const importedCurrentNode = findInImportedBranch(importedBranch, currentFen);
          if (importedCurrentNode) {
            // If we're at the diverge point, go back to main tree parent
            if (currentFen === importedBranch.fen) {
              const findParent = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
                if (node.fen === targetFen) return parent;
                for (const child of node.children) {
                  const found = findParent(child, targetFen, node);
                  if (found) return found;
                }
                return null;
              };
              const parentNode = findParent(treeData, currentFen, null);
              if (parentNode) {
                gameRef.current = new Chess(parentNode.fen);
                setCurrentFen(parentNode.fen);
              }
            } else {
              // Go to parent in imported branch
              const importedParent = findParentInImportedBranch(importedBranch, currentFen, null);
              if (importedParent) {
                gameRef.current = new Chess(importedParent.fen);
                setCurrentFen(importedParent.fen);
              }
            }
            return;
          }
        }
        
        // Otherwise find parent in tree
        const findParent = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
          if (node.fen === targetFen) return parent;
          for (const child of node.children) {
            const found = findParent(child, targetFen, node);
            if (found) return found;
          }
          return null;
        };
        const parentNode = findParent(treeData, currentFen, null);
        if (parentNode) {
          gameRef.current = new Chess(parentNode.fen);
          setCurrentFen(parentNode.fen);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Navigate between siblings - recursively search up to 4 parent levels for a parent with multiple children
        const findParent = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
          if (node.fen === targetFen) return parent;
          for (const child of node.children) {
            const found = findParent(child, targetFen, node);
            if (found) return found;
          }
          return null;
        };

        
        const result = findParentWithMultipleChildren(treeData, currentFen);
        
        if (result) {
          const { parent, currentChildIndex } = result;
          let nextIndex;
          if (e.key === 'ArrowUp') {
            // Go to previous sibling (wrap around)
            nextIndex = currentChildIndex === 0 ? parent.children.length - 1 : currentChildIndex - 1;
          } else {
            // Go to next sibling (wrap around)
            nextIndex = currentChildIndex === parent.children.length - 1 ? 0 : currentChildIndex + 1;
          }
          
          const nextSibling = parent.children[nextIndex];
          gameRef.current = new Chess(nextSibling.fen);
          setCurrentFen(nextSibling.fen);
        }
        
        // Also check imported branch for sibling navigation
        if (importedBranch && importedBranch.children.length > 0) {
          const findInImportedBranch = (node: TreeNode, targetFen: string): TreeNode | null => {
            if (node.fen === targetFen) return node;
            for (const child of node.children) {
              const found = findInImportedBranch(child, targetFen);
              if (found) return found;
            }
            return null;
          };

          const findParentInImportedBranch = (node: TreeNode, targetFen: string, parent: TreeNode | null): TreeNode | null => {
            if (node.fen === targetFen) return parent;
            for (const child of node.children) {
              const found = findParentInImportedBranch(child, targetFen, node);
              if (found) return found;
            }
            return null;
          };

          const findParentWithMultipleChildrenInImported = (tree: TreeNode, startFen: string, maxDepth: number = 4): { parent: TreeNode; currentChildIndex: number } | null => {
            let currentFen = startFen;
            
            for (let depth = 0; depth < maxDepth; depth++) {
              const parent = findParentInImportedBranch(tree, currentFen, null);
              if (!parent) break;
              
              if (parent.children.length > 1) {
                const currentIndex = parent.children.findIndex(child => child.fen === currentFen);
                if (currentIndex !== -1) {
                  return { parent, currentChildIndex: currentIndex };
                }
              }
              currentFen = parent.fen;
            }
            return null;
          };

          const importedCurrentNode = findInImportedBranch(importedBranch, currentFen);
          if (importedCurrentNode) {
            const result = findParentWithMultipleChildrenInImported(importedBranch, currentFen);
            if (result) {
              const { parent, currentChildIndex } = result;
              let nextIndex;
              if (e.key === 'ArrowUp') {
                nextIndex = currentChildIndex === 0 ? parent.children.length - 1 : currentChildIndex - 1;
              } else {
                nextIndex = currentChildIndex === parent.children.length - 1 ? 0 : currentChildIndex + 1;
              }
              
              const nextSibling = parent.children[nextIndex];
              gameRef.current = new Chess(nextSibling.fen);
              setCurrentFen(nextSibling.fen);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [treeData, currentFen, importedBranch, handleUndo]);

  // Engine
  const engineRef = useRef<Worker | null>(null);
  const [evalNum, setEvalNum] = useState(0);
  const [bestMove, setBestMove] = useState('');

  // Arrows
  // const boardWrapperRef = useRef<HTMLDivElement>(null);

  // ── Stockfish Local Worker ─────────────────────────────────────────────────
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker('/stockfish.js');
      engineRef.current = worker;

      worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        const cpM = line.match(/score cp (-?\d+)/);
        if (cpM) setEvalNum(parseInt(cpM[1]) / 100);
        const mateM = line.match(/score mate (-?\d+)/);
        if (mateM) setEvalNum(parseInt(mateM[1]) > 0 ? 100 : -100);

        const bmM = line.match(/^bestmove ([a-h][1-8][a-h][1-8])/);
        if (bmM) setBestMove(bmM[1]);
      };

      worker.postMessage('uci');
      worker.postMessage('isready');
      worker.postMessage('ucinewgame');
    } catch (err) {
      console.warn('Stockfish Local Worker failed:', err);
    }
    return () => worker?.terminate();
  }, []);

  const loadShares = async () => {
    if (!id || !user || !treeMeta?.user_id || user.id !== treeMeta.user_id) return;
    setLoadingShares(true);
    const { data } = await supabase
      .from('tree_shares')
      .select('*, users!inner(username)')
      .eq('tree_id', id);
    setExistingShares(data || []);
    setLoadingShares(false);
  };

  useEffect(() => {
    if (showShareModal) loadShares();
  }, [showShareModal, treeMeta?.user_id]);

  // Study management functions
  const loadCachedStudies = useCallback(() => {
    const studies = studyCache.getAllStudies();
    setCachedStudies(studies);
  }, []);

  // Chess.com cache management functions
  const loadCachedChesscomEntries = useCallback(() => {
    const entries = chesscomCache.getAllEntries();
    setCachedChesscomEntries(entries);
  }, []);

  // Load cached studies and Chess.com entries when study selector opens
  useEffect(() => {
    if (showStudySelector) {
      loadCachedStudies();
      loadCachedChesscomEntries();
    }
  }, [showStudySelector, loadCachedStudies, loadCachedChesscomEntries]);

  // Load Tree
  useEffect(() => {
    if (!id) return;
    
    if (isGuest) {
      // Guest user - first try to load from localStorage, then try public trees
      const tree = getGuestTree(id);
      if (tree) {
        setTreeMeta(tree);
        const root: TreeNode = tree.tree_data ?? { fen: new Chess().fen(), children: [] };
        setTreeData(root);
        gameRef.current = new Chess(root.fen);
        setCurrentFen(root.fen);
        setViewOnly(false); // Guests can edit their own trees
        setLoading(false);
      } else {
        // Try to load as public tree
        (async () => {
          try {
            const { data, error } = await supabase.from('trees').select('*').eq('id', id).eq('is_public', true).maybeSingle();
            if (error) {
              console.error('Public tree loading error:', error);
              setTreeNotFound(true);
            } else if (data) {
              // Load public tree as read-only
              setTreeMeta(data);
              const root: TreeNode = data.tree_data ?? { fen: new Chess().fen(), children: [] };
              setTreeData(root);
              gameRef.current = new Chess(root.fen);
              setCurrentFen(root.fen);
              setViewOnly(true); // Public trees are read-only for guests
            } else {
              setTreeNotFound(true);
            }
          } catch (err) {
            console.error('Failed to load public tree:', err);
            setTreeNotFound(true);
          }
          setLoading(false);
        })();
      }
    } else if (user) {
      // Signed-in user - load from Supabase
      (async () => {
        const { data, error } = await supabase.from('trees').select('*').eq('id', id).maybeSingle();
        if (error) {
          console.error('Tree loading error:', error);
          if (error.code === 'PGRST116') {
            // Tree not found
            setTreeNotFound(true);
          } else {
            showError('Failed to load tree');
            setTreeNotFound(true);
          }
        } else if (data) {
          setTreeMeta(data);
          const root: TreeNode = data.tree_data ?? { fen: new Chess().fen(), children: [] };
          setTreeData(root);
          gameRef.current = new Chess(root.fen);
          setCurrentFen(root.fen);

          // Logic check: are we the owner?
          if (data.user_id !== user.id) {
            const { data: share } = await supabase
              .from('tree_shares')
              .select('access_level')
              .eq('tree_id', id)
              .eq('user_id', user.id)
              .maybeSingle();

            if (!share || share.access_level === 'read') {
              setViewOnly(true);
            }
          }
        } else {
          setTreeNotFound(true);
        }
        setLoading(false);
      })();
    }
  }, [id, user, isGuest, getGuestTree]);

  // Load public status from tree metadata
  useEffect(() => {
    if (treeMeta) {
      setIsPublic(treeMeta.is_public || false);
    }
  }, [treeMeta]);

  const togglePublic = async () => {
    if (!id || !user || isGuest) return;
    
    const newPublicStatus = !isPublic;
    const { error } = await supabase
      .from('trees')
      .update({ 
        is_public: newPublicStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (!error) {
      setIsPublic(newPublicStatus);
      setTreeMeta((prev: any) => prev ? { ...prev, is_public: newPublicStatus } : null);
      
      // Show URL modal when making tree public
      if (newPublicStatus) {
        setShowPublicUrlModal(true);
        setPublicUrlCopied(false);
      }
    }
  };

  const copyPublicUrl = async () => {
    const publicUrl = `${window.location.origin}/#/editor/${id}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setPublicUrlCopied(true);
      setTimeout(() => setPublicUrlCopied(false), 2000);
    } catch (err) {
      showError('Failed to copy URL');
    }
  };

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.postMessage('stop');
    eng.postMessage(`position fen ${currentFen}`);
    eng.postMessage('go depth 12');
    setBestMove('');
  }, [currentFen]);

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
      const prevFen = gameRef.current.fen();
      let moveObj: any = null;
      try {
        moveObj = gameRef.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      } catch { /* ... */ }

      if (!moveObj) {
        gameRef.current = new Chess(prevFen);
        return false;
      }

      const newFen = gameRef.current.fen();
      setCurrentFen(newFen);

      const newTree = (() => {
        if (!treeData) return treeData;
        const cloned: TreeNode = JSON.parse(JSON.stringify(treeData));
        const parent = findNode(cloned, prevFen);
        if (!parent) return treeData;
        parent.children.push({ fen: newFen, move: moveObj.san, children: [] });
        return cloned;
      })();
      if (newTree) {
        setTreeData(newTree);
        addToHistory(newTree);
        setHasPending(true);
      }

      return true;
    },
    [treeData, addToHistory]
  );

  const handleNodeClick = useCallback((nodeInfo: any) => {
    if (isDeleteMode) {
      if (nodeInfo.depth === 0) return; // Cannot delete root
      setNodeToDelete(nodeInfo);
      return;
    }
    gameRef.current = new Chess(nodeInfo.fen);
    setCurrentFen(nodeInfo.fen);
  }, [isDeleteMode]);

  const confirmDelete = useCallback(() => {
    if (!nodeToDelete || !treeData) return;

    const newTree = (() => {
      if (!treeData) return treeData;
      const cloned = JSON.parse(JSON.stringify(treeData));
      const deleted = deleteNodeFromTree(cloned, nodeToDelete.fen);
      if (!deleted) return treeData;
      return cloned;
    })();
    setTreeData(newTree);
    addToHistory(newTree);

    // Reset to start if deleted node was current position
    if (currentFen === nodeToDelete.fen) {
      gameRef.current = new Chess(treeData.fen);
      setCurrentFen(treeData.fen);
    }

    setNodeToDelete(null);
  }, [nodeToDelete, treeData, currentFen]);



  const handleSave = useCallback(async () => {
    if (!id || !treeData) return;
    setSaving(true);
    const cleaned = stripPending(treeData);
    
    if (isGuest) {
      // Guest user - save to localStorage
      const tree = getGuestTree(id);
      if (tree) {
        const updatedTree = {
          ...tree,
          tree_data: cleaned,
          updated_at: new Date().toISOString()
        };
        saveGuestTree(updatedTree);
        setTreeData(cleaned);
        setHasPending(false);
      }
    } else {
      // Signed-in user - save to Supabase
      const { error } = await supabase.from('trees').update({ tree_data: cleaned, updated_at: new Date().toISOString() }).eq('id', id);
      if (!error) {
        setTreeData(cleaned);
        setHasPending(false);
      }
    }
    setSaving(false);
  }, [id, treeData, isGuest, getGuestTree, saveGuestTree]);

  const handleImport = useCallback(() => {
    const pgn = importPgnText.trim();
    if (!pgn || !treeData) return;
    const { moves } = parsePgnMoves(pgn);
    if (moves.length === 0) {
      showWarning('No valid moves found in PGN');
      return;
    }

    console.log('Parsed moves:', moves);

    // Find divergence point using utility function
    const { divergenceIndex, divergenceNode } = findDivergencePoint(treeData, moves);
    
    console.log('Divergence point:', { divergenceIndex, divergenceNode: divergenceNode?.fen });

    // If all moves exist
    if (divergenceIndex === moves.length) {
      showInfo('All moves already exist in your tree!');
      return;
    }

    if (!divergenceNode) {
      showError('Could not find divergence point in tree');
      return;
    }

    // Add moves as variation using utility function
    const updatedTree = addMovesAsVariation(treeData, moves, divergenceIndex);

    // Set the temporary tree data to show the integration
    setTempTreeData(updatedTree);
    setHasUnsavedChanges(true);
    setStudyImportStatus({ type: 'success', msg: `PGN imported with ${moves.length - divergenceIndex} new moves. Click Save to make permanent.` });
    
    setShowImportModal(false);
    setImportPgnText('');
  }, [importPgnText, treeData]);

  const handleStudyImport = useCallback(async () => {
    if (!studyUrl.trim()) {
      setStudyImportStatus({ type: 'error', msg: 'Please enter a Lichess study URL' });
      return;
    }

    // Extract study ID from URL
    const studyIdMatch = studyUrl.match(/lichess\.org\/study\/([a-zA-Z0-9]+)/);
    if (!studyIdMatch) {
      setStudyImportStatus({ type: 'error', msg: 'Invalid Lichess study URL. Expected format: https://lichess.org/study/xxxxx' });
      return;
    }

    const studyId = studyIdMatch[1];
    setStudyImportStatus({ type: 'loading', msg: 'Loading study...' });

    try {
      // Check cache first
      let cachedStudy = studyCache.getStudy(studyId);
      let study;
      
      if (!cachedStudy) {
        setStudyImportStatus({ type: 'loading', msg: 'Fetching study from Lichess...' });
        study = await fetchLichessStudy(studyId);
        if (!study) {
          setStudyImportStatus({ type: 'error', msg: 'Failed to fetch study. Make sure the study is public.' });
          return;
        }
        // Save to cache
        studyCache.saveStudy(study);
      } else {
        setStudyImportStatus({ type: 'loading', msg: 'Loading from cache...' });
        study = cachedStudy;
      }

      // Parse all chapters from the study data
      const chapters: Array<{ name: string; tree: TreeNode }> = [];
      
      for (const chapter of study.chapters) {
        try {
          if (chapter.pgn) {
            const games = parsePgn(chapter.pgn);
            if (games.length > 0) {
              const tree = pgnToTree(games[0].moves);
              chapters.push({
                name: chapter.name || `Chapter ${chapter.id}`,
                tree
              });
            }
          }
        } catch (error) {
          showError(`Failed to parse chapter ${chapter.id}`);
        }
      }

      if (chapters.length === 0) {
        setStudyImportStatus({ type: 'error', msg: 'No valid chapters found in study' });
        return;
      }

      setImportedStudyChapters(chapters);
      setStudyImportStatus({ type: 'success', msg: `Successfully imported ${chapters.length} chapters` });
    } catch (error) {
      showError('Failed to import study. Please try again.');
      setStudyImportStatus({ type: 'error', msg: 'Failed to import study. Please try again.' });
    }
  }, [studyUrl]);

  const handleAddStudyChapter = useCallback((chapterTree: TreeNode, chapterName: string) => {
    // Use temporary editing system
    handleAddChapterTemp(chapterTree, chapterName);
    
    // Close the modal
    setShowImportModal(false);
    setImportedStudyChapters([]);
    setStudyImportStatus({ type: '', msg: '' });
    setStudyUrl('');
  }, [treeData]);

  const handleSelectChesscomEntry = useCallback((entry: any) => {
    // Load the cached games for this entry
    setChesscomGames(entry.games);
    setSelectedChesscomGames(new Set());
    setShowChesscomModal(true);
    setChesscomUsername(entry.username);
    setSelectedMonth(entry.month);
    setHasFetchedGames(true);
    setChesscomImportStatus({ type: 'success', msg: `Loaded ${entry.games.length} cached games for ${entry.month}.` });
  }, []);

  const handleRemoveChesscomEntry = useCallback((entry: any) => {
    if (confirm(`Remove cached games for ${entry.month}?`)) {
      chesscomCache.removeGames(entry.username, entry.month);
      loadCachedChesscomEntries();
    }
  }, [loadCachedChesscomEntries]);

  
  const handleSelectStudy = useCallback((study: any) => {
    setSelectedStudy(study);
    setShowStudySelector(false);
    setSelectedChapters(new Set()); // Reset selection when opening new study
    
    // Parse chapters from cached study
    const chapters: Array<{ name: string; tree: TreeNode }> = [];
    
    for (const chapter of study.chapters) {
      try {
        if (chapter.pgn) {
          const games = parsePgn(chapter.pgn);
          if (games.length > 0) {
            const tree = pgnToTree(games[0].moves);
            chapters.push({
              name: chapter.name || `Chapter ${chapter.id}`,
              tree
            });
          }
        }
      } catch (error) {
        showError(`Failed to parse chapter ${chapter.id}`);
      }
    }
    
    setImportedStudyChapters(chapters);
    setShowChaptersModal(true);
  }, []);

  const handleAddChapterTemp = useCallback((chapterTree: TreeNode, chapterName: string) => {
    // Extract moves from chapter tree
    const chapterMoves = extractMovesFromTree(chapterTree);
    if (chapterMoves.length === 0) {
      setStudyImportStatus({ type: 'error', msg: 'No moves found in chapter' });
      return;
    }

    // Use current tree data or temporary tree data as base
    const baseTree = tempTreeData || treeData || { fen: new Chess().fen(), children: [] };
    
    // Find divergence point and add moves as variation
    const { divergenceIndex } = findDivergencePoint(baseTree, chapterMoves);
    
    if (divergenceIndex === chapterMoves.length) {
      setStudyImportStatus({ type: 'error', msg: `All moves from "${chapterName}" already exist in your tree!` });
      return;
    }

    const updatedTree = addMovesAsVariation(baseTree, chapterMoves, divergenceIndex);
    
    setTempTreeData(updatedTree);
    setHasUnsavedChanges(true);
    
    // Show notification with details
    const newMovesCount = chapterMoves.length - divergenceIndex;
    setStudyImportStatus({ type: 'success', msg: `Added "${chapterName}" with ${newMovesCount} new moves. Click Save to make permanent.` });
  }, [tempTreeData, treeData]);

  const handleSaveTemporaryChanges = useCallback(() => {
    if (tempTreeData && hasUnsavedChanges) {
      // Update all state in a single batch to ensure notification disappears immediately
      const newTreeData = tempTreeData;
      setTreeData(newTreeData);
      setTempTreeData(null);
      setHasUnsavedChanges(false);
      addToHistory(newTreeData);
      setHasPending(true);
      setStudyImportStatus({ type: 'success', msg: 'Changes saved successfully!' });
    }
  }, [tempTreeData, hasUnsavedChanges, addToHistory]);

  const handleNodeUpdate = useCallback((nodeFen: string, title: string, description: string) => {
    if (!treeData) return;
    
    const updateNodeInfo = (node: TreeNode): TreeNode => {
      if (node.fen === nodeFen) {
        return { ...node, title, description };
      }
      return {
        ...node,
        children: node.children.map(updateNodeInfo)
      };
    };
    
    const updatedTree = updateNodeInfo(treeData);
    setTreeData(updatedTree);
    addToHistory(updatedTree);
    setHasPending(true);
  }, [treeData, addToHistory]);

  const handleDiscardTemporaryChanges = useCallback(() => {
    setTempTreeData(null);
    setHasUnsavedChanges(false);
    setStudyImportStatus({ type: '', msg: '' });
  }, []);

  const handleArchiveImport = useCallback(async () => {
    if (!archiveUsername.trim()) {
      setArchiveImportStatus({ type: 'error', msg: 'Please enter a username' });
      return;
    }

    setIsFetchingArchive(true);
    setArchiveImportStatus({ type: 'loading', msg: 'Fetching games from Lichess...' });

    try {
      const games = await fetchLichessGames(archiveUsername, {
        color: archiveColor,
        maxMoves: archiveMaxMoves,
        batchSize: 50
      });

      if (games.length === 0) {
        setArchiveImportStatus({ type: 'error', msg: 'No games found. Check username and try again.' });
        return;
      }

      // Filter out games that already exist in the tree
      const currentTree = tempTreeData || treeData;
      const filteredGames = filterDuplicateGames(games, currentTree);
      
      if (filteredGames.length === 0) {
        setArchiveImportStatus({ type: 'success', msg: 'All fetched games are already in your tree.' });
        return;
      }

      setFetchedGames(filteredGames);
      const skippedCount = games.length - filteredGames.length;
      const msg = skippedCount > 0 
        ? `Found ${filteredGames.length} new games (${skippedCount} already imported). Select games to import.`
        : `Found ${filteredGames.length} games. Select games to import.`;
      setArchiveImportStatus({ type: 'success', msg });
    } catch (error) {
      console.error('Archive import error:', error);
      setArchiveImportStatus({ type: 'error', msg: 'Failed to fetch games. Please try again.' });
    } finally {
      setIsFetchingArchive(false);
    }
  }, [archiveUsername, archiveColor, archiveMaxMoves]);

  // Generate available months (last 12 months, excluding current month)
  const generateAvailableMonths = useCallback(() => {
    const months = [];
    const currentDate = new Date();
    
    for (let i = 1; i <= 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthString = date.toISOString().slice(0, 7); // YYYY-MM format
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      months.push({ value: monthString, label: monthName });
    }
    
    return months;
  }, []);

  // Initialize with current month on component mount
  useEffect(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7); // YYYY-MM format
    setSelectedMonth(currentMonth);
  }, []);

  // Auto-select most recent month when username changes
  useEffect(() => {
    if (chesscomUsername.trim() && !selectedMonth) {
      const months = generateAvailableMonths();
      if (months.length > 0) {
        setSelectedMonth(months[0].value); // Default to most recent month
      }
    }
  }, [chesscomUsername, selectedMonth, generateAvailableMonths]);

  // Reset fetch state when username or month changes
  useEffect(() => {
    setHasFetchedGames(false);
    setSelectedChesscomGames(new Set());
  }, [chesscomUsername, selectedMonth]);

  // Chess.com specific import functions
  const handleFetchChesscomGames = useCallback(async () => {
    if (!chesscomUsername.trim()) {
      setChesscomImportStatus({ type: 'error', msg: 'Please enter a Chess.com username' });
      return;
    }

    if (!selectedMonth) {
      setChesscomImportStatus({ type: 'error', msg: 'Please select a month' });
      return;
    }

    setIsFetchingChesscomGames(true);
    setChesscomImportStatus({ type: 'loading', msg: 'Fetching games from Chess.com...' });

    try {
      // Check cache first
      let cachedGames = chesscomCache.getGames(chesscomUsername, selectedMonth);
      let games;
      
      if (cachedGames) {
        setChesscomImportStatus({ type: 'loading', msg: 'Loading from cache...' });
        games = cachedGames.games;
      } else {
        setChesscomImportStatus({ type: 'loading', msg: 'Fetching from Chess.com...' });
        games = await fetchChesscomGames(chesscomUsername, {
          color: 'both',
          maxMoves: 10,
          batchSize: 50,
          month: selectedMonth
        });
        
        // Save to cache
        if (games.length > 0) {
          chesscomCache.saveGames(chesscomUsername, selectedMonth, games);
          loadCachedChesscomEntries(); // Refresh cache list
        }
      }

      if (games.length === 0) {
        setChesscomImportStatus({ type: 'error', msg: `No games found for ${selectedMonth}. Try a different month.` });
        return;
      }

      setChesscomGames(games);
      setHasFetchedGames(true);
      setChesscomImportStatus({ type: 'success', msg: '' });
    } catch (error) {
      console.error('Chess.com import error:', error);
      setChesscomImportStatus({ type: 'error', msg: 'Failed to fetch games. Please try again.' });
    } finally {
      setIsFetchingChesscomGames(false);
    }
  }, [chesscomUsername, selectedMonth]);

  const handleToggleChesscomGame = useCallback((gameId: string) => {
    setSelectedChesscomGames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gameId)) {
        newSet.delete(gameId);
      } else {
        newSet.add(gameId);
      }
      return newSet;
    });
  }, []);

  const handleImportSelectedChesscomGames = useCallback(() => {
    if (selectedChesscomGames.size === 0) {
      setChesscomImportStatus({ type: 'error', msg: 'Please select at least one game to import.' });
      return;
    }

    setChesscomImportStatus({ type: 'loading', msg: 'Processing selected games...' });

    const selectedGames = chesscomGames.filter(game => selectedChesscomGames.has(game.id));
    const currentTree = tempTreeData || treeData || { fen: new Chess().fen(), children: [] };
    
    // Process games to tree structure
    const chesscomTree = processGamesToTree(selectedGames, 10, currentTree);
    
    if (chesscomTree.children.length === 0) {
      setChesscomImportStatus({ type: 'error', msg: `No valid moves found in ${selectedGames.length} selected game(s). The games may be incomplete or have invalid PGN format.` });
      return;
    }

    // Instead of extracting moves as a linear sequence, merge the tree structures directly
    // This preserves the branching structure of multiple games
    let updatedTree = JSON.parse(JSON.stringify(currentTree));
    let totalNewMoves = 0;
    let skippedGames = 0;
    
    // Add each game as a separate branch from the root
    for (const gameBranch of chesscomTree.children) {
      // Find if this game already exists in the tree
      const existingBranch = findDuplicateGameBranch(updatedTree, gameBranch);
      if (!existingBranch) {
        // Add the entire game branch as a child of the root
        updatedTree.children.push(gameBranch);
        totalNewMoves += countNodes(gameBranch);
      } else {
        skippedGames++;
      }
    }
    
    if (totalNewMoves === 0 && skippedGames > 0) {
      setChesscomImportStatus({ type: 'error', msg: `All selected games already exist in your tree! Try selecting different games.` });
      return;
    } else if (totalNewMoves === 0) {
      setChesscomImportStatus({ type: 'error', msg: `No valid moves found in ${selectedGames.length} selected game(s). The games may be incomplete or have invalid PGN format.` });
      return;
    }
    
    setTempTreeData(updatedTree);
    setHasUnsavedChanges(true);
    
    // Show notification with details
    const addedGames = selectedChesscomGames.size - skippedGames;
    const msg = skippedGames > 0 
      ? `Added ${addedGames} new games with ${totalNewMoves} moves (${skippedGames} games already existed). Click Save to make permanent.`
      : `Added ${addedGames} games with ${totalNewMoves} total moves. Click Save to make permanent.`;
    setChesscomImportStatus({ type: 'success', msg });
    
    // Close modal after successful import
    setTimeout(() => {
      setShowChesscomModal(false);
      setSelectedChesscomGames(new Set());
      setChesscomGames([]);
      setChesscomUsername('');
      setChesscomImportStatus({ type: '', msg: '' });
    }, 2000);
  }, [selectedChesscomGames, chesscomGames, tempTreeData, treeData]);

  // Lichess chapter handling functions
  const handleToggleChapter = useCallback((chapterName: string) => {
    setSelectedChapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chapterName)) {
        newSet.delete(chapterName);
      } else {
        newSet.add(chapterName);
      }
      return newSet;
    });
  }, []);

  const handleImportSelectedChapters = useCallback(() => {
    if (selectedChapters.size === 0) {
      setStudyImportStatus({ type: 'error', msg: 'Please select at least one chapter to import.' });
      return;
    }

    setStudyImportStatus({ type: 'loading', msg: 'Processing selected chapters...' });

    const selectedChaptersData = importedStudyChapters.filter(chapter => selectedChapters.has(chapter.name));
    const currentTree = tempTreeData || treeData || { fen: new Chess().fen(), children: [] };
    
    let updatedTree = JSON.parse(JSON.stringify(currentTree));
    let totalNewMoves = 0;
    let skippedChapters = 0;
    
    // Add each chapter as a separate branch from the root
    for (const chapter of selectedChaptersData) {
      // Extract moves from chapter tree
      const chapterMoves = extractMovesFromTree(chapter.tree);
      if (chapterMoves.length === 0) {
        skippedChapters++;
        continue;
      }
      
      // Find divergence point and add moves as variation
      const { divergenceIndex } = findDivergencePoint(updatedTree, chapterMoves);
      
      if (divergenceIndex === chapterMoves.length) {
        skippedChapters++;
        continue;
      }

      const newMovesCount = chapterMoves.length - divergenceIndex;
      if (newMovesCount > 0) {
        updatedTree = addMovesAsVariation(updatedTree, chapterMoves, divergenceIndex);
        totalNewMoves += newMovesCount;
      } else {
        skippedChapters++;
      }
    }
    
    if (totalNewMoves === 0 && skippedChapters > 0) {
      setStudyImportStatus({ type: 'error', msg: `All selected chapters already exist in your tree! Try selecting different chapters.` });
      return;
    } else if (totalNewMoves === 0) {
      setStudyImportStatus({ type: 'error', msg: `No valid moves found in ${selectedChapters.size} selected chapters.` });
      return;
    }
    
    setTempTreeData(updatedTree);
    setHasUnsavedChanges(true);
    
    // Show notification with details
    const addedChapters = selectedChapters.size - skippedChapters;
    const msg = skippedChapters > 0 
      ? `Added ${addedChapters} new chapters with ${totalNewMoves} moves (${skippedChapters} chapters already existed). Click Save to make permanent.`
      : `Added ${addedChapters} chapters with ${totalNewMoves} total moves. Click Save to make permanent.`;
    setStudyImportStatus({ type: 'success', msg });
    
    // Close modal after successful import
    setTimeout(() => {
      setShowChaptersModal(false);
      setSelectedChapters(new Set());
      setImportedStudyChapters([]);
      setStudyImportStatus({ type: '', msg: '' });
    }, 2000);
  }, [selectedChapters, importedStudyChapters, tempTreeData, treeData]);

  const handleProcessSelectedGames = useCallback(() => {
    if (fetchedGames.length === 0) return;

    const selectedGames = fetchedGames; // For now, import all fetched games
    const currentTree = tempTreeData || treeData;
    const archiveTree = processGamesToTree(selectedGames, archiveMaxMoves, currentTree);

    if (archiveTree.children.length === 0) {
      setArchiveImportStatus({ type: 'error', msg: 'No valid moves found in selected games.' });
      return;
    }

    // Merge with existing temporary data if any
    const mergedTree = tempTreeData ? {
      fen: tempTreeData.fen,
      children: [...tempTreeData.children, ...archiveTree.children]
    } : archiveTree;

    // Add archive tree as temporary data
    setTempTreeData(mergedTree);
    setHasUnsavedChanges(true);
    setArchiveImportStatus({ type: 'success', msg: `Added ${archiveTree.children.length} game variations. Click Save to make permanent.` });
    
    // Close modal and reset state
    setShowImportModal(false);
    setFetchedGames([]);
    setArchiveImportStatus({ type: '', msg: '' });
  }, [fetchedGames, treeData, tempTreeData, archiveMaxMoves]);

  // Load cached studies when selector opens
  useEffect(() => {
    if (showStudySelector) {
      loadCachedStudies();
    }
  }, [showStudySelector, loadCachedStudies]);

  // Handle study parameter - load study and show chapters
  useEffect(() => {
    if (studyId) {
      const cachedStudy = studyCache.getStudy(studyId);
      if (cachedStudy) {
        handleSelectStudy(cachedStudy);
      }
    }
  }, [studyId]);

  // Derived
  const isWhiteTurn = gameRef.current.turn() === 'w';
  const perspScore = isWhiteTurn ? evalNum : -evalNum;
  const whitePercent = 50 + 50 * (2 / Math.PI) * Math.atan(perspScore / 4);
  
  // Combine pink engine arrows with white child move arrows with unique keys
  const engineArrows = uciToArrow(bestMove) ? [{ ...uciToArrow(bestMove)!, key: `engine-${bestMove}` }] : [];
  const childArrows = treeData ? getChildMoveArrows(treeData, currentFen).map((arrow, index) => ({
    ...arrow,
    key: arrow.id || `child-${arrow.startSquare}-${arrow.endSquare}-${index}`
  })) : [];
  
  // Remove duplicate arrows based on start and end squares to prevent key conflicts
  const uniqueArrows = [...engineArrows, ...childArrows].filter((arrow, index, self) => 
    index === self.findIndex(a => a.startSquare === arrow.startSquare && a.endSquare === arrow.endSquare)
  );
  const arrows = uniqueArrows;
  
  const boardOrientation: 'white' | 'black' = treeMeta?.color === 'black' ? 'black' : 'white';

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      Loading tree…
    </div>
  );
  if (treeNotFound || !treeMeta) return <TreeNotFound />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: `calc(100vh - ${isMobile && headerCollapsed ? '0rem' : 'var(--header-height)'} - 1rem)`, gap: `${isMobile ? '0rem' : '1rem'}` }}>
      {/* Share Modal */}
      {showShareModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 400, width: '100%', position: 'relative' }}>
            <button onClick={() => setShowShareModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Share2 size={24} color="var(--accent-color)" />
              Share Tree
            </h2>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Recipient Username</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter exact username"
                    value={shareUsername}
                    onChange={(e) => setShareUsername(e.target.value.toLowerCase())}
                    style={{ flex: 1 }}
                  />
                  <TooltipButton
                    tooltip={`Current: ${shareAccess === 'read' ? 'Read Only' : 'Edit Access'} - Click to toggle`}
                    onClick={() => setShareAccess(shareAccess === 'read' ? 'edit' : 'read')}
                    className="btn btn-secondary"
                    style={{ 
                      padding: '0.5rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      minWidth: '44px',
                      height: '40px',
                      flexShrink: 0
                    }}
                  >
                    {shareAccess === 'read' ? <Eye size={18} /> : <Pencil size={18} />}
                  </TooltipButton>
                </div>
              </div>
            </div>

            {shareStatus.msg && (
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                backgroundColor: shareStatus.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                color: shareStatus.type === 'error' ? '#ef4444' : '#22c55e',
                border: `1px solid ${shareStatus.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`
              }}>
                {shareStatus.msg}
              </div>
            )}

            <button
              onClick={async () => {
                setShareStatus({ type: '', msg: '' });
                try {
                  const { data: resUser, error: userError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', shareUsername)
                    .single();

                  if (userError || !resUser) {
                    showError('User not found');
                    return;
                  }

                  const { error: shareError } = await supabase
                    .from('tree_shares')
                    .upsert({ tree_id: id, user_id: resUser.id, access_level: shareAccess });

                  if (shareError) throw shareError;
                  setShareStatus({ type: 'success', msg: `Shared with ${shareUsername}!` });
                  setShareUsername('');
                  loadShares();
                } catch (err: any) {
                  setShareStatus({ type: 'error', msg: err.message });
                }
              }}
              className="btn"
              style={{ width: '100%', marginTop: '1rem' }}
            >
              Grant Access
            </button>

            {/* Public Toggle */}
            {!isGuest && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Make Tree Public</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {isPublic && (
                      <button
                        onClick={copyPublicUrl}
                        className="btn btn-secondary"
                        style={{ 
                          padding: '0.6rem 0.6rem',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        {publicUrlCopied ? (
                          'Copied!'
                        ) : (
                          <>
                            <Copy size={14} />
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={togglePublic}
                      className={`btn ${isPublic ? 'btn-public' : 'btn-secondary'}`}
                      style={{ 
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: isPublic ? '#ffffff' : undefined
                      }}
                    >
                      {isPublic ? <Globe size={16} /> : <GlobeLock size={16} />}
                      {isPublic ? 'Public' : 'Private'}
                    </button>
                  </div>
                </div>
                <p className="text-muted text-sm" style={{ margin: 0 }}>
                  {isPublic 
                    ? 'Anyone can view this tree with the link. Toggle to make it private.' 
                    : 'Make this tree accessible to anyone with the link.'}
                </p>
              </div>
            )}

            {/* Existing Shares List */}
            {user?.id === treeMeta.user_id && (
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Current Collaborators</h4>
                {loadingShares ? <div className="text-muted">Loading...</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {existingShares.length === 0 ? <div className="text-muted text-sm">No shares yet.</div> : existingShares.map(s => (
                      <div key={s.user_id} className="flex items-center justify-between" style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div 
                            style={{ 
                              padding: '0.25rem', 
                              marginLeft: '0.5rem',
                              borderRadius: '4px', 
                              backgroundColor: 'rgba(255,255,255,0.1)', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px'
                            }}
                          >
                            {s.access_level === 'read' ? <Eye size={14} /> : <Pencil size={14} />}
                          </div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{s.users?.username || 'Unknown'}</div>
                        </div>
                        <button
                          onClick={async () => {
                            await supabase.from('tree_shares').delete().eq('tree_id', id).eq('user_id', s.user_id);
                            loadShares();
                          }}
                          className="btn btn-icon btn-secondary"
                          style={{ color: '#ef4444' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Public URL Modal */}
      {showPublicUrlModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 450, width: '100%', position: 'relative' }}>
            <button onClick={() => setShowPublicUrlModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={24} color="#ffffff" />
              Tree is Now Public!
            </h2>
            <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
              Your tree "{treeMeta?.title}" is now publicly accessible. Share this URL with anyone to let them view your repertoire:
            </p>

            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              marginBottom: '1.5rem',
              padding: '0.75rem',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)'
            }}>
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/#/editor/${id}`}
                style={{ 
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace'
                }}
              />
              <button
                onClick={copyPublicUrl}
                className="btn btn-secondary"
                style={{ 
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {publicUrlCopied ? (
                  <>
                    <span style={{ color: '#ffffff' }}>Copied!</span>
                  </>
                ) : (
                  <>
                    Copy Link
                  </>
                )}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setShowPublicUrlModal(false)}
                className="btn"
                style={{ flex: 1 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 500, width: '100%', position: 'relative' }}>
            <button onClick={() => { setShowImportModal(false); setImportPgnText(''); }} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Import size={24} color="var(--accent-color)" />
              Import Lichess Game
            </h2>
            <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
              Paste a PGN from a Lichess export to preview it as a branch. This won't be saved until you copy moves to your repertoire.
            </p>

            <textarea
              className="input"
              placeholder="Paste PGN here..."
              value={importPgnText}
              onChange={(e) => setImportPgnText(e.target.value)}
              style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: '0.8rem' }}
            />

            <button
              onClick={handleImport}
              className="btn"
              style={{ width: '100%', marginTop: '1rem' }}
            >
              Preview Branch
            </button>
          </div>
        </div>
      )}

      {/* Combined Import Modal */}
      {showImportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 600, width: '100%', position: 'relative', maxHeight: '80vh', overflowY: 'auto' }}>
            <button onClick={() => { 
              setShowImportModal(false); 
              setImportPgnText('');
              setStudyUrl(''); 
              setStudyImportStatus({ type: '', msg: '' }); 
              setImportedStudyChapters([]); 
            }} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Import size={24} color="var(--accent-color)" />
              Import from Lichess
            </h2>

            {/* Tab Navigation */}
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              marginBottom: '1rem',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <button
                onClick={() => setImportTab('game')}
                className={`btn ${importTab === 'game' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  borderBottom: importTab === 'game' ? '2px solid var(--accent-color)' : 'none',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
                }}
              >
                Import Game
              </button>
              <button
                onClick={() => setImportTab('study')}
                className={`btn ${importTab === 'study' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  borderBottom: importTab === 'study' ? '2px solid var(--accent-color)' : 'none',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
                }}
              >
                Import Study
              </button>
              <button
                onClick={() => setImportTab('archive')}
                className={`btn ${importTab === 'archive' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ 
                  borderBottom: importTab === 'archive' ? '2px solid var(--accent-color)' : 'none',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
                }}
              >
                Import Archive
              </button>
            </div>

            {/* Game Import Tab */}
            {importTab === 'game' && (
              <div>
                <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
                  Paste a PGN from a Lichess export to preview it as a branch. This won't be saved until you copy moves to your repertoire.
                </p>

                <textarea
                  className="input"
                  placeholder="Paste PGN here..."
                  value={importPgnText}
                  onChange={(e) => setImportPgnText(e.target.value)}
                  style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: '0.8rem' }}
                />

                <button
                  onClick={handleImport}
                  className="btn"
                  style={{ width: '100%', marginTop: '1rem' }}
                >
                  Preview Branch
                </button>
              </div>
            )}

            {/* Study Import Tab */}
            {importTab === 'study' && (
              <div>
                <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
                  Enter a Lichess study URL to import all chapters as variations in your repertoire.
                </p>

                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label>Study URL</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="https://lichess.org/study/xxxxx"
                    value={studyUrl}
                    onChange={(e) => setStudyUrl(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                {studyImportStatus.msg && (
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                    backgroundColor: studyImportStatus.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 
                                     studyImportStatus.type === 'success' ? 'rgba(34, 197, 94, 0.1)' :
                                     studyImportStatus.type === 'loading' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    color: studyImportStatus.type === 'error' ? '#ef4444' : 
                           studyImportStatus.type === 'success' ? '#22c55e' :
                           studyImportStatus.type === 'loading' ? '#3b82f6' : 'inherit',
                    border: studyImportStatus.type ? `1px solid ${
                      studyImportStatus.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 
                      studyImportStatus.type === 'success' ? 'rgba(34, 197, 94, 0.2)' :
                      'rgba(59, 130, 246, 0.2)'
                    }` : 'none'
                  }}>
                    {studyImportStatus.msg}
                  </div>
                )}

                {importedStudyChapters.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Imported Chapters:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {importedStudyChapters.map((chapter, index) => (
                        <div key={index} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '0.5rem',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)'
                        }}>
                          <span style={{ fontSize: '0.85rem' }}>{chapter.name}</span>
                          <button
                            onClick={() => handleAddStudyChapter(chapter.tree, chapter.name)}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Add to Tree
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleStudyImport}
                    disabled={studyImportStatus.type === 'loading'}
                    className="btn"
                    style={{ flex: 1 }}
                  >
                    {studyImportStatus.type === 'loading' ? 'Importing...' : 'Import Study'}
                  </button>
                </div>
              </div>
            )}

            {/* Archive Import Tab */}
            {importTab === 'archive' && (
              <div>
                <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
                  Import games from your Lichess account. Games will be processed 10 at a time and limited to first {archiveMaxMoves} moves each.
                </p>

                {/* Username Input */}
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label>Lichess Username</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter Lichess username"
                    value={archiveUsername}
                    onChange={(e) => setArchiveUsername(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Color Filter
                    </label>
                    <select
                      className="input"
                      value={archiveColor}
                      onChange={(e) => setArchiveColor(e.target.value as 'white' | 'black' | 'both')}
                      style={{ width: '100%' }}
                    >
                      <option value="both">All Games</option>
                      <option value="white">White Games Only</option>
                      <option value="black">Black Games Only</option>
                    </select>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Max Moves per Game
                    </label>
                    <input
                      type="number"
                      className="input"
                      min="1"
                      max="50"
                      value={archiveMaxMoves}
                      onChange={(e) => setArchiveMaxMoves(parseInt(e.target.value) || 10)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Status Message */}
                {archiveImportStatus.msg && (
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                    backgroundColor: archiveImportStatus.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 
                                     archiveImportStatus.type === 'success' ? 'rgba(34, 197, 94, 0.1)' :
                                     archiveImportStatus.type === 'loading' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    color: archiveImportStatus.type === 'error' ? '#ef4444' : 
                           archiveImportStatus.type === 'success' ? '#22c55e' :
                           archiveImportStatus.type === 'loading' ? '#3b82f6' : 'inherit',
                    border: archiveImportStatus.type ? `1px solid ${
                      archiveImportStatus.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 
                      archiveImportStatus.type === 'success' ? 'rgba(34, 197, 94, 0.2)' :
                      'rgba(59, 130, 246, 0.2)'
                    }` : 'none'
                  }}>
                    {archiveImportStatus.msg}
                  </div>
                )}

                {/* Fetched Games Display */}
                {fetchedGames.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                      Found {fetchedGames.length} Games (showing first 50)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {fetchedGames.map((game: ArchivedGame) => (
                        <div key={game.id} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '0.5rem',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          fontSize: '0.8rem'
                        }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {game.white?.username} vs {game.black?.username}
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>
                              {game.result} • {game.color} • {game.date ? new Date(game.date).toLocaleDateString() : 'Unknown date'}
                            </div>
                          </div>
                          <span style={{ 
                            padding: '0.25rem 0.5rem', 
                            backgroundColor: 'var(--accent-color)', 
                            color: '#fff',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.7rem'
                          }}>
                            {game.color === 'white' ? 'White' : 'Black'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleArchiveImport}
                    disabled={isFetchingArchive || !archiveUsername.trim()}
                    className="btn"
                    style={{ flex: 1 }}
                  >
                    {isFetchingArchive ? 'Fetching...' : 'Fetch Games'}
                  </button>
                  
                  {fetchedGames.length > 0 && (
                    <button
                      onClick={handleProcessSelectedGames}
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      Import {fetchedGames.length} Games
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Common Cancel Button */}
            <button
              onClick={() => { 
                setShowImportModal(false); 
                setImportPgnText('');
                setStudyUrl(''); 
                setStudyImportStatus({ type: '', msg: '' }); 
                setImportedStudyChapters([]); 
                // Reset archive state
                setArchiveUsername('');
                setFetchedGames([]);
                setArchiveImportStatus({ type: '', msg: '' });
              }}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '1rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header - Collapsible on mobile */}
      {!isMobile || !headerCollapsed ? (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '0.5rem',
          padding: isMobile ? '0.5rem 1rem' : undefined,
          backgroundColor: isMobile ? 'var(--panel-bg)' : undefined,
          borderBottom: isMobile ? '1px solid var(--border-color)' : undefined,
          position: isMobile ? 'sticky' : undefined,
          top: isMobile ? 0 : undefined,
          zIndex: isMobile ? 10 : undefined
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-secondary btn-icon"><ArrowLeft size={18} /></button>
            <div style={{ flex: isMobile && showMenu ? 0 : undefined, overflow: 'hidden', transition: 'flex 0.3s ease' }}>
              {!isMobile && <h2 style={{ margin: 0, fontSize: '1.2rem', borderBottom: treeMeta.color === 'white' ? '5px solid #fff' : '5px solid #444444ff', display: 'inline-block', lineHeight: '1.3' }}>{treeMeta.title}</h2>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', position: 'relative' }}>
            {/* Mobile: Always show save button outside menu */}
            {isMobile && !viewOnly && (
              <TooltipButton tooltip={saving ? "Saving..." : "Save Progress"} onClick={() => { handleSave(); }} className={`btn btn-icon ${hasPending ? 'btn-save' : 'btn-secondary'}`} style={{ opacity: saving ? 0.5 : 1 }}><Save size={20} /></TooltipButton>
            )}
            
            {/* Mobile: show expanded buttons when menu open, then hamburger */}
            {isMobile && (
              <>
                {showMenu && (
                  <>
                    <TooltipButton tooltip={isDeleteMode ? "Exit Delete Mode" : "Enter Delete Mode"} onClick={() => { setDeleteMode(!isDeleteMode); setShowMenu(false); }} className={`btn btn-icon btn-secondary ${isDeleteMode ? 'btn-delete-mode-active' : ''}`}><Trash2 size={20} /></TooltipButton>
                    <TooltipButton tooltip="Share Repertoire" onClick={() => { setShowShareModal(true); setShowMenu(false); }} className="btn btn-icon btn-secondary"><Share2 size={20} /></TooltipButton>
                    <TooltipButton tooltip="Import" onClick={() => { setShowStudySelector(true); setShowMenu(false); }} className="btn btn-icon btn-secondary" style={{ position: 'relative' }}><Import size={20} /></TooltipButton>
                    <TooltipButton tooltip="Toggle Fullscreen Tree" onClick={() => { setTreeFullscreen(!treeFullscreen); setShowMenu(false); }} className="btn btn-icon btn-secondary">{treeFullscreen ? <X size={20} /> : <Maximize size={20} />}</TooltipButton>
                  </>
                )}
                <button onClick={() => setShowMenu(!showMenu)} className="btn btn-icon btn-secondary" style={showMenu ? { backgroundColor: 'var(--accent-color)' } : undefined}>
                  <Menu size={20} />
                </button>
              </>
            )}
            
            {/* Desktop: always show all buttons */}
            {!isMobile && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <TooltipButton tooltip={isDeleteMode ? "Exit Delete Mode" : "Enter Delete Mode"} onClick={() => setDeleteMode(!isDeleteMode)} className={`btn btn-icon btn-secondary ${isDeleteMode ? 'btn-delete-mode-active' : ''}`}><Trash2 size={20} /></TooltipButton>
                <TooltipButton tooltip="Share Repertoire" onClick={() => setShowShareModal(true)} className="btn btn-icon btn-secondary"><Share2 size={20} /></TooltipButton>
                <TooltipButton tooltip="Import" onClick={() => { setShowStudySelector(true); }} className="btn btn-icon btn-secondary"><Import size={20} /></TooltipButton>
                <div style={{ width: 1, height: 24, backgroundColor: 'var(--border-color)', margin: '0 4px' }} />
                {!viewOnly ? (
                  <TooltipButton tooltip={saving ? "Saving..." : "Save Progress"} onClick={handleSave} className={`btn btn-icon ${hasPending ? 'btn-save' : 'btn-secondary'}`} style={{ opacity: saving ? 0.5 : 1 }}><Save size={20} /></TooltipButton>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <Users size={16} className="text-muted" /><span className="text-xs text-muted" style={{ fontWeight: 600 }}>READ</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Mobile: Collapsed header - show toggle button */
        <div style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 10, 
          padding: '0.5rem 1rem',
          backgroundColor: 'var(--panel-bg)',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <button 
            onClick={() => setHeaderCollapsed(false)} 
            className="btn btn-secondary btn-icon"
            style={{ fontSize: '12px', fontWeight: 'bold' }}
          >
            ⛶
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {nodeToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 400, width: '100%', border: '1px solid var(--error)' }}>
            <h2 style={{ marginBottom: '1rem', color: '#ef4444' }}>Prune Branch?</h2>
            <p style={{ marginBottom: '1.5rem' }}>
              Are you sure you want to delete the line starting with <strong>{nodeToDelete.move}</strong>?
              <br /><br />
              This will remove <strong>{countNodes(findNode(treeData!, nodeToDelete.fen)!)}</strong> moves from your repertoire.
            </p>

            {treeData && hasDuplicateFen(treeData, nodeToDelete.fen) > 1 && (
              <div style={{ padding: '0.75rem', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#f59e0b' }}>
                <strong>Note:</strong> This position appears in other parts of your tree. Deleting this branch only removes this specific history segment.
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setNodeToDelete(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="btn btn-danger"
                style={{ flex: 1, backgroundColor: '#ef4444' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Body */}
      <div className="editor-layout">
        <div className="chess-pane-new" style={{padding: `${isMobile ? '0.25rem' : '1rem'}`}}>
          <div className="chess-board-container">
            {/* Eval Bar Container */}
            <div
              onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY, active: true })}
              onMouseLeave={() => setMousePos(prev => ({ ...prev, active: false }))}
              className="eval-bar-wrapper"
              data-tooltip="Engine Evaluation"
              style={{width: `${isMobile ? '98%' : '2%'}`, marginBottom: `${isMobile ? '.5rem' : '0rem'}`, marginLeft: `${isMobile ? '.25rem' : '0'}`}}
            >
              <div 
                className="eval-bar-bg"
                style={{
                  display: 'flex',
                  flexDirection: window.innerWidth > 768 
                    ? (treeMeta?.color === 'black' ? 'column' : 'column-reverse')
                    : (treeMeta?.color === 'black' ? 'row' : 'row-reverse'),
                  justifyContent: 'flex-start'
                }}
              >
                <div
                  className="eval-bar-fill"
                  style={{
                    // On desktop it's height, on mobile it's width
                    height: window.innerWidth > 768 ? `${whitePercent}%` : '100%',
                    width: window.innerWidth > 768 ? '100%' : `${whitePercent}%`,
                    transition: 'all 0.4s ease'
                  }}
                />
              </div>
            </div>

            {/* Dynamic Mouse Tooltip (Desktop only) */}
            {mousePos.active && window.innerWidth > 768 && (
              <div style={{
                position: 'fixed',
                top: mousePos.y - 35,
                left: mousePos.x + 15,
                pointerEvents: 'none',
                backgroundColor: 'var(--panel-bg)',
                border: '1px solid var(--border-color-focus)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: 'white',
                zIndex: 9999,
                whiteSpace: 'nowrap',
                boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
                opacity: 0.95
              }}>
                Eval: <strong>{perspScore >= 0 ? '+' : ''}{perspScore.toFixed(2)}</strong>
                <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
                Best: <strong>{bestMove || '…'}</strong>
              </div>
            )}

            {/* Board */}
            <div style={{ flex: 1 }}>
              {(() => {
                const Board = Chessboard as any;
                return <Board
                  options={{
                    position: currentFen,
                    onPieceDrop,
                    boardOrientation,
                    pieces: calientePieces,
                    darkSquareStyle: boardStyles.darkSquareStyle,
                    lightSquareStyle: boardStyles.lightSquareStyle,
                    arrows: arrows,
                    boardStyle: boardStyles.boardStyle,
                  }}
                />;
              })()}
            </div>
          </div>



        </div>

        {/* Tree pane - with mobile size limits and fullscreen support */}
        <div 
          className={`tree-pane-new ${treeFullscreen ? 'tree-pane-fullscreen' : ''}`}
          style={{
            flex: treeFullscreen ? '1' : undefined,
            position: treeFullscreen ? 'fixed' : 'relative',
            top: treeFullscreen ? 0 : undefined,
            left: treeFullscreen ? 0 : undefined,
            width: treeFullscreen ? '100vw' : undefined,
            height: treeFullscreen ? '100vh' : undefined,
            zIndex: treeFullscreen ? 1000 : undefined,
            backgroundColor: treeFullscreen ? 'var(--panel-bg)' : undefined,
            // Mobile size limits
            maxHeight: isMobile && !treeFullscreen ? '300px' : undefined,
            minHeight: isMobile && !treeFullscreen ? '200px' : undefined
          }}
        >
          {treeData && (
            <div style={{ 
              width: '100%', 
              height: '100%',
              position: 'relative',
              // Add exit button for fullscreen mode
              display: treeFullscreen ? 'flex' : undefined,
              flexDirection: treeFullscreen ? 'column' : undefined
            }}>
              {treeFullscreen && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 1001
                }}>
                  <button
                    onClick={() => setTreeFullscreen(false)}
                    className="btn btn-secondary btn-icon"
                    style={{
                      backgroundColor: 'var(--panel-bg)',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              <ForceTree
                data={treeData}
                currentFen={currentFen}
                onNodeClick={handleNodeClick}
                onNodeUpdate={handleNodeUpdate}
                isDeleteMode={isDeleteMode}
                tempTreeData={tempTreeData}
                isFullscreen={treeFullscreen}
              />
            </div>
          )}
        </div>
      </div>

      {/* Study Selector Modal */}
      {showStudySelector && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0.5rem' : '1rem'
        }}>
          <div className="card animate-fade-in" style={{ 
            maxWidth: 700, 
            width: '100%', 
            position: 'relative', 
            maxHeight: isMobile ? '90vh' : '80vh', 
            overflowY: 'auto',
            margin: isMobile ? '0' : undefined
          }}>
            <button onClick={() => setShowStudySelector(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Import size={20} />
              Import
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Import options */}
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Import From</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      setShowStudySelector(false);
                      setShowImportModal(true);
                      setImportTab('study');
                    }}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Lichess
                  </button>
                  <button
                    onClick={() => {
                      setShowStudySelector(false);
                      setShowChesscomModal(true);
                      // Reset state when opening fresh modal but keep current month
                      setChesscomUsername('');
                      // Don't reset selectedMonth - keep current month default
                      setChesscomGames([]);
                      setSelectedChesscomGames(new Set());
                      setHasFetchedGames(false);
                      setChesscomImportStatus({ type: '', msg: '' });
                    }}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Chess.com
                  </button>
                </div>
              </div>

              {/* Imported content - Combined studies and Chess.com games */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Imported ({cachedStudies.length + cachedChesscomEntries.length}) 
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      ({cachedStudies.length} studies, {cachedChesscomEntries.length} chess.com)
                    </span>
                  </h3>
                  <button
                    onClick={() => {
                      if (confirm('Clear all imported content?')) {
                        studyCache.clearCache();
                        chesscomCache.clearCache();
                        setCachedStudies([]);
                        setCachedChesscomEntries([]);
                      }
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem' }}
                  >
                    Clear All
                  </button>
                </div>

                {(cachedStudies.length === 0 && cachedChesscomEntries.length === 0) ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                    No imported content yet. Import studies or Chess.com games to get started.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {/* Render studies first */}
                    {cachedStudies.map((study) => (
                      <div
                        key={study.id}
                        onClick={() => handleSelectStudy(study)}
                        style={{
                          padding: '1rem',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          backgroundColor: 'var(--panel-bg)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-color)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--panel-bg)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{study.name}</h4>
                            <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {study.chapters.length} chapters 
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>• Lichess</span>
                            </p>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Imported {new Date(study.cachedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remove "${study.name}" from imported studies?`)) {
                                studyCache.removeStudy(study.id);
                                loadCachedStudies();
                                loadCachedChesscomEntries();
                              }
                            }}
                            className="btn btn-secondary btn-icon"
                            style={{ padding: '0.25rem' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {/* Render Chess.com entries */}
                    {cachedChesscomEntries.map((entry) => (
                      <div
                        key={`${entry.username}_${entry.month}`}
                        onClick={() => handleSelectChesscomEntry(entry)}
                        style={{
                          padding: '1rem',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          backgroundColor: 'var(--panel-bg)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-color)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--panel-bg)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
                              {entry.username} - {new Date(entry.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </h4>
                            <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {entry.games.length} games 
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>• Chess.com</span>
                            </p>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Cached {new Date(entry.cachedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveChesscomEntry(entry);
                            }}
                            className="btn btn-secondary btn-icon"
                            style={{ padding: '0.25rem' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => setShowStudySelector(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chapters Modal */}
      {showChaptersModal && selectedStudy && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 600, width: '100%', position: 'relative', maxHeight: '80vh', overflowY: 'auto' }}>
            <button onClick={() => setShowChaptersModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Import size={20} />
              {selectedStudy.name}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Status Message */}
              {studyImportStatus.msg && (
                <div style={{
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: studyImportStatus.type === 'error' ? 'var(--error-bg)' : 
                                   studyImportStatus.type === 'success' ? 'var(--success-bg)' : 
                                   'var(--info-bg)',
                  color: studyImportStatus.type === 'error' ? 'var(--error-text)' : 
                         studyImportStatus.type === 'success' ? 'var(--success-text)' : 
                         'var(--info-text)',
                  fontSize: '0.9rem',
                }}>
                  {studyImportStatus.msg}
                </div>
              )}

              {/* Chapters List */}
              {importedStudyChapters.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: 0 }}>
                        Chapters
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ({selectedChapters.size} selected)
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (selectedChapters.size === 0) {
                          // Select all chapters
                          setSelectedChapters(new Set(importedStudyChapters.map(chapter => chapter.name)));
                        } else {
                          // Clear selection
                          setSelectedChapters(new Set());
                        }
                      }}
                      className="btn btn-secondary"
                      style={{ 
                        fontSize: '0.8rem',
                        padding: '0.5rem',
                        minWidth: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title={selectedChapters.size === 0 ? 'Select all chapters' : 'Clear selection'}
                    >
                      {selectedChapters.size === 0 ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <polyline points="9 11 12 14 20 6"></polyline>
                        </svg>
                      )}
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {importedStudyChapters.map((chapter, index) => (
                      <div
                        key={index}
                        onClick={() => handleToggleChapter(chapter.name)}
                        style={{
                          padding: '1rem',
                          border: `1px solid ${selectedChapters.has(chapter.name) ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          backgroundColor: selectedChapters.has(chapter.name) ? 'var(--accent-color)' : 'var(--panel-bg)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedChapters.has(chapter.name)) {
                            e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selectedChapters.has(chapter.name)) {
                            e.currentTarget.style.backgroundColor = 'var(--panel-bg)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{chapter.name}</h4>
                            <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Click to select this chapter for import
                            </p>
                          </div>
                          <div style={{
                            width: '20px',
                            height: '20px',
                            border: `2px solid ${selectedChapters.has(chapter.name) ? 'white' : 'var(--accent-color)'}`,
                            borderRadius: '4px',
                            backgroundColor: selectedChapters.has(chapter.name) ? 'var(--accent-color)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {selectedChapters.has(chapter.name) && (
                              <span style={{ color: 'white', fontSize: '12px' }}>✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Import button below Chapters section */}
                  <div style={{ marginTop: '1rem' }}>
                    {importedStudyChapters.length > 0 && (
                      <button
                        onClick={handleImportSelectedChapters}
                        disabled={selectedChapters.size === 0}
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                      >
                        {studyImportStatus.type === 'loading' ? 'Importing...' : `Import ${selectedChapters.size} Selected Chapter${selectedChapters.size !== 1 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {importedStudyChapters.length === 0 && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                  No chapters found in this study.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chess.com Import Modal */}
      {showChesscomModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0.5rem' : '1rem'
        }}>
          <div className="card animate-fade-in" style={{ 
            maxWidth: 700, 
            width: '100%', 
            position: 'relative', 
            maxHeight: isMobile ? '90vh' : '80vh', 
            overflowY: 'auto',
            margin: isMobile ? '0' : undefined
          }}>
            <button onClick={() => setShowChesscomModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Import size={20} />
              Import from Chess.com
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Username and Month Row */}
              <div className="input-group">
                <label>Chess.com Username</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter Chess.com username"
                    value={chesscomUsername}
                    onChange={(e) => setChesscomUsername(e.target.value)}
                    style={{ flex: 1 }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleFetchChesscomGames();
                      }
                    }}
                  />
                  
                  {/* Month Selector on the right */}
                    <MonthPicker
                      value={selectedMonth}
                      onChange={setSelectedMonth}
                      placeholder="Choose a month..."
                      disabled={isFetchingChesscomGames}
                    />
                </div>
                
                {/* Selected month/year display - always show when month is selected */}
                {selectedMonth && (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-muted)', 
                    marginTop: '0.25rem',
                    fontStyle: 'italic'
                  }}>
                    Importing from: {(() => {
                      const [year, month] = selectedMonth.split('-');
                      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    })()}
                  </div>
                )}
                
                {/* Fetch/Import Button below everything */}
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    onClick={handleFetchChesscomGames}
                    disabled={isFetchingChesscomGames || !chesscomUsername.trim() || !selectedMonth}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                  >
                    {isFetchingChesscomGames ? '...' : 'Fetch'}
                  </button>
                </div>
              </div>

              {/* Status Message */}
              {chesscomImportStatus.msg && (
                <div style={{
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: chesscomImportStatus.type === 'error' ? 'var(--error-bg)' : 
                                   chesscomImportStatus.type === 'success' ? 'var(--success-bg)' : 
                                   'var(--info-bg)',
                  color: chesscomImportStatus.type === 'error' ? 'var(--error-text)' : 
                         chesscomImportStatus.type === 'success' ? 'var(--success-text)' : 
                         'var(--info-text)',
                  fontSize: '0.9rem',
                }}>
                  {chesscomImportStatus.msg}
                </div>
              )}

              {/* Games List */}
              {chesscomGames.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: 0 }}>
                        Games
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ({selectedChesscomGames.size} selected)
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const treeColor = treeMeta?.color || 'white';
                        if (selectedChesscomGames.size === 0) {
                          // Auto-select games where user played as the tree color
                          const matchingGames = chesscomGames.filter(game => game.color === treeColor);
                          setSelectedChesscomGames(new Set(matchingGames.map(g => g.id)));
                        } else {
                          setSelectedChesscomGames(new Set());
                        }
                      }}
                      className="btn btn-secondary"
                      style={{ 
                        fontSize: '0.8rem',
                        padding: '0.5rem',
                        minWidth: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title={selectedChesscomGames.size === 0 ? `Select games played as ${treeMeta?.color || 'white'}` : 'Clear selection'}
                    >
                      {selectedChesscomGames.size === 0 ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <polyline points="9 11 12 14 20 6"></polyline>
                        </svg>
                      )}
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                    {chesscomGames.map((game) => (
                      <div
                        key={game.id}
                        onClick={() => handleToggleChesscomGame(game.id)}
                        style={{
                          padding: '1rem',
                          border: `1px solid ${selectedChesscomGames.has(game.id) ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          backgroundColor: selectedChesscomGames.has(game.id) ? 'var(--accent-color)' : 'var(--panel-bg)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedChesscomGames.has(game.id)) {
                            e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selectedChesscomGames.has(game.id)) {
                            e.currentTarget.style.backgroundColor = 'var(--panel-bg)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 'bold' }}>
                                {game.white.username} ({game.white.rating}) vs {game.black.username} ({game.black.rating})
                              </span>
                              <span style={{ 
                                fontSize: '0.8rem', 
                                color: 'var(--text-muted)',
                                padding: '0.125rem 0.5rem',
                                backgroundColor: 'var(--border-color)',
                                borderRadius: 'var(--radius-sm)'
                              }}>
                                {game.result}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {game.color === 'white' ? 'Played as White' : 'Played as Black'}
                              {game.date && ` • ${new Date(game.date).toLocaleDateString()}`}
                            </div>
                          </div>
                          <div style={{
                            width: '20px',
                            height: '20px',
                            border: `2px solid ${selectedChesscomGames.has(game.id) ? 'white' : 'var(--accent-color)'}`,
                            borderRadius: '4px',
                            backgroundColor: selectedChesscomGames.has(game.id) ? 'var(--accent-color)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {selectedChesscomGames.has(game.id) && (
                              <span style={{ color: 'white', fontSize: '12px' }}>✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Import button below Games section */}
                  <div style={{ marginTop: '1rem' }}>
                    {chesscomGames.length > 0 && (
                      <button
                        onClick={handleImportSelectedChesscomGames}
                        disabled={selectedChesscomGames.size === 0 || isFetchingChesscomGames}
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                      >
                        {isFetchingChesscomGames ? 'Importing...' : `Import ${selectedChesscomGames.size} Selected Game${selectedChesscomGames.size !== 1 ? 's' : ''}`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Temporary Changes Notification */}
      {hasUnsavedChanges && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: 'var(--accent-color)',
          color: 'white',
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 1000,
          maxWidth: '300px'
        }}>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
            You have temporary changes. Save or discard them?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleSaveTemporaryChanges}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', flex: 1 }}
            >
              Save
            </button>
            <button
              onClick={handleDiscardTemporaryChanges}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', flex: 1 }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

