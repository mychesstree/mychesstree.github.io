import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { ArrowLeft, CheckCircle, XCircle, Settings as SettingsIcon, Brain } from 'lucide-react';
import { calientePieces, boardStyles } from '../lib/chessAssets';

interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
}

interface ReviewCard {
  fen: string;
  possibleMoves: string[];
  mainMove: string;
  treeId: string;
}

// ── SM-2 Spaced Repetition Logic ──────────────────────────────────────────────
function calculateSM2(rating: number, oldInterval: number, oldRepetitions: number, oldEase: number) {
  let interval = 1;
  let repetitions = 0;
  let ease = oldEase;

  if (rating >= 3) {
    if (oldRepetitions === 0) {
      interval = 1;
    } else if (oldRepetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(oldInterval * oldEase);
    }
    repetitions = oldRepetitions + 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  ease = oldEase + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return { interval, repetitions, ease };
}

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [treeMeta, setTreeMeta] = useState<any>(null);
  
  const gameRef = useRef(new Chess());
  const [currentFen, setCurrentFen] = useState(() => gameRef.current.fen());
  
  const [flashcards, setFlashcards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing');
  const [revealed, setRevealed] = useState(false);
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
    const cards: ReviewCard[] = [];
    const isPlayerWhite = data.color === 'white';

    function traverse(node: TreeNode) {
      const chess = new Chess(node.fen);
      const isWhiteTurn = chess.turn() === 'w';
      const isSideToMatch = isPlayerWhite ? isWhiteTurn : !isWhiteTurn;

      if (isSideToMatch && node.children && node.children.length > 0) {
        cards.push({
          fen: node.fen,
          possibleMoves: node.children.map(c => c.move ?? '').filter((m): m is string => !!m),
          mainMove: node.children[0].move ?? '',
          treeId: id ?? ''
        });
      }
      
      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    }

    if (tData) traverse(tData);
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

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
    if (status !== 'playing') return false;
    try {
      const moveObj = gameRef.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!moveObj) return false;

      setCurrentFen(gameRef.current.fen());
      const currentCard = flashcards[currentIndex];
      const isCorrect = currentCard.possibleMoves.includes(moveObj.san);

      if (isCorrect) {
        setStatus('correct');
        setRevealed(true);
        setExpectedMove(moveObj.san);
      } else {
        setStatus('wrong');
        setRevealed(true);
        setExpectedMove(currentCard.mainMove);
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  const submitRating = async (rating: number) => {
    if (!treeMeta) return;
    const card = flashcards[currentIndex];
    const { data: existing } = await supabase.from('reviews').select('*').eq('tree_id', card.treeId).eq('fen', card.fen).single();

    const oldInt = existing?.interval ?? 1;
    const oldRep = existing?.repetitions ?? 0;
    const oldEase = existing?.ease_factor ?? 2.5;

    const { interval, repetitions, ease } = calculateSM2(rating, oldInt, oldRep, oldEase);
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    await supabase.from('reviews').upsert({
      tree_id: card.treeId,
      user_id: treeMeta.user_id,
      fen: card.fen,
      interval,
      repetitions,
      ease_factor: ease,
      next_review_date: nextReview.toISOString()
    });

    nextCard();
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
      setRevealed(false);
    } else {
      setFlashcards([]);
    }
  };

  const handleRetry = () => {
    const currentCard = flashcards[currentIndex];
    gameRef.current = new Chess(currentCard.fen);
    setCurrentFen(currentCard.fen);
    setStatus('playing');
    setRevealed(false);
  };

  if (loading) return <div className="p-8 text-center text-muted">Loading review...</div>;
  if (!treeMeta) return <div className="p-8 text-center">Tree not found.</div>;

  if (flashcards.length === 0) return (
    <div className="card text-center m-8 p-12" style={{ maxWidth: 500, margin: '4rem auto' }}>
      <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
      <h2>Review Complete!</h2>
      <p className="text-muted" style={{ marginTop: '0.5rem' }}>You've reviewed all available moves for this session.</p>
      <div style={{ display:'flex', gap:'1rem', marginTop: '2rem', justifyContent:'center' }}>
        <button onClick={() => navigate('/')} className="btn btn-secondary">Dashboard</button>
        <button onClick={() => loadTreeAndGenerateCards()} className="btn">Start Over</button>
      </div>
    </div>
  );

  return (
    <div className="review-container" style={{ display:'flex', flexDirection:'column', height: 'calc(100vh - var(--header-height) - 1.5rem)', gap: '1rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => navigate(`/editor/${id}`)} className="btn btn-secondary btn-icon"><ArrowLeft size={18} /></button>
        <div style={{ textAlign:'center' }}>
          <h2 style={{ margin:0, fontSize:'1.2rem' }}>{treeMeta.title}</h2>
          <span className="text-sm text-muted">Position {currentIndex + 1} / {flashcards.length}</span>
        </div>
        <button onClick={() => navigate('/settings')} className="btn btn-secondary btn-icon"><SettingsIcon size={18} /></button>
      </div>

      <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', padding: '1rem' }}>
        <div className="review-board-wrapper" style={{ width: '100%', maxWidth: 'min(70vh, 100%)', aspectRatio: '1/1' }}>
          {(() => {
            const Board = Chessboard as any;
            return <Board
              options={{
                position: currentFen,
                onPieceDrop: onDrop,
                boardOrientation: treeMeta.color,
                pieces: calientePieces,
                darkSquareStyle: boardStyles.darkSquareStyle,
                lightSquareStyle: boardStyles.lightSquareStyle,
                boardStyle: boardStyles.boardStyle,
              }}
            />;
          })()}
        </div>

        <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: 600, height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {!revealed ? (
            <p style={{ fontSize: '1.3rem', fontWeight: 600, display:'flex', alignItems:'center', gap: 8 }}>
              <Brain className="text-accent" size={24} />
              Your move for <span style={{ color:'var(--accent-color)', textTransform:'capitalize' }}>{treeMeta.color}</span>
            </p>
          ) : (
            <div className="animate-fade-in" style={{ width: '100%', textAlign: 'center' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap: 6, color: status === 'correct' ? 'var(--success)' : 'var(--error)', justifyContent:'center', fontSize: '1.2rem', fontWeight: 700 }}>
                  {status === 'correct' ? <CheckCircle size={22} /> : <XCircle size={22} />}
                  {status === 'correct' ? 'Correct!' : 'Incorrect'}
                </div>
                {status === 'wrong' && <p className="text-muted text-sm">Correct move: <strong>{expectedMove}</strong></p>}
              </div>

              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'center', width:'100%' }}>
                {status === 'wrong' ? (
                  <button onClick={handleRetry} className="btn btn-secondary" style={{ flex: 1 }}>RETRY</button>
                ) : (
                  <>
                    <button onClick={() => submitRating(1)} className="btn btn-secondary" style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}>HARD</button>
                    <button onClick={() => submitRating(3)} className="btn" style={{ flex: 1, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>GOOD</button>
                    <button onClick={() => submitRating(5)} className="btn btn-secondary" style={{ flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>EASY</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
