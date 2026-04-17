import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { ArrowLeft, CheckCircle, XCircle, RefreshCcw, LayoutDashboard, Settings } from 'lucide-react';

interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
}

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [treeMeta, setTreeMeta] = useState<any>(null);
  
  // Use a ref for the game to avoid state-lag during rapid drops
  const gameRef = useRef(new Chess());
  const [currentFen, setCurrentFen] = useState(() => gameRef.current.fen());
  
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing');
  const [expectedMove, setExpectedMove] = useState<string | null>(null);

  const loadTreeAndGenerateCards = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('trees').select('*').eq('id', id).single();
    if (error || !data) {
      console.error('Review load error:', error);
      setLoading(false);
      return;
    }

    setTreeMeta(data);
    const tData = data.tree_data;
    const cards: any[] = [];
    const isPlayerWhite = data.color === 'white';

    // Traverse tree to find all positions where it is the PLAYER'S turn
    function traverse(node: TreeNode) {
      const chess = new Chess(node.fen);
      const isWhiteTurn = chess.turn() === 'w';
      const isSideToMatch = isPlayerWhite ? isWhiteTurn : !isWhiteTurn;

      // If it's our turn and there is at least one response in the tree, add a card
      if (isSideToMatch && node.children && node.children.length > 0) {
        cards.push({
          fen: node.fen,
          // We accept any child move as "correct" if it exists in the tree
          possibleMoves: node.children.map(c => c.move),
          mainMove: node.children[0].move
        });
      }
      
      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    }

    if (tData) traverse(tData);
    
    // Shuffle cards
    const shuffled = cards.sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    
    if (shuffled.length > 0) {
      const startPos = shuffled[0];
      gameRef.current = new Chess(startPos.fen);
      setCurrentFen(startPos.fen);
      setExpectedMove(startPos.mainMove);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadTreeAndGenerateCards();
  }, [loadTreeAndGenerateCards]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (status !== 'playing') return false;

    try {
      const moveObj = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (!moveObj) return false;

      const newFen = gameRef.current.fen();
      setCurrentFen(newFen);

      const currentCard = flashcards[currentIndex];
      // Check if the move performed is one of the "known" moves in the tree for this position
      const isCorrect = currentCard.possibleMoves.includes(moveObj.san);

      if (isCorrect) {
        setStatus('correct');
        setExpectedMove(moveObj.san); // show what they actually played
      } else {
        setStatus('wrong');
        setExpectedMove(currentCard.mainMove); // show what they SHOULD have played
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  const nextCard = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < flashcards.length) {
      setCurrentIndex(nextIdx);
      const nextPos = flashcards[nextIdx];
      gameRef.current = new Chess(nextPos.fen);
      setCurrentFen(nextPos.fen);
      setExpectedMove(nextPos.mainMove);
      setStatus('playing');
    } else {
      // Completed - go back or restart?
      setFlashcards([]);
    }
  };

  const retryCard = () => {
    const currentCard = flashcards[currentIndex];
    gameRef.current = new Chess(currentCard.fen);
    setCurrentFen(currentCard.fen);
    setStatus('playing');
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', color:'var(--text-muted)' }}>
      Loading review...
    </div>
  );

  if (!treeMeta) return <div className="card m-8">Tree not found.</div>;

  if (flashcards.length === 0) return (
    <div className="card text-center m-8 p-12" style={{ maxWidth: 500, margin: '4rem auto' }}>
      <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
      <h2>Review Complete!</h2>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
        You've reviewed all available moves for this tree.
      </p>
      <div style={{ display:'flex', gap:'1rem', marginTop: '2rem', justifyContent:'center' }}>
        <button onClick={() => navigate('/')} className="btn btn-secondary">
          <LayoutDashboard size={16} /> Dashboard
        </button>
        <button onClick={() => loadTreeAndGenerateCards()} className="btn">
          <RefreshCcw size={16} /> Start Over
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => navigate(`/editor/${id}`)} className="btn btn-secondary btn-icon" title="Back to Editor">
          <ArrowLeft size={18} />
        </button>
        <div style={{ textAlign:'center' }}>
          <h2 style={{ margin:0, fontSize:'1.4rem' }}>{treeMeta.title}</h2>
          <span className="text-sm text-muted">Position {currentIndex + 1} / {flashcards.length}</span>
        </div>
        <button onClick={() => navigate('/settings')} className="btn btn-secondary btn-icon" title="Settings">
          <Settings size={18} />
        </button>
      </div>

      {/* Main Review Card */}
      <div className="card" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2rem', padding: '2.5rem' }}>
        
        <div style={{ width:'100%', maxWidth: 450 }}>
          {(() => {
            const Board = Chessboard as any;
            return <Board
              position={currentFen}
              onPieceDrop={onDrop}
              boardOrientation={treeMeta.color === 'white' ? 'white' : 'black'}
              customDarkSquareStyle={{ backgroundColor: '#c47e8a' }}
              customLightSquareStyle={{ backgroundColor: '#f5ece9' }}
              boardStyle={{ borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
            />;
          })()}
        </div>

        {/* Feedback Section */}
        <div style={{ height: 120, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          {status === 'playing' && (
            <p style={{ fontSize:'1.25rem', fontWeight:500 }} className="animate-fade-in">
              What is the move for <span style={{ color:'var(--accent-color)' }}>{treeMeta.color}</span>?
            </p>
          )}

          {status === 'correct' && (
            <div className="animate-fade-in" style={{ textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--success)', marginBottom:'1rem', justifyContent:'center' }}>
                <CheckCircle size={28} />
                <span style={{ fontSize:'1.5rem', fontWeight:700 }}>Excellent!</span>
              </div>
              <button onClick={nextCard} className="btn" style={{ minWidth: 160 }}>Next Position</button>
            </div>
          )}

          {status === 'wrong' && (
            <div className="animate-fade-in" style={{ textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--error)', marginBottom:'0.5rem', justifyContent:'center' }}>
                <XCircle size={28} />
                <span style={{ fontSize:'1.5rem', fontWeight:700 }}>Not quite.</span>
              </div>
              <p className="text-muted text-sm" style={{ marginBottom:'1rem' }}>
                Recommended move was <strong style={{ color:'var(--text-main)' }}>{expectedMove}</strong>
              </p>
              <button onClick={retryCard} className="btn btn-secondary">Try Again</button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
