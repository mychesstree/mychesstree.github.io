import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { calientePieces, boardStyles } from '../lib/chessAssets';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, X, Trophy, GitMerge, Plus, Check, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useMobile } from '../hooks/useMobile';
import { uciToWhiteArrow, addMovesAsVariation, parsePgnMoves } from '../utils/treeUtils';
import { useToast } from '../components/Toast';
import CreateTreeModal from '../components/CreateTreeModal';

interface PuzzlePosition {
  fen: string;
  turn: 'white' | 'black';
  master_move: string;
  move_number: number;
  engine_move?: string;
  engine_uci?: string;
  engine_cp?: number;
  engine_depth?: number;
}

interface DailyGame {
  id: string;
  date: string;
  white_player: string;
  black_player: string;
  white_rating?: number;
  black_rating?: number;
  result: string;
  opening_name?: string;
  pgn?: string;
  puzzle_positions: PuzzlePosition[];
}

interface Tree {
  id: string;
  title: string;
  description?: string;
  color: 'white' | 'black';
  created_at: string;
  updated_at: string;
  is_public: boolean;
  stars: number;
  node_count: number;
  user_id: string;
  tree_data?: any;
}

interface PuzzleInterfaceProps {
  game: DailyGame;
  positionIndex: number;
  onClose: () => void;
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  dateRange?: { earliest: Date; latest: Date };
}

const TABLE = 'daily_master_games'; // single source of truth

