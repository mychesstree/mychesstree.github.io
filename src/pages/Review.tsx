import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { ArrowLeft, CheckCircle, XCircle, Brain } from 'lucide-react';
import { calientePieces, boardStyles } from '../lib/chessAssets';
import { useAuth } from '../hooks/useAuth';
import LoadingScreen from '../components/LoadingScreen';
import moveSound from '../../public/move.mp3';
import captureSound from '../../public/capture.mp3';

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
  oldInterval: number;
  oldRepetitions: number;
  oldEase: number;
}

function calculateSM2(rating: number, oldInterval: number, oldRepetitions: number, oldEase: number) {
  let interval = 1;
  let repetitions = 0;
  let ease = oldEase;

  if (oldInterval === 0) {
    if (rating === 3) interval = 1;
    else if (rating === 5) interval = 4;
    else interval = 1;
    repetitions = 1;
  } else {
    if (rating >= 3) {
      if (oldInterval === 4 && rating === 3) {
        interval = 16;
      } else if (oldInterval === 4 && rating === 5) {
        interval = 24;
      } else {
        const bonus = rating === 5 ? 1.3 : 1.0;
        interval = Math.max(oldInterval + 1, Math.round(oldInterval * oldEase * bonus));
      }
      repetitions = oldRepetitions + 1;
    } else {
      repetitions = 1;
      interval = 1;
    }
  }

  ease = oldEase + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  if (ease < 1.3) ease = 1.3;
  return { interval, repetitions, ease };
}

