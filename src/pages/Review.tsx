import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { ArrowLeft, CheckCircle, XCircle, Brain } from 'lucide-react';
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

  // 1. Learning phase (first time graduating)
  if (oldInterval === 0) {
    if (rating === 3) interval = 1;      // Good (1 day)
    else if (rating === 5) interval = 4; // Easy (4 days)
    else interval = 1;
    repetitions = 1;
  } else {
    // 2. Review phase (graduated)
    if (rating >= 3) {
      // Bonus multiplier for Easy (5) to reach 16d from 4d
      const bonus = rating === 5 ? 1.6 : 1.0;
      interval = Math.max(oldInterval + 1, Math.round(oldInterval * oldEase * bonus));
      repetitions = oldRepetitions + 1;
    } else {
      // Again/Hard back to learning
      repetitions = 1;
      interval = 1;
    }
  }

  // Standard SM-2 ease adjustment
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

    // 1. Fetch metadata and tree data
    const { data: tree, error: treeErr } = await supabase.from('trees').select('*').eq('id', id).single();
    if (treeErr || !tree) {
      setLoading(false);
      return;
    }
    setTreeMeta(tree);

    // 2. Fetch existing reviews to determine what's due
    const { data: reviews } = await supabase.from('reviews').select('fen, next_review_date').eq('tree_id', id);
    const reviewMap = new Map(reviews?.map(r => [r.fen, new Date(r.next_review_date)]) || []);

    const tData = tree.tree_data;
    const allMatchingCards: ReviewCard[] = [];
    const isPlayerWhite = tree.color === 'white';

    function traverse(node: TreeNode) {
      const chess = new Chess(node.fen);
      const isWhiteTurn = chess.turn() === 'w';
      const isSideToMatch = isPlayerWhite ? isWhiteTurn : !isWhiteTurn;

      if (isSideToMatch && node.children && node.children.length > 0) {
        // FILTER: Only add if new OR due
        const nextReview = reviewMap.get(node.fen);
        const isDue = !nextReview || nextReview <= new Date();

        if (isDue) {
          allMatchingCards.push({
            fen: node.fen,
            possibleMoves: node.children.map(c => c.move ?? '').filter((m): m is string => !!m),
            mainMove: node.children[0].move ?? '',
            treeId: id ?? ''
          });
        }
      }

      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    }

    if (tData) traverse(tData);

    // Shuffle the due cards
    const shuffled = allMatchingCards.sort(() => Math.random() - 0.5);
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
    if (!treeMeta || !flashcards[currentIndex]) return;
    const card = flashcards[currentIndex];

    // Always log history for accurate heatmap
    await supabase.from('review_logs').insert({
      tree_id: card.treeId,
      user_id: treeMeta.user_id,
      fen: card.fen,
      rating
    });
    if (rating === 1 || rating === 2) {
      // "Again" (1) or "Hard" (2) -> Re-queue at the end of the session
      handleSessionRequeue();
    } else {
      // "Medium" (3) or "Easy" (5) -> Graduate to Supabase (>= 1 day)
      const { data: existing } = await supabase.from('reviews').select('*').eq('tree_id', card.treeId).eq('fen', card.fen).single();
      const oldInt = existing?.interval ?? 0;
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
    }
  };

  const handleSessionRequeue = () => {
    setFlashcards(prev => {
      const next = [...prev];
      const [removed] = next.splice(currentIndex, 1);
      return [...next, removed];
    });
    // The card at currentIndex is now the "next" one in the original queue
    // but the state needs to be refreshed
    setRevealed(false);
    setStatus('playing');
    // We need to wait for state update to get the new flashcards[currentIndex]? 
    // No, we can just use the next item in the array for the immediate UI update
  };

  // Update UI when flashcards or currentIndex change
  useEffect(() => {
    if (flashcards[currentIndex]) {
      const card = flashcards[currentIndex];
      gameRef.current = new Chess(card.fen);
      setCurrentFen(card.fen);
      setExpectedMove(card.mainMove);
    }
  }, [currentIndex, flashcards]);

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
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'center' }}>
        <button onClick={() => navigate('/')} className="btn btn-secondary">Dashboard</button>
        <button onClick={() => loadTreeAndGenerateCards()} className="btn">Start Over</button>
      </div>
    </div>
  );

  return (
    <div className="review-layout">
      <div className="review-board-container">
        <div className="card" style={{ padding: '1rem', position: 'relative', overflow: 'hidden' }}>
          <div className="review-board-wrapper" style={{ width: '100%', aspectRatio: '1/1' }}>
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
        </div>
      </div>

      <div className="review-info-container">
        <div className="card" style={{ width: '100%', minHeight: 280, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          {/* Header elements moved inside the card */}
          <div style={{ display: 'flex', width: '100%', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <button
              onClick={() => navigate(`/editor/${id}`)}
              className="btn btn-secondary btn-icon"
              title="Back to Editor"
              style={{ borderRadius: 'var(--radius-md)' }}
            >
              <ArrowLeft size={20} />
            </button>
            <div style={{ paddingLeft: '1rem', justifyContent: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.2 }}>{treeMeta.title}</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Position {currentIndex + 1} / {flashcards.length}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {!revealed ? (
              <div style={{ textAlign: 'center' }}>
                <Brain className="text-accent" size={32} style={{ marginBottom: '1rem', opacity: 0.9 }} />
                <p style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>
                  Your move for <span style={{ color: 'var(--accent-color)', textTransform: 'capitalize' }}>{treeMeta.color}</span>
                </p>
              </div>
            ) : (
              <div className="animate-fade-in" style={{ width: '100%', textAlign: 'center' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: status === 'correct' ? 'var(--success)' : 'var(--error)', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700 }}>
                    {status === 'correct' ? <CheckCircle size={22} /> : <XCircle size={22} />}
                    {status === 'correct' ? 'Correct!' : 'Incorrect'}
                  </div>
                  {status === 'wrong' && <p className="text-muted text-sm">Correct move: <strong>{expectedMove}</strong></p>}
                </div>

                <div style={{
                  display: 'flex',
                  gap: '1rem',
                  justifyContent: 'center',
                  width: '100%',
                  flexWrap: 'wrap'
                }}>
                  {status === 'wrong' ? (
                    <button onClick={handleRetry} className="btn btn-secondary" style={{ flex: '1 1 100%', padding: '1rem' }}>RETRY</button>
                  ) : (
                    <>
                      <button
                        onClick={() => submitRating(1)}
                        className="btn"
                        style={{
                          flex: '1 1 140px',
                          backgroundColor: 'rgba(219, 39, 119, 0.1)',
                          color: '#ec4899',
                          padding: '1rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        AGAIN<br /><span style={{ opacity: 0.6, fontSize: '0.75rem' }}>1m</span>
                      </button>
                      <button
                        onClick={() => submitRating(2)}
                        className="btn"
                        style={{
                          flex: '1 1 140px',
                          backgroundColor: 'rgba(219, 39, 119, 0.25)',
                          color: '#fbcfe8',
                          padding: '1rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        HARD<br /><span style={{ opacity: 0.8, fontSize: '0.75rem' }}>10m</span>
                      </button>
                      <button
                        onClick={() => submitRating(3)}
                        className="btn"
                        style={{
                          flex: '1 1 140px',
                          backgroundColor: 'rgba(219, 39, 119, 0.6)',
                          color: 'white',
                          padding: '1rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        GOOD<br /><span style={{ opacity: 0.9, fontSize: '0.75rem' }}>1d</span>
                      </button>
                      <button
                        onClick={() => submitRating(5)}
                        className="btn"
                        style={{
                          flex: '1 1 140px',
                          backgroundColor: '#9d174d',
                          color: 'white',
                          padding: '1rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        EASY<br /><span style={{ opacity: 0.9, fontSize: '0.75rem' }}>4d+</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