export default function PuzzleInterface({
  game: initialGame,
  positionIndex: initialPositionIndex,
  onClose,
  selectedDate: initialSelectedDate = new Date(),
  onDateChange,
  dateRange,
}: PuzzleInterfaceProps) {
  const { user } = useAuth();
  const isMobile = useMobile();
  const { success: showSuccess, info: showInfo, error: showError } = useToast();

  const gameRef = useRef(new Chess());
  const replayIntervalRef = useRef<any>(null);

  const [game, setGame] = useState<DailyGame>(initialGame);
  const [positionIndex, setPositionIndex] = useState(initialPositionIndex);
  const [selectedDate, setSelectedDate] = useState<Date>(initialSelectedDate);
  const [currentPosition, setCurrentPosition] = useState<PuzzlePosition | null>(null);

  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [boardShake, setBoardShake] = useState(false);
  const [masterMoveArrow, setMasterMoveArrow] = useState<any[]>([]);
  const [engineArrow, setEngineArrow] = useState<any[]>([]);
  const [showFinishCelebration, setShowFinishCelebration] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [retryCount, setRetryCount] = useState<Record<number, number>>({});

  const [completedPositions, setCompletedPositions] = useState<Set<number>>(new Set());
  const [dateRangeState, setDateRangeState] = useState<{ earliest: Date; latest: Date } | null>(dateRange ?? null);

  // Full-game review state
  const [fullGameMoves, setFullGameMoves] = useState<string[]>([]);
  const [fullGameFens, setFullGameFens] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [importMoveLimit, setImportMoveLimit] = useState<number>(0);

  // Tree integration state
  const [showTreeSelection, setShowTreeSelection] = useState(false);
  const [userTrees, setUserTrees] = useState<Tree[]>([]);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [selectedTree, setSelectedTree] = useState<Tree | null>(null);
  const [isIntegrating, setIsIntegrating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'white' | 'black'>('white');

  // ── helpers ────────────────────────────────────────────────────────────────

  const sanToArrow = (fen: string, san: string, color: string) => {
    try {
      const tmp = new Chess(fen);
      const m = tmp.move(san);
      if (!m) return null;
      return { startSquare: m.from, endSquare: m.to, color };
    } catch { return null; }
  };

  const buildArrows = (pos: PuzzlePosition) => {
    const master = pos.master_move;
    const mArrow = master ? sanToArrow(pos.fen, master, 'rgba(255,255,255,0.9)') : null;
    setMasterMoveArrow(mArrow ? [mArrow] : []);

    if (pos.engine_uci) {
      const eArrow = uciToWhiteArrow(pos.engine_uci);
      setEngineArrow(eArrow ? [{ ...eArrow, key: `engine-${pos.engine_uci}` }] : []);
    } else {
      setEngineArrow([]);
    }
  };

  const localDoneKey = (gameId: string) => `chesstr.ee_daily_done_${gameId}`;
  const localProgressKey = (gameId: string) => `chesstr.ee_daily_progress_${gameId}`;

  const isDoneLocally = (gameId: string, idx: number) => {
    try {
      return (JSON.parse(localStorage.getItem(localDoneKey(gameId)) || '[]') as number[]).includes(idx);
    } catch { return false; }
  };

  const markDoneLocally = (gameId: string, idx: number) => {
    try {
      const done: number[] = JSON.parse(localStorage.getItem(localDoneKey(gameId)) || '[]');
      if (!done.includes(idx)) localStorage.setItem(localDoneKey(gameId), JSON.stringify([...done, idx]));
    } catch { }
  };

  // ── load position when positionIndex / game changes ───────────────────────

  useEffect(() => {
    const pos = game?.puzzle_positions?.[positionIndex];
    if (!pos) return;

    setCurrentPosition(pos);
    gameRef.current = new Chess(pos.fen);
    setStartTime(Date.now());
    setBoardShake(false);
    setMasterMoveArrow([]);
    setEngineArrow([]);
    setReviewIndex(null);

    const alreadyDone = completedPositions.has(positionIndex) || isDoneLocally(game.id, positionIndex);
    setIsCorrect(completedPositions.has(positionIndex));
    setShowResult(alreadyDone);
    if (alreadyDone) buildArrows(pos);
  }, [game, positionIndex, completedPositions]);

  // ── parse PGN for review mode ──────────────────────────────────────────────

  useEffect(() => {
    if (!game?.pgn) return;
    try {
      const tmp = new Chess();
      const fens = [tmp.fen()];
      const moves: string[] = [];
      const { moves: parsed } = parsePgnMoves(game.pgn);
      for (const m of parsed) {
        try {
          const r = tmp.move(m);
          if (r) { moves.push(r.san); fens.push(tmp.fen()); }
        } catch { }
      }
      setFullGameMoves(moves);
      setFullGameFens(fens);
      setImportMoveLimit(moves.length);
    } catch (e) { console.error('PGN parse error:', e); }
  }, [game]);

  // ── fetch date range ───────────────────────────────────────────────────────

  useEffect(() => {
    if (dateRange) { setDateRangeState(dateRange); return; }
    (async () => {
      try {
        const [{ data: minData }, { data: maxData }] = await Promise.all([
          supabase.from(TABLE).select('date').order('date', { ascending: true }).limit(1),
          supabase.from(TABLE).select('date').order('date', { ascending: false }).limit(1),
        ]);
        if (minData?.[0] && maxData?.[0]) {
          setDateRangeState({ earliest: new Date(minData[0].date), latest: new Date(maxData[0].date) });
        }
      } catch (e) { console.error('Date range fetch error:', e); }
    })();
  }, [dateRange]);

  // ── fetch user progress ────────────────────────────────────────────────────

  useEffect(() => {
    if (!game) return;
    (async () => {
      let completed = new Set<number>();
      try {
        const local = localStorage.getItem(localProgressKey(game.id));
        if (local) completed = new Set(JSON.parse(local));
      } catch { }

      if (user) {
        try {
          const { data } = await supabase
            .from('user_puzzle_attempts')
            .select('position_index')
            .eq('user_id', user.id)
            .eq('game_id', game.id)
            .eq('is_correct', true);
          data?.forEach(r => completed.add(r.position_index));
          localStorage.setItem(localProgressKey(game.id), JSON.stringify([...completed]));
        } catch (e) { console.error('Progress fetch error:', e); }
      }

      setCompletedPositions(completed);

      // Auto-advance to first unsolved
      if (positionIndex === 0 && completed.size > 0) {
        try {
          const localDone: number[] = JSON.parse(localStorage.getItem(localDoneKey(game.id)) || '[]');
          const allDone = new Set([...completed, ...localDone]);
          let first = 0;
          while (first < game.puzzle_positions.length && allDone.has(first)) first++;
          if (first < game.puzzle_positions.length && first !== positionIndex) setPositionIndex(first);
        } catch { }
      }
    })();
  }, [user, game]);

  // ── fetch trees when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (showTreeSelection && user) fetchUserTrees();
  }, [showTreeSelection, user]);

  // ── keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (replayIntervalRef.current) {
          clearInterval(replayIntervalRef.current);
          replayIntervalRef.current = null;
          setShowFinishCelebration(false);
        }
      }
      if (e.key === 'ArrowRight' && !showFinishCelebration) {
        if (reviewIndex !== null) {
          if (reviewIndex < fullGameFens.length - 1) setReviewIndex(i => i! + 1);
        } else if (showResult && positionIndex < game.puzzle_positions.length - 1) {
          handleNext();
        }
      } else if (e.key === 'ArrowLeft' && !showFinishCelebration) {
        if (reviewIndex !== null) {
          if (reviewIndex > 0) setReviewIndex(i => i! - 1);
        } else if (positionIndex > 0) {
          setPositionIndex(i => i - 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [positionIndex, reviewIndex, showResult, game, fullGameFens, showFinishCelebration]);

  // ── move handling ──────────────────────────────────────────────────────────

  const onPieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
    if (showResult || !currentPosition) return false;

    let moveObj: ReturnType<Chess['move']> | null = null;
    const validation = new Chess(gameRef.current.fen());
    try {
      moveObj = validation.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch { }
    if (!moveObj) return false;

    const userSAN = moveObj.san;
    const userUCI = moveObj.from + moveObj.to + (moveObj.promotion ?? '');
    const { master_move, engine_uci } = currentPosition;

    const correct = userSAN === master_move || (!!engine_uci && userUCI === engine_uci);

    if (correct) {
      gameRef.current = validation;
      setIsCorrect(true);
      setShowResult(true);
      showSuccess('Correct! ✓');
      buildArrows(currentPosition);

      setCompletedPositions(prev => {
        const next = new Set([...prev, positionIndex]);
        localStorage.setItem(localProgressKey(game.id), JSON.stringify([...next]));
        return next;
      });

      recordAttempt(userSAN, true);
      return true;
    }

    // Wrong answer
    const retries = (retryCount[positionIndex] ?? 0) + 1;
    setRetryCount(prev => ({ ...prev, [positionIndex]: retries }));
    recordAttempt(userSAN, false);

    if (retries >= 2) {
      // Reveal
      const reveal = new Chess(currentPosition.fen);
      try { reveal.move(master_move); gameRef.current = reveal; } catch { }
      buildArrows(currentPosition);
      setIsCorrect(false);
      setShowResult(true);
      showInfo(`The move was ${master_move}`);
      markDoneLocally(game.id, positionIndex);
      return false;
    }

    setBoardShake(true);
    showInfo('Not quite — try again!');
    setTimeout(() => setBoardShake(false), 600);
    return false;
  };

  const recordAttempt = async (userMove: string, correct: boolean) => {
    if (!user || !currentPosition) return;
    try {
      await supabase.from('user_puzzle_attempts').insert({
        user_id: user.id,
        game_id: game.id,
        position_index: positionIndex,
        fen: currentPosition.fen,
        user_move: userMove,
        master_move: currentPosition.master_move,
        is_correct: correct,
        time_taken: Math.floor((Date.now() - startTime) / 1000),
      });
    } catch (e) { console.error('recordAttempt error:', e); }
  };

  // ── navigation ─────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (positionIndex < game.puzzle_positions.length - 1) {
      setPositionIndex(i => i + 1);
      return;
    }
    // Last puzzle done — celebrate + auto-replay
    setShowFinishCelebration(true);
    setTimeout(() => {
      setReviewIndex(0);
      let step = 0;
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = setInterval(() => {
        step++;
        setReviewIndex(step);
        if (step >= fullGameFens.length - 1) {
          clearInterval(replayIntervalRef.current);
          replayIntervalRef.current = null;
          setTimeout(() => setShowFinishCelebration(false), 1000);
        }
      }, 500);
    }, 1500);
  };

  const handleDateChange = async (direction: 'prev' | 'next') => {
    if (!dateRangeState) return;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const clampedLatest = new Date(Math.min(dateRangeState.latest.getTime(), today.getTime()));

    const next = new Date(selectedDate);
    next.setDate(next.getDate() + (direction === 'next' ? 1 : -1));

    if (next < dateRangeState.earliest) { showError('No older puzzles available'); return; }
    if (next > clampedLatest) { showError('No future puzzles available yet'); return; }

    setSelectedDate(next);
    onDateChange?.(next);

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('date', next.toISOString().split('T')[0])
      .maybeSingle();

    if (error || !data) { showError('No game available for this date'); return; }

    // puzzle_positions may come back as a string if not typed as jsonb
    const parsed = { ...data, puzzle_positions: typeof data.puzzle_positions === 'string' ? JSON.parse(data.puzzle_positions) : data.puzzle_positions };
    setGame(parsed);
    setPositionIndex(0);
    setRetryCount({});
    setCompletedPositions(new Set());
  };

  // ── tree integration ───────────────────────────────────────────────────────

  const fetchUserTrees = async () => {
    setLoadingTrees(true);
    try {
      const { data, error } = await supabase.from('trees').select('*').eq('user_id', user!.id).order('updated_at', { ascending: false });
      if (error) throw error;
      setUserTrees(data ?? []);
    } catch (e) { console.error('fetchUserTrees error:', e); }
    finally { setLoadingTrees(false); }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const { data, error } = await supabase.from('trees').insert({
        title: newTitle, description: '', color: newColor, user_id: user!.id,
        is_public: false, tree_data: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', children: [] },
        stars: 0, node_count: 1,
      }).select().single();
      if (error) throw error;
      showSuccess('Tree created!');
      setIsCreating(false); setNewTitle(''); setNewColor('white');
      await fetchUserTrees();
      if (data) setSelectedTree(data);
    } catch (e) { console.error(e); showError('Failed to create tree'); }
  };

  const handleTreeIntegration = async () => {
    if (!selectedTree || !game) return;
    setIsIntegrating(true);
    try {
      const { data: td, error: fe } = await supabase.from('trees').select('tree_data').eq('id', selectedTree.id).single();
      if (fe) throw fe;

      let movesToAdd: string[] = [];
      if (game.pgn) {
        const { moves } = parsePgnMoves(game.pgn);
        movesToAdd = moves.slice(0, importMoveLimit > 0 ? importMoveLimit : moves.length);
      } else {
        const tmp = new Chess();
        for (const pos of game.puzzle_positions) {
          try { const m = tmp.move(pos.master_move); if (m) movesToAdd.push(m.san); } catch { break; }
        }
      }
      if (!movesToAdd.length) { showError('No valid moves found'); return; }

      const updated = addMovesAsVariation(td.tree_data, movesToAdd);
      const { error: se } = await supabase.from('trees').update({ tree_data: updated, updated_at: new Date().toISOString() }).eq('id', selectedTree.id);
      if (se) throw se;

      showSuccess(`Added ${movesToAdd.length} moves to "${selectedTree.title}"`);
      setShowTreeSelection(false); setSelectedTree(null);
    } catch (e) { console.error(e); showError('Failed to add moves to tree'); }
    finally { setIsIntegrating(false); }
  };

  // ── board arrows ───────────────────────────────────────────────────────────

  const boardArrows: any[] = reviewIndex !== null ? [] : showResult ? (() => {
    const map = new Map<string, any>(
      masterMoveArrow.map(a => [`${a.startSquare}-${a.endSquare}`, { ...a, color: 'rgba(255,255,255,0.9)' }])
    );
    engineArrow.forEach(e => {
      const k = `${e.startSquare}-${e.endSquare}`;
      map.has(k)
        ? map.set(k, { ...map.get(k), color: 'rgba(255,150,180,0.95)' })   // agree
        : map.set(k, { ...e, color: 'rgba(250,21,21,0.85)' });              // engine-only
    });
    return [...map.values()];
  })() : [];

  // ── early returns ──────────────────────────────────────────────────────────

  if (!currentPosition) return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 24, height: 24, border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent-color)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p>Loading position...</p>
      </div>
    </div>
  );

  // ── render ─────────────────────────────────────────────────────────────────

  const engineCpLabel = currentPosition.engine_cp != null
    ? (Math.abs(currentPosition.engine_cp) >= 30000
      ? (currentPosition.engine_cp > 0 ? 'M' : '-M')
      : `${currentPosition.engine_cp > 0 ? '+' : ''}${(currentPosition.engine_cp / 100).toFixed(1)}`)
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: isMobile ? 'flex-start' : 'center', padding: '1rem', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, width: '100%', display: isMobile ? 'block' : 'flex', gap: isMobile ? '1rem' : '2rem', alignItems: 'flex-start', padding: isMobile ? 0 : '2rem' }}>

        {/* ── Board ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="chess-board-container" style={{ display: 'flex', width: '100%', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', gap: 6 }}>
            <div style={{ width: '100%', maxWidth: '100vw' }} className={boardShake ? 'board-shake' : ''}>
              {(() => {
                const Board = Chessboard as any;
                return (
                  <Board options={{
                    position: reviewIndex !== null ? fullGameFens[reviewIndex] : gameRef.current.fen(),
                    onPieceDrop: (reviewIndex !== null || showResult) ? undefined : onPieceDrop,
                    boardOrientation: (() => {
                      const base = currentPosition.turn === 'black' ? 'black' : 'white';
                      return isFlipped ? (base === 'white' ? 'black' : 'white') : base;
                    })(),
                    pieces: calientePieces,
                    darkSquareStyle: boardStyles.darkSquareStyle,
                    lightSquareStyle: boardStyles.lightSquareStyle,
                    boardStyle: {
                      ...boardStyles.boardStyle,
                      borderRadius: '4px',
                      boxShadow: showResult
                        ? isCorrect ? '0 0 0 3px rgba(255,255,255,0.5),0 8px 30px rgba(0,0,0,0.5)' : '0 0 0 3px rgba(239,68,68,0.4),0 8px 30px rgba(0,0,0,0.5)'
                        : '0 8px 30px rgba(0,0,0,0.5)',
                    },
                    showNotation: false,
                    arrows: boardArrows,
                  }} />
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── Info Panel ── */}
        <div style={{ width: isMobile ? '100%' : 350, backgroundColor: 'var(--panel-bg)', borderRadius: 12, padding: isMobile ? '1rem' : '1.5rem', border: '1px solid var(--border-color)' }}>

          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', position: 'relative' }}>
              <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', position: 'absolute', left: 0, zIndex: 1 }}>
                <ArrowLeft size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
                <Trophy size={20} color="var(--accent-color)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Daily Game</h3>
              </div>
            </div>

            {/* Date nav */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  onClick={() => handleDateChange('prev')}
                  disabled={!dateRangeState || selectedDate <= dateRangeState.earliest}
                  style={{ background: 'none', border: 'none', padding: '0.25rem', display: 'flex', alignItems: 'center', cursor: (!dateRangeState || selectedDate <= dateRangeState.earliest) ? 'default' : 'pointer', color: (!dateRangeState || selectedDate <= dateRangeState.earliest) ? 'rgba(255,255,255,0.2)' : 'var(--text-muted)' }}
                  onMouseEnter={e => { if (dateRangeState && selectedDate > dateRangeState.earliest) e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { if (dateRangeState && selectedDate > dateRangeState.earliest) e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <ChevronLeft size={18} />
                </button>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>
                  {(() => {
                    const today = new Date(); today.setHours(23, 59, 59, 999);
                    return selectedDate < today && (
                      <button onClick={() => handleDateChange('next')} style={{ background: 'none', border: 'none', padding: '0.25rem', display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <ChevronRight size={18} />
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 3, width: '100%', marginBottom: '1.5rem' }}>
              {game.puzzle_positions.map((_, idx) => (
                <div key={idx} onClick={() => setPositionIndex(idx)} style={{
                  flex: 1, height: 6, borderRadius: 3, cursor: 'pointer', transition: 'all 0.2s',
                  backgroundColor: completedPositions.has(idx) ? 'rgba(255,255,255,1)' : isDoneLocally(game.id, idx) ? 'rgba(239,68,68,0.5)' : idx === positionIndex ? 'var(--accent-color)' : 'rgba(255,255,255,0.15)',
                  boxShadow: idx === positionIndex ? '0 0 8px var(--accent-color)' : 'none',
                }} />
              ))}
            </div>

            {/* Players */}
            {(['white', 'black'] as const).map(side => (
              <div key={side} style={{ marginBottom: side === 'white' ? '0.25rem' : '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 20, height: 20, backgroundColor: side === 'white' ? '#fff' : '#333', border: '2px solid var(--border-color)', borderRadius: 4 }} />
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  {(side === 'white' ? game.white_player : game.black_player).slice(0, 16)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 500 }}>
                  {side === 'white' ? game.white_rating : game.black_rating}
                </div>
              </div>
            ))}

            {game.opening_name && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontStyle: 'italic' }}>
                {game.opening_name}
              </div>
            )}
          </div>

          {/* Puzzle controls row */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: 12, backgroundColor: currentPosition.turn === 'white' ? '#fff' : '#333', color: currentPosition.turn === 'white' ? '#333' : '#fff', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                  {reviewIndex !== null
                    ? reviewIndex === 0 ? 'Start' : `${Math.ceil(reviewIndex / 2)}. ${reviewIndex % 2 === 1 ? fullGameMoves[reviewIndex - 1] : '...' + fullGameMoves[reviewIndex - 1]}`
                    : `${currentPosition.turn === 'white' ? 'White' : 'Black'} to move`}
                </div>
                {/* Engine eval badge */}
                {showResult && engineCpLabel && reviewIndex === null && (
                  <div style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {engineCpLabel}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {reviewIndex !== null && (
                  <button onClick={() => setIsFlipped(f => !f)} title="Flip Board" style={{ background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <RefreshCw size={16} />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (replayIntervalRef.current) { clearInterval(replayIntervalRef.current); replayIntervalRef.current = null; setShowFinishCelebration(false); }
                    reviewIndex !== null ? (reviewIndex > 0 && setReviewIndex(i => i! - 1)) : (positionIndex > 0 && setPositionIndex(i => i - 1));
                  }}
                  disabled={reviewIndex !== null ? reviewIndex === 0 : positionIndex === 0}
                  style={{ background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-muted)', cursor: 'pointer', opacity: (reviewIndex !== null ? reviewIndex === 0 : positionIndex === 0) ? 0.3 : 1, display: 'flex', alignItems: 'center' }}
                >
                  <ChevronLeft size={18} />
                </button>
                {reviewIndex === null && (
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: '1rem', textAlign: 'center' }}>
                    {positionIndex + 1}/{game.puzzle_positions.length}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (replayIntervalRef.current) { clearInterval(replayIntervalRef.current); replayIntervalRef.current = null; setShowFinishCelebration(false); }
                    reviewIndex !== null ? (reviewIndex < fullGameFens.length - 1 && setReviewIndex(i => i! + 1)) : (showResult && positionIndex < game.puzzle_positions.length - 1 && handleNext());
                  }}
                  disabled={reviewIndex !== null ? reviewIndex >= fullGameFens.length - 1 : !showResult || positionIndex >= game.puzzle_positions.length - 1}
                  style={{ background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-muted)', cursor: 'pointer', opacity: (reviewIndex !== null ? reviewIndex >= fullGameFens.length - 1 : !showResult || positionIndex >= game.puzzle_positions.length - 1) ? 0.3 : 1, display: 'flex', alignItems: 'center' }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Prompt */}
            {!showResult && (
              <div className="text-muted" style={{ fontSize: '0.9rem' }}>What move was played in this game?</div>
            )}

            {/* Result card */}
            {showResult && reviewIndex === null && (
              <div style={{ padding: '0.75rem 1rem', borderRadius: 8, backgroundColor: isCorrect ? 'rgba(197,34,34,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${isCorrect ? 'rgba(255,172,172,0.4)' : 'rgba(239,68,68,0.35)'}`, marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: isCorrect ? 0 : '0.5rem' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: isCorrect ? 'rgba(255,207,207,0.8)' : 'rgba(239,68,68,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isCorrect ? <Check size={14} color="white" /> : <X size={14} color="white" />}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem', color: isCorrect ? 'rgba(255,226,226,1)' : 'rgb(239,68,68)' }}>
                    {isCorrect ? 'Correct!' : 'Revealed'}
                  </span>
                </div>
                {!isCorrect && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingLeft: '2rem' }}>
                    Master move: <strong style={{ color: 'rgba(255,236,236,1)' }}>{currentPosition.master_move}</strong>
                  </div>
                )}
              </div>
            )}

            {/* PGN in review mode */}
            {reviewIndex !== null && game.pgn && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <GitMerge size={14} /><span>Full Game PGN</span>
                </div>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 8, fontSize: '0.8rem', fontFamily: 'monospace', lineHeight: 1.5, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                  {game.pgn.split('\n\n')[1] ?? game.pgn}
                </div>
              </div>
            )}

            {/* Arrow legend */}
            {showResult && engineArrow.length > 0 && reviewIndex === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' }} />
                  <span>Game move</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: 'rgba(250,21,21,0.85)' }} />
                  <span>Engine best move (depth {currentPosition.engine_depth ?? '?'})</span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {showResult && (
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button onClick={handleNext} className="btn" style={{ width: '100%' }}>
                {positionIndex < game.puzzle_positions.length - 1 ? 'Next Position' : '🎉 Finish'}
              </button>
              {positionIndex === game.puzzle_positions.length - 1 && user && (
                <button onClick={() => setShowTreeSelection(true)} className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <GitMerge size={16} />Add to Tree
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Celebration overlay ── */}
      {showFinishCelebration && (
        <div onClick={() => setShowFinishCelebration(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease', cursor: 'pointer' }}>
          <div style={{ width: 120, height: 120, backgroundColor: 'var(--accent-color)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 80px rgba(225,29,72,0.5)', animation: 'popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275)' }}>
            <Trophy size={64} color="white" />
          </div>
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.6s ease 0.2s forwards', opacity: 0 }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '2.5rem', fontFamily: 'Outfit, sans-serif' }}>Daily Game Complete!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', margin: 0 }}>
              {completedPositions.size === game.puzzle_positions.length ? 'Perfect score! Master level performance.' : completedPositions.size >= game.puzzle_positions.length * 0.7 ? `Great job! ${completedPositions.size}/${game.puzzle_positions.length} correct.` : `Finished! ${completedPositions.size}/${game.puzzle_positions.length} moves found. Keep practicing!`}
            </p>
          </div>
        </div>
      )}

      {/* ── Tree selection modal ── */}
      {showTreeSelection && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="card" style={{ maxWidth: 500, width: '100%', position: 'relative' }}>
            <button onClick={() => setShowTreeSelection(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><GitMerge size={20} />Add Puzzle to Tree</h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>Select a tree to add the puzzle moves as a new variation.</p>

            <div style={{ marginBottom: '1.5rem' }}>
              {loadingTrees ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div style={{ width: 28, height: 28, border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent-color)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>Loading your trees...</p>
                </div>
              ) : userTrees.length === 0 ? (
                <div className="card text-center" style={{ padding: '3rem 1.5rem' }}>
                  <GitMerge size={40} className="text-muted" style={{ margin: '0 auto 0.75rem' }} />
                  <h3 style={{ marginBottom: '0.5rem' }}>No opening trees yet</h3>
                  <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>Create your first tree to start mapping out your opening theory.</p>
                  <button onClick={() => setIsCreating(true)} className="btn"><Plus size={18} />Create Tree</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                  {userTrees.map(tree => (
                    <div key={tree.id} onClick={() => setSelectedTree(tree)} style={{ padding: '0.75rem 1rem', border: `2px solid ${selectedTree?.id === tree.id ? 'var(--accent-color)' : 'var(--border-color)'}`, borderRadius: 8, cursor: 'pointer', backgroundColor: selectedTree?.id === tree.id ? 'rgba(var(--accent-rgb,180,90,40),0.15)' : 'transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      onMouseEnter={e => { if (selectedTree?.id !== tree.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={e => { if (selectedTree?.id !== tree.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ width: 44, height: 44, flexShrink: 0, pointerEvents: 'none', borderRadius: 4, overflow: 'hidden' }}>
                        {(() => { const Board = Chessboard as any; return <Board options={{ position: tree.tree_data?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', boardOrientation: tree.color === 'black' ? 'black' : 'white', pieces: calientePieces, darkSquareStyle: boardStyles.darkSquareStyle, lightSquareStyle: boardStyles.lightSquareStyle, showNotation: false }} />; })()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.2rem', color: selectedTree?.id === tree.id ? 'var(--accent-color)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tree.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tree.color === 'white' ? 'White' : 'Black'} perspective</div>
                      </div>
                      {selectedTree?.id === tree.id && <Check size={18} color="var(--accent-color)" style={{ flexShrink: 0 }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {game.pgn && fullGameMoves.length > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Import moves up to:</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 700 }}>Move {Math.ceil(importMoveLimit / 2)}{importMoveLimit % 2 === 1 ? 'w' : 'b'} ({importMoveLimit} plies)</span>
                </div>
                <input type="range" min="1" max={fullGameMoves.length} value={importMoveLimit} onChange={e => setImportMoveLimit(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent-color)', cursor: 'pointer' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>Start</span><span>End ({fullGameMoves.length})</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowTreeSelection(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleTreeIntegration} disabled={!selectedTree || isIntegrating} className="btn" style={{ flex: 1 }}>{isIntegrating ? 'Adding...' : 'Add to Tree'}</button>
            </div>
          </div>
        </div>
      )}

      <CreateTreeModal isOpen={isCreating} onClose={() => setIsCreating(false)} onSubmit={handleCreate} newTitle={newTitle} setNewTitle={setNewTitle} newColor={newColor} setNewColor={setNewColor} />
    </div>
  );
}