function formatInterval(days: number) {
  if (days < 1) return '10m';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30 * 10) / 10}mo`;
  return `${Math.round(days / 365 * 10) / 10}y`;
}

// Helper to load a card onto the board
function loadCard(card: ReviewCard, gameRef: React.MutableRefObject<Chess>, setCurrentFen: (f: string) => void, setExpectedMove: (m: string) => void) {
  gameRef.current = new Chess(card.fen);
  setCurrentFen(card.fen);
  setExpectedMove(card.mainMove);
}

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isGuest, getGuestTree, loadGuestReviews, saveGuestReview } = useAuth();
  const [treeMeta, setTreeMeta] = useState<any>(null);
  const moveAudioRef = useRef<HTMLAudioElement | null>(null);
  const captureAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    moveAudioRef.current = new Audio(moveSound);
    moveAudioRef.current.volume = 0.5;
    captureAudioRef.current = new Audio(captureSound);
    captureAudioRef.current.volume = 0.5;

    return () => {
      moveAudioRef.current = null;
      captureAudioRef.current = null;
    };
  }, []);

  const playMoveSound = (isCapture: boolean) => {
    const audioRef = isCapture ? captureAudioRef : moveAudioRef;
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => { });
  };

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
    setLoading(true);
    setCurrentIndex(0);
    setStatus('playing');
    setRevealed(false);

    let tree;
    if (isGuest) {
      tree = getGuestTree(id);
      if (!tree) { setLoading(false); return; }
    } else {
      const { data: treeData, error: treeErr } = await supabase.from('trees').select('*').eq('id', id).maybeSingle();
      if (treeErr || !treeData) { setLoading(false); return; }
      tree = treeData;
    }
    setTreeMeta(tree);

    let reviewMap: Map<string, { date: Date; interval: number; repetitions: number; ease: number }> = new Map();
    if (isGuest) {
      const reviews = loadGuestReviews(id);
      reviewMap = new Map(reviews.map(r => [r.fen, {
        date: new Date(r.next_review_date),
        interval: r.interval,
        repetitions: r.repetitions,
        ease: r.ease_factor
      }]));
    } else {
      const { data: reviews } = await supabase
        .from('reviews')
        .select('fen, next_review_date, interval, repetitions, ease_factor')
        .eq('tree_id', id);
      reviewMap = new Map(reviews?.map(r => [r.fen, {
        date: new Date(r.next_review_date),
        interval: r.interval,
        repetitions: r.repetitions,
        ease: r.ease_factor
      }]) || []);
    }

    const tData = tree.tree_data;
    const allMatchingCards: ReviewCard[] = [];
    const isPlayerWhite = tree.color === 'white';
    const now = new Date();

    function traverse(node: TreeNode) {
      const chess = new Chess(node.fen);
      const isWhiteTurn = chess.turn() === 'w';
      const isSideToMatch = isPlayerWhite ? isWhiteTurn : !isWhiteTurn;

      if (isSideToMatch && node.children && node.children.length > 0) {
        const reviewData = reviewMap.get(node.fen);
        const isDue = !reviewData || reviewData.date <= now;

        if (isDue) {
          allMatchingCards.push({
            fen: node.fen,
            possibleMoves: node.children.map(c => c.move ?? '').filter((m): m is string => !!m),
            mainMove: node.children[0].move ?? '',
            treeId: id ?? '',
            oldInterval: reviewData?.interval ?? 0,
            oldRepetitions: reviewData?.repetitions ?? 0,
            oldEase: reviewData?.ease ?? 2.5
          });
        }
      }

      node.children?.forEach(child => traverse(child));
    }

    if (tData) traverse(tData);

    const shuffled = allMatchingCards.sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);

    if (shuffled.length > 0) {
      loadCard(shuffled[0], gameRef, setCurrentFen, setExpectedMove);
    }
    setLoading(false);
  }, [id, isGuest, getGuestTree, loadGuestReviews]);

  useEffect(() => {
    loadTreeAndGenerateCards();
  }, [loadTreeAndGenerateCards]);

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
    if (status !== 'playing') return false;
    try {
      const moveObj = gameRef.current.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!moveObj) return false;

      playMoveSound(!!moveObj.captured);

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
    } catch {
      return false;
    }
  };

  const saveReview = async (card: ReviewCard, rating: number) => {
    const { interval, repetitions, ease } = calculateSM2(rating, card.oldInterval, card.oldRepetitions, card.oldEase);
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    if (isGuest) {
      saveGuestReview({
        fen: card.fen,
        tree_id: card.treeId,
        interval,
        repetitions,
        ease_factor: ease,
        next_review_date: nextReview.toISOString()
      });
    } else {
      // Fire both in parallel — log for heatmap, upsert for scheduling
      await Promise.all([
        supabase.from('review_logs').insert({
          tree_id: card.treeId,
          user_id: treeMeta.user_id,
          fen: card.fen,
          rating
        }),
        supabase.from('reviews').upsert({
          tree_id: card.treeId,
          user_id: treeMeta.user_id,
          fen: card.fen,
          interval,
          repetitions,
          ease_factor: ease,
          next_review_date: nextReview.toISOString()
        }, { onConflict: 'user_id, tree_id, fen' })
      ]);
    }
  };

  const submitRating = async (rating: number) => {
    if (!treeMeta || !flashcards[currentIndex]) return;
    const card = flashcards[currentIndex];

    if (rating <= 2) {
      // Again / Hard: requeue at end of session, don't save to DB yet
      // Log it for heatmap even on failure (signed-in only)
      if (!isGuest) {
        supabase.from('review_logs').insert({
          tree_id: card.treeId,
          user_id: treeMeta.user_id,
          fen: card.fen,
          rating
        });
      }

      setFlashcards(prev => {
        const next = [...prev];
        const [removed] = next.splice(currentIndex, 1);
        const requeued = [...next, removed];

        // currentIndex now points to the next card (or wraps) — load it immediately
        const nextCard = requeued[currentIndex] ?? requeued[0];
        if (nextCard) loadCard(nextCard, gameRef, setCurrentFen, setExpectedMove);

        return requeued;
      });
      setStatus('playing');
      setRevealed(false);
    } else {
      // Good / Easy: save and advance
      await saveReview(card, rating);
      advanceToNextCard();
    }
  };

  const advanceToNextCard = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < flashcards.length) {
      setCurrentIndex(nextIdx);
      loadCard(flashcards[nextIdx], gameRef, setCurrentFen, setExpectedMove);
      setStatus('playing');
      setRevealed(false);
    } else {
      setFlashcards([]);
    }
  };

  const handleRetry = () => {
    loadCard(flashcards[currentIndex], gameRef, setCurrentFen, setExpectedMove);
    setStatus('playing');
    setRevealed(false);
  };

  return (
    <>
      <LoadingScreen isLoading={loading} />

      {!loading && !treeMeta && (
        <div className="p-8 text-center">Tree not found.</div>
      )}

      {!loading && treeMeta && flashcards.length === 0 && (
        <div className="card text-center m-8 p-12" style={{ maxWidth: 500, margin: '4rem auto' }}>
          <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
          <h2>Review Complete!</h2>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>You've reviewed all available moves for this session.</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'center' }}>
            <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">Dashboard</button>
            <button onClick={() => loadTreeAndGenerateCards()} className="btn">Start Over</button>
          </div>
        </div>
      )}

      {!loading && treeMeta && flashcards.length > 0 && (
        <div className="review-layout">
          <div className="review-board-container">
            <div className="card" style={{ padding: '0rem', position: 'relative', overflow: 'hidden', marginTop: '3rem' }}>
              {(() => {
                const Board = Chessboard as any;
                return <Board options={{
                  position: currentFen,
                  onPieceDrop: onDrop,
                  boardOrientation: treeMeta.color,
                  pieces: calientePieces,
                  darkSquareStyle: boardStyles.darkSquareStyle,
                  lightSquareStyle: boardStyles.lightSquareStyle,
                  boardStyle: boardStyles.boardStyle,
                }} />;
              })()}
            </div>
          </div>

          <div className="review-info-container">
            <div className="card" style={{ width: '100%', minHeight: 280, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
              <div style={{ display: 'flex', width: '100%', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                <button
                  onClick={() => navigate(`/editor/${id}`)}
                  className="btn btn-secondary btn-icon"
                  title="Back to Editor"
                  style={{ borderRadius: 'var(--radius-md)' }}
                >
                  <ArrowLeft size={20} />
                </button>
                <div style={{ paddingLeft: '1rem' }}>
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

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', width: '100%', flexWrap: 'wrap' }}>
                      {status === 'wrong' ? (
                        <button onClick={handleRetry} className="btn btn-secondary" style={{ flex: '1 1 100%', padding: '1rem' }}>RETRY</button>
                      ) : (() => {
                        const card = flashcards[currentIndex];
                        const goodCalc = calculateSM2(3, card.oldInterval, card.oldRepetitions, card.oldEase);
                        const easyCalc = calculateSM2(5, card.oldInterval, card.oldRepetitions, card.oldEase);
                        return (
                          <>
                            <button onClick={() => submitRating(1)} className="btn" style={{ flex: '1 1 140px', backgroundColor: 'rgba(219, 39, 119, 0.1)', color: '#ec4899', padding: '1rem', fontSize: '0.85rem' }}>
                              AGAIN<br /><span style={{ opacity: 0.6, fontSize: '0.75rem' }}>1m</span>
                            </button>
                            <button onClick={() => submitRating(2)} className="btn" style={{ flex: '1 1 140px', backgroundColor: 'rgba(219, 39, 119, 0.25)', color: '#fbcfe8', padding: '1rem', fontSize: '0.85rem' }}>
                              HARD<br /><span style={{ opacity: 0.8, fontSize: '0.75rem' }}>10m</span>
                            </button>
                            <button onClick={() => submitRating(3)} className="btn" style={{ flex: '1 1 140px', backgroundColor: 'rgba(219, 39, 119, 0.6)', color: 'white', padding: '1rem', fontSize: '0.85rem' }}>
                              GOOD<br /><span style={{ opacity: 0.9, fontSize: '0.75rem' }}>{formatInterval(goodCalc.interval)}</span>
                            </button>
                            <button onClick={() => submitRating(5)} className="btn" style={{ flex: '1 1 140px', backgroundColor: '#9d174d', color: 'white', padding: '1rem', fontSize: '0.85rem' }}>
                              EASY<br /><span style={{ opacity: 0.9, fontSize: '0.75rem' }}>{formatInterval(easyCalc.interval)}</span>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
