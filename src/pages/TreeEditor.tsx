import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import ForceTree, { type TreeNode } from '../components/ForceTree';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Save, X, Share2, Trash2, Users, Import, Menu } from 'lucide-react';
import TooltipButton from '../components/TooltipButton';
import { calientePieces, boardStyles } from '../lib/chessAssets';

// ── Utility helpers ───────────────────────────────────────────────────────────
function uciToArrow(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: 'rgba(225,29,72,0.85)' };
}

function stripPending(node: TreeNode): TreeNode {
  const { isPending: _removed, ...rest } = node;
  return { ...rest, children: node.children.map(stripPending) };
}

function findNode(node: TreeNode, fen: string): TreeNode | null {
  if (node.fen === fen) return node;
  for (const child of node.children) {
    const hit = findNode(child, fen);
    if (hit) return hit;
  }
  return null;
}

function countNodes(node: TreeNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

function hasDuplicateFen(root: TreeNode, targetFen: string, count = 0): number {
  if (root.fen === targetFen) count++;
  for (const child of root.children) {
    count = hasDuplicateFen(child, targetFen, count);
  }
  return count;
}

function deleteNodeFromTree(parent: TreeNode, targetFen: string): boolean {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].fen === targetFen) {
      parent.children.splice(i, 1);
      return true;
    }
    if (deleteNodeFromTree(parent.children[i], targetFen)) return true;
  }
  return false;
}

