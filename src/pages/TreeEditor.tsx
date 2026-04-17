import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import ForceTree, { type TreeNode } from '../components/ForceTree';
import { ArrowLeft, Save, RotateCcw, Undo2, Info, HelpCircle, X, ChevronRight, Play } from 'lucide-react';
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function TreeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [treeMeta, setTreeMeta] = useState<any>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Chess Ref
  const gameRef = useRef(new Chess());
  const [currentFen, setCurrentFen] = useState(() => gameRef.current.fen());

  // Engine
  const engineRef = useRef<Worker | null>(null);
  const [evalNum, setEvalNum] = useState(0);
  const [bestMove, setBestMove] = useState('');

  // Arrows
  // const boardWrapperRef = useRef<HTMLDivElement>(null);

  // Load Tree
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from('trees').select('*').eq('id', id).single();
      if (error) console.error('Load tree error:', error);
      if (data) {
        setTreeMeta(data);
        const root: TreeNode = data.tree_data ?? { fen: new Chess().fen(), children: [] };
        setTreeData(root);
        gameRef.current = new Chess(root.fen);
        setCurrentFen(root.fen);
      }
      setLoading(false);
    })();
  }, [id]);

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

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.postMessage('stop');
    eng.postMessage(`position fen ${currentFen}`);
    eng.postMessage('go depth 12');
    setBestMove('');
  }, [currentFen]);

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
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
    gameRef.current = new Chess(nodeInfo.fen);
    setCurrentFen(nodeInfo.fen);
  }, []);

  const handleUndo = useCallback(() => {
    if (gameRef.current.undo()) setCurrentFen(gameRef.current.fen());
  }, []);

  const handleReset = useCallback(() => {
    gameRef.current = new Chess();
    setCurrentFen(gameRef.current.fen());
  }, []);

  const handleSave = useCallback(async () => {
    if (!id || !treeData) return;
    setSaving(true);
    const cleaned = stripPending(treeData);
    const { error } = await supabase.from('trees').update({ tree_data: cleaned, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      setTreeData(cleaned);
      setHasPending(false);
    }
    setSaving(false);
  }, [id, treeData]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height) - 2.5rem)', gap: '1rem' }}>

      {/* Tutorial Overlay */}
      {showTutorial && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 500, width: '100%', position: 'relative' }}>
            <button onClick={() => setShowTutorial(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <HelpCircle size={24} color="var(--accent-color)" />
              How to use MyChessTree
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <TutorialStep icon={<Play size={18} />} title="Build Your Tree" text="Make moves on the board to add them to your tree. New moves appear in yellow until saved." />
              <TutorialStep icon={<Save size={18} />} title="Save Your Progress" text="Click 'Save' to commit your new moves to Supabase. This makes them permanent." />
              <TutorialStep icon={<ChevronRight size={18} />} title="Analyze with Engine" text="Stockfish runs in your browser. The eval bar and red arrows show the best engine moves." />
              <TutorialStep icon={<Info size={18} />} title="Navigation" text="Click nodes in the tree to jump to that position. Right-click the board to draw your own arrows." />
              <TutorialStep icon={<Play size={18} />} title="Focus Mode" text="Use 'Focus Branch' in the tree view to hide other lines and stay focused on your current variations." />
            </div>
            <button onClick={() => setShowTutorial(false)} className="btn" style={{ width: '100%', marginTop: '2rem' }}>Got it!</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/')} className="btn btn-secondary btn-icon"><ArrowLeft size={18} /></button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{treeMeta.title}</h2>
            <span className="text-sm text-muted">Playing as {treeMeta.color}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => setShowTutorial(true)} className="btn btn-secondary btn-icon" title="Tutorial"><HelpCircle size={20} /></button>
          <Link to={`/review/${id}`} className="btn btn-secondary" style={{ backgroundColor: 'var(--success)', color: 'white' }}>
            <Play size={16} /> Review
          </Link>
          <button onClick={handleSave} className="btn" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="editor-layout">
        <div className="chess-pane-new">
          {/* Eval */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--panel-bg)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
            <span>Eval: <strong style={{ color: perspScore >= 0 ? '#10b981' : '#e11d48' }}>{perspScore >= 0 ? '+' : ''}{perspScore.toFixed(2)}</strong></span>
            <span className="text-muted">Best: <strong>{bestMove || '…'}</strong></span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
            {/* Eval Bar */}
            <div style={{ width: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: '#111', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', height: `${whitePercent}%`, backgroundColor: '#f5f5f5', transition: 'height 0.4s ease' }} />
            </div>

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
                    arrows,
                    boardStyle: boardStyles.boardStyle,
                  }}
                />;
              })()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={handleUndo} style={{ flex: 1 }}><Undo2 size={16} /> Undo</button>
            <button className="btn btn-secondary" onClick={handleReset} style={{ flex: 1 }}><RotateCcw size={16} /> Reset</button>
          </div>

          {hasPending && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={16} /> You have unsaved moves in your tree. Click Save to keep them.
            </div>
          )}
        </div>

        <div className="tree-pane-new">
          {treeData && <ForceTree data={treeData} currentFen={currentFen} onNodeClick={handleNodeClick} />}
        </div>
      </div>
    </div>
  );
}

function TutorialStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ color: 'var(--accent-color)', marginTop: 2 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 2 }}>{title}</div>
        <div className="text-muted text-sm" style={{ lineHeight: 1.4 }}>{text}</div>
      </div>
    </div>
  );
}