function parsePgnMoves(pgn: string): { moves: string[]; finalFen: string } {
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function TreeEditor() {
  const { user, isGuest, getGuestTree, saveGuestTree } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [treeMeta, setTreeMeta] = useState<any>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [importPgnText, setImportPgnText] = useState('');
  const [importedBranch, setImportedBranch] = useState<TreeNode | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Chess Ref
  const gameRef = useRef(new Chess());
  const [currentFen, setCurrentFen] = useState(() => gameRef.current.fen());

  // Keyboard navigation - left/right arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!treeData) return;
      
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
          // Check if we're at the diverge point (importedBranch.fen)
          if (currentFen === importedBranch.fen && importedBranch.children.length > 0) {
            const branchNode = importedBranch.children[0];
            gameRef.current = new Chess(branchNode.fen);
            setCurrentFen(branchNode.fen);
          }
        }
      } else if (e.key === 'ArrowLeft') {
        // Go to parent - check if we're in an imported branch
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
            gameRef.current = new Chess(importedBranch.fen);
            setCurrentFen(importedBranch.fen);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [treeData, currentFen, importedBranch]);

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
      .select('*, users!tree_shares_user_id_fkey(username)')
      .eq('tree_id', id);
    setExistingShares(data || []);
    setLoadingShares(false);
  };

  useEffect(() => {
    if (showShareModal) loadShares();
  }, [showShareModal, treeMeta?.user_id]);

  // Load Tree
  useEffect(() => {
    if (!id) return;
    
    if (isGuest) {
      // Guest user - load from localStorage
      const tree = getGuestTree(id);
      if (tree) {
        setTreeMeta(tree);
        const root: TreeNode = tree.tree_data ?? { fen: new Chess().fen(), children: [] };
        setTreeData(root);
        gameRef.current = new Chess(root.fen);
        setCurrentFen(root.fen);
        setViewOnly(false); // Guests can edit their own trees
      }
      setLoading(false);
    } else if (user) {
      // Signed-in user - load from Supabase
      (async () => {
        const { data, error } = await supabase.from('trees').select('*').eq('id', id).single();
        if (error) console.error('Load tree error:', error);
        if (data) {
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
              .single();

            if (!share || share.access_level === 'read') {
              setViewOnly(true);
            }
          }
        }
        setLoading(false);
      })();
    }
  }, [id, user, isGuest, getGuestTree]);

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

      setTreeData(prev => {
        if (!prev) return prev;
        const cloned: TreeNode = JSON.parse(JSON.stringify(prev));
        const parent = findNode(cloned, prevFen);
        if (!parent) return cloned;

        const exists = parent.children.some(c => c.fen === newFen);
        if (!exists) {
          parent.children.push({ fen: newFen, move: moveObj.san, children: [], isPending: true });
          setHasPending(true);
        }
        return cloned;
      });
      return true;
    },
    []
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

    setTreeData(prev => {
      if (!prev) return prev;
      const cloned = JSON.parse(JSON.stringify(prev));
      const deleted = deleteNodeFromTree(cloned, nodeToDelete.fen);
      if (deleted) {
        setHasPending(true);
      }
      return cloned;
    });

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
      alert('No valid moves found in PGN');
      return;
    }

    console.log('Parsed moves:', moves);

    const game = new Chess();
    let currentTreeNode = treeData;
    let divergeIndex = 0;

    // Walk through moves, checking against our tree
    for (let i = 0; i < moves.length; i++) {
      const moveResult = game.move(moves[i]);
      if (!moveResult) break;
      
      const gameFen = game.fen();
      console.log(`Move ${i + 1}: ${moves[i]} -> ${gameFen}`);
      
      // Find if this position exists in our tree at current node
      const matchingChild = currentTreeNode.children.find(c => c.fen === gameFen);
      console.log('Current tree node fen:', currentTreeNode.fen);
      console.log('Children fens:', currentTreeNode.children.map(c => c.fen));
      
      if (matchingChild) {
        console.log('Found matching child, continuing...');
        currentTreeNode = matchingChild;
        divergeIndex = i + 1;
      } else {
        console.log('No matching child - diverging here');
        break;
      }
    }

    console.log('Shared prefix length:', divergeIndex, 'of', moves.length);

    // If all moves exist
    if (divergeIndex === moves.length) {
      alert('All moves already exist in your tree!');
      return;
    }

    // Build the branch from the divergence point
    const divergeGame = new Chess();
    for (let i = 0; i < divergeIndex; i++) {
      divergeGame.move(moves[i]);
    }

    const branchRoot: TreeNode = { fen: divergeGame.fen(), move: 'Start', children: [] };
    let current = branchRoot;

    for (let i = divergeIndex; i < moves.length; i++) {
      try {
        const result = divergeGame.move(moves[i]);
        if (result) {
          const newNode: TreeNode = {
            fen: divergeGame.fen(),
            move: result.san,
            children: []
          };
          current.children.push(newNode);
          current = newNode;
          console.log('Added node:', result.san, 'at', divergeGame.fen());
        }
      } catch (e) {
        console.log('Failed to add move:', moves[i]);
      }
    }

    if (branchRoot.children.length === 0) {
      alert('No new moves to add!');
      return;
    }

    setImportedBranch(branchRoot);
    setShowImportModal(false);
    setImportPgnText('');
  }, [importPgnText]);

  // Derived
  const isWhiteTurn = gameRef.current.turn() === 'w';
  const perspScore = isWhiteTurn ? evalNum : -evalNum;
  const whitePercent = 50 + 50 * (2 / Math.PI) * Math.atan(perspScore / 4);
  const arrows = uciToArrow(bestMove) ? [uciToArrow(bestMove)!] : [];
  const boardOrientation: 'white' | 'black' = treeMeta?.color === 'black' ? 'black' : 'white';

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      Loading tree…
    </div>
  );
  if (!treeMeta) return <div style={{ padding: 20 }}>Tree not found.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height) - 4rem)', gap: '1rem' }}>


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

            <div className="input-group">
              <label>Recipient Username</label>
              <input
                type="text"
                className="input"
                placeholder="Enter exact username"
                value={shareUsername}
                onChange={(e) => setShareUsername(e.target.value.toLowerCase())}
              />
            </div>

            <div className="input-group">
              <label>Access Level</label>
              <select
                className="input"
                value={shareAccess}
                onChange={(e) => setShareAccess(e.target.value as 'read' | 'edit')}
              >
                <option value="read">Can View (Read Only)</option>
                <option value="edit">Can Edit & Save</option>
              </select>
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

                  if (userError || !resUser) throw new Error('User not found.');

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
              style={{ width: '100%' }}
            >
              Grant Access
            </button>

            {/* Existing Shares List */}
            {user?.id === treeMeta.user_id && (
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Current Collaborators</h4>
                {loadingShares ? <div className="text-muted">Loading...</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {existingShares.length === 0 ? <div className="text-muted text-sm">No shares yet.</div> : existingShares.map(s => (
                      <div key={s.user_id} className="flex items-center justify-between" style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{s.users?.username || 'Unknown'}</div>
                          <div className="text-muted text-xs uppercase">{s.access_level}</div>
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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/')} className="btn btn-secondary btn-icon"><ArrowLeft size={18} /></button>
          <div style={{ flex: isMobile && showMenu ? 0 : undefined, overflow: 'hidden', transition: 'flex 0.3s ease' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', borderBottom: treeMeta.color === 'white' ? '5px solid #fff' : '5px solid #444444ff', display: 'inline-block', lineHeight: '1.3' }}>{treeMeta.title}</h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', position: 'relative' }}>
          {/* Mobile: show expanded buttons when menu open, then hamburger */}
          {isMobile && (
            <>
              {showMenu && (
                <>
                  <TooltipButton tooltip={isDeleteMode ? "Exit Delete Mode" : "Enter Delete Mode"} onClick={() => { setDeleteMode(!isDeleteMode); setShowMenu(false); }} className={`btn btn-icon btn-secondary ${isDeleteMode ? 'btn-delete-mode-active' : ''}`}><Trash2 size={20} /></TooltipButton>
                  <TooltipButton tooltip="Share Repertoire" onClick={() => { setShowShareModal(true); setShowMenu(false); }} className="btn btn-icon btn-secondary"><Share2 size={20} /></TooltipButton>
                  <TooltipButton tooltip="Import Lichess PGN" onClick={() => { setShowImportModal(true); setShowMenu(false); }} className="btn btn-icon btn-secondary"><Import size={20} /></TooltipButton>
                  {!viewOnly && <TooltipButton tooltip={saving ? "Saving..." : "Save Progress"} onClick={() => { handleSave(); setShowMenu(false); }} className={`btn btn-icon ${hasPending ? 'btn-save' : 'btn-secondary'}`} style={{ opacity: saving ? 0.5 : 1 }}><Save size={20} /></TooltipButton>}
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
              <TooltipButton tooltip="Import Lichess PGN" onClick={() => setShowImportModal(true)} className="btn btn-icon btn-secondary"><Import size={20} /></TooltipButton>
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
        <div className="chess-pane-new">


          <div className="chess-board-container">
            {/* Eval Bar Container */}
            <div
              onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY, active: true })}
              onMouseLeave={() => setMousePos(prev => ({ ...prev, active: false }))}
              className="eval-bar-wrapper"
              data-tooltip="Engine Evaluation"
            >
              <div className="eval-bar-bg">
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

        <div className="tree-pane-new">
          {treeData && (
            <ForceTree
              data={treeData}
              currentFen={currentFen}
              onNodeClick={handleNodeClick}
              isDeleteMode={isDeleteMode}
              importedBranch={importedBranch}
            />
          )}
        </div>
      </div>
    </div>
  );
}

