import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { calientePieces, boardStyles } from '../lib/chessAssets';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, X, Target, Trophy, GitMerge, Plus, Check, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useMobile } from '../hooks/useMobile';
import { uciToWhiteArrow, addMovesAsVariation, parsePgnMoves } from '../utils/treeUtils';
import { useToast } from '../components/Toast';
import CreateTreeModal from '../components/CreateTreeModal';

interface PuzzlePosition {
  fen: string;
  masterMove: string;
  master_move?: string; // Support database snake_case
  moveNumber: number;
  turn: string;
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

export default function PuzzleInterface({ game: initialGame, positionIndex: initialPositionIndex, onClose, selectedDate: initialSelectedDate = new Date(), onDateChange, dateRange }: PuzzleInterfaceProps) {
  const { user } = useAuth();
  const isMobile = useMobile();
  const { success: showSuccess, info: showInfo, error: showError } = useToast();
  const gameRef = useRef(new Chess());
  const [game, setGame] = useState<DailyGame>(initialGame);
  const [positionIndex, setPositionIndex] = useState(initialPositionIndex);
  const [selectedDate, setSelectedDate] = useState<Date>(initialSelectedDate);
  const [currentPosition, setCurrentPosition] = useState<PuzzlePosition | null>(null);
  const [, setUserMove] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [boardShake, setBoardShake] = useState(false);
  const [masterMoveArrow, setMasterMoveArrow] = useState<any[]>([]);
  const [showFinishCelebration, setShowFinishCelebration] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Progress tracking state
  const [completedPositions, setCompletedPositions] = useState<Set<number>>(new Set());
  const [retryCount, setRetryCount] = useState<{ [key: number]: number }>({});
  const [dateRangeState, setDateRangeState] = useState<{ earliest: Date; latest: Date } | null>(null);

  // Engine analysis state
  const engineRef = useRef<Worker | null>(null);
  const [evalNum, setEvalNum] = useState(0);
  const [engineArrows, setEngineArrows] = useState<any[]>([]);
  const [engineBestMoveUCI, setEngineBestMoveUCI] = useState<string | null>(null);

  // Full game review state
  const [fullGameMoves, setFullGameMoves] = useState<string[]>([]);
  const [fullGameFens, setFullGameFens] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [importMoveLimit, setImportMoveLimit] = useState<number>(0);
  const replayIntervalRef = useRef<any>(null);

  // Tree integration state
  const [showTreeSelection, setShowTreeSelection] = useState(false);
  const [userTrees, setUserTrees] = useState<Tree[]>([]);
  const [loadingTrees, setLoadingTrees] = useState(false);
  const [selectedTree, setSelectedTree] = useState<Tree | null>(null);
  const [isIntegrating, setIsIntegrating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'white' | 'black'>('white');

  // Clamp latest date to today so users can't navigate to future games
  // (used inline in the next-button render below)

  useEffect(() => {
    if (game && game.puzzle_positions[positionIndex]) {
      const position = game.puzzle_positions[positionIndex];
      setCurrentPosition(position);
      gameRef.current = new Chess(position.fen);
      setStartTime(Date.now());
      setUserMove(null);
      setBoardShake(false);
      setMasterMoveArrow([]);

      // Reset engine analysis for new position
      setEvalNum(0);
      setEngineArrows([]);
      setEngineBestMoveUCI(null);
      setReviewIndex(null);

      // Auto-show result if already completed or revealed
      const isDoneLocally = (() => {
        try {
          const done = JSON.parse(localStorage.getItem(`chesstr.ee_daily_done_${game.id}`) || '[]');
          return done.includes(positionIndex);
        } catch (e) { return false; }
      })();

      const isActuallyDone = completedPositions.has(positionIndex) || isDoneLocally;
      setIsCorrect(completedPositions.has(positionIndex));

      if (isActuallyDone) {
        setShowResult(true);
        const mArrow = sanToArrow(position.fen, position.masterMove || (position as any).master_move, 'rgba(255, 255, 255, 0.9)');
        setMasterMoveArrow(mArrow ? [mArrow] : []);
      } else {
        setShowResult(false);
      }
    }
  }, [game, positionIndex, completedPositions]);

  // Pre-parse PGN for review mode when game loads
  useEffect(() => {
    if (game && game.pgn) {
      try {
        const tempGame = new Chess();
        const fens = [tempGame.fen()];
        const moves: string[] = [];

        const { moves: parsedMoves } = parsePgnMoves(game.pgn);
        for (const m of parsedMoves) {
          try {
            const result = tempGame.move(m);
            if (result) {
              moves.push(result.san);
              fens.push(tempGame.fen());
            }
          } catch (e) { }
        }
        setFullGameMoves(moves);
        setFullGameFens(fens);
        setImportMoveLimit(moves.length); // Default to full game
      } catch (e) {
        console.error('Failed to parse PGN:', e);
      }
    }
  }, [game]);

  // Initialize engine
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker('./stockfish.js');
      engineRef.current = worker;

      worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';

        if (line.startsWith('info') && line.includes('score cp')) {
          const match = line.match(/score cp (-?\d+)/);
          if (match) {
            setEvalNum(parseInt(match[1]));
          }
        }

        if (line.startsWith('bestmove')) {
          console.log('Engine best move:', line);
          const bestMoveMatch = line.match(/bestmove ([a-h][1-8][a-h][1-8][qnrb]?)/);
          if (bestMoveMatch) {
            const uci = bestMoveMatch[1];
            setEngineBestMoveUCI(uci);
            const arrow = uciToWhiteArrow(uci);
            setEngineArrows(arrow ? [{ ...arrow, key: `engine-${uci}` }] : []);
          }
        }
      };

      worker.postMessage('uci');
      worker.postMessage('ucinewgame');
      worker.postMessage('isready');
      console.log('Stockfish worker initialized');
    } catch (err) {
      console.error('Failed to initialize Stockfish worker:', err);
    }

    return () => {
      worker?.terminate();
    };
  }, []);

  // Fetch user trees when showing tree selection
  useEffect(() => {
    if (showTreeSelection && user) {
      fetchUserTrees();
    }
  }, [showTreeSelection, user]);

  // Run engine analysis when position changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    let fen = '';
    if (reviewIndex !== null && fullGameFens[reviewIndex]) {
      fen = fullGameFens[reviewIndex];
    } else if (currentPosition) {
      fen = currentPosition.fen;
    }

    if (!fen) return;

    engine.postMessage('stop');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage('go depth 12');
  }, [currentPosition, reviewIndex, fullGameFens]);

  // Fetch user progress for current game
  useEffect(() => {
    if (user && game) {
      fetchUserProgress();
    }
  }, [user, game]);

  // Fetch date range if not provided
  useEffect(() => {
    if (!dateRange) {
      fetchDateRange();
    } else {
      setDateRangeState(dateRange);
    }
  }, [dateRange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (replayIntervalRef.current) {
          clearInterval(replayIntervalRef.current);
          replayIntervalRef.current = null;
          setShowFinishCelebration(false);
        }
      }

      if (e.key === 'ArrowRight' && !showFinishCelebration) {
        if (reviewIndex !== null) {
          if (reviewIndex < fullGameFens.length - 1) {
            setReviewIndex(prev => prev! + 1);
          }
        } else if (showResult && positionIndex < game.puzzle_positions.length - 1) {
          handleNext();
        }
      } else if (e.key === 'ArrowLeft' && !showFinishCelebration) {
        if (reviewIndex !== null) {
          if (reviewIndex > 0) {
            setReviewIndex(prev => prev! - 1);
          }
        } else if (positionIndex > 0) {
          setPositionIndex(prev => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [positionIndex, reviewIndex, showResult, game, fullGameFens, showFinishCelebration]);

  const fetchUserProgress = async () => {
    if (!game) return;

    let completed = new Set<number>();

    // Check local storage first
    try {
      const localProgress = localStorage.getItem(`chesstr.ee_daily_progress_${game.id}`);
      if (localProgress) {
        completed = new Set(JSON.parse(localProgress));
      }
    } catch (e) { }

    if (user) {
      try {
        const { data, error } = await supabase
          .from('user_puzzle_attempts')
          .select('position_index, is_correct')
          .eq('user_id', user.id)
          .eq('game_id', game.id)
          .eq('is_correct', true);

        if (!error && data) {
          data.forEach(attempt => completed.add(attempt.position_index));
          // Sync merged data back to local storage
          localStorage.setItem(`chesstr.ee_daily_progress_${game.id}`, JSON.stringify(Array.from(completed)));
        }
      } catch (err) {
        console.error('Failed to fetch user progress:', err);
      }
    }

    setCompletedPositions(completed);

    // Auto-advance to first unsolved position if we're at the start
    if (positionIndex === 0 && completed.size > 0) {
      try {
        const localDone = JSON.parse(localStorage.getItem(`chesstr.ee_daily_done_${game.id}`) || '[]');
        const allDone = new Set([...Array.from(completed), ...localDone]);

        let firstUnsolved = 0;
        while (firstUnsolved < game.puzzle_positions.length && allDone.has(firstUnsolved)) {
          firstUnsolved++;
        }

        if (firstUnsolved < game.puzzle_positions.length && firstUnsolved !== positionIndex) {
          setPositionIndex(firstUnsolved);
        }
      } catch (e) { }
    }
  };

  const fetchDateRange = async () => {
    try {
      // Get min and max dates directly from the table
      const { data, error } = await supabase
        .from('daily_master_games')
        .select('date')
        .order('date', { ascending: true })
        .limit(1);

      const { data: maxData, error: maxError } = await supabase
        .from('daily_master_games')
        .select('date')
        .order('date', { ascending: false })
        .limit(1);

      if (error || maxError) throw error || maxError;

      if (data?.[0] && maxData?.[0]) {
        setDateRangeState({
          earliest: new Date(data[0].date),
          latest: new Date(maxData[0].date)
        });
      }
    } catch (err) {
      console.error('Failed to fetch date range:', err);
    }
  };

  const fetchGameForDate = async (newDate: Date) => {
    setSelectedDate(newDate);
    if (onDateChange) onDateChange(newDate);

    try {
      const targetDate = newDate.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_master_games')
        .select('*')
        .eq('date', targetDate)
        .maybeSingle();

      if (error || !data) {
        showError('No game available for this date');
      } else {
        setGame(data);
        setPositionIndex(0);
      }
    } catch (err) {
      showError('Failed to load daily game');
    }
  };

  const handleDateChange = (direction: 'prev' | 'next') => {
    if (!dateRangeState) return;

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const clampedLatest = new Date(Math.min(dateRangeState.latest.getTime(), today.getTime()));

    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }

    // Validate date is within range (clamped to today)
    if (newDate >= dateRangeState.earliest && newDate <= clampedLatest) {
      fetchGameForDate(newDate);
    } else if (direction === 'next' && newDate > clampedLatest) {
      showError('No future puzzles available yet');
    } else if (direction === 'prev' && newDate < dateRangeState.earliest) {
      showError('No older puzzles available');
    }
  };


  const handleCreate = async () => {
    if (!newTitle.trim()) return;

    try {
      const { data, error } = await supabase
        .from('trees')
        .insert({
          title: newTitle,
          description: '',
          color: newColor,
          user_id: user!.id,
          is_public: false,
          tree_data: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', children: [] },
          stars: 0,
          node_count: 1
        })
        .select()
        .single();

      if (error) throw error;

      showSuccess('Tree created successfully!');
      setIsCreating(false);
      setNewTitle('');
      setNewColor('white');

      // Refresh trees and select the newly created one
      await fetchUserTrees();
      if (data) {
        setSelectedTree(data);
      }
    } catch (err) {
      console.error('Failed to create tree:', err);
      showError('Failed to create tree');
    }
  };

  const fetchUserTrees = async () => {
    setLoadingTrees(true);
    try {
      const { data, error } = await supabase
        .from('trees')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Tree fetch error:', error);
        throw error;
      }

      setUserTrees(data || []);
    } catch (err) {
      console.error('Failed to fetch trees:', err);
    } finally {
      setLoadingTrees(false);
    }
  };

  const handleTreeIntegration = async () => {
    if (!selectedTree || !game) return;

    setIsIntegrating(true);
    try {
      // Get the current tree data
      const { data: treeDataRes, error: fetchError } = await supabase
        .from('trees')
        .select('tree_data')
        .eq('id', selectedTree.id)
        .single();

      if (fetchError) throw fetchError;

      // Create moves array from the game
      let movesToAdd: string[] = [];

      if (game.pgn) {
        // Use full PGN moves if available (similar to Lichess import)
        const { moves } = parsePgnMoves(game.pgn);
        // Apply user-specified limit
        movesToAdd = moves.slice(0, importMoveLimit > 0 ? importMoveLimit : moves.length);
      } else {
        // Fallback to just the puzzle positions
        const tempGame = new Chess();
        for (const position of game.puzzle_positions) {
          let targetMove: string | undefined;
          try {
            targetMove = position.masterMove || (position as any).master_move;
            if (!targetMove) continue;

            const move = tempGame.move(targetMove);
            if (move) {
              movesToAdd.push(move.san);
            }
          } catch (e) {
            console.error('Failed to add master move:', targetMove);
            break;
          }
        }
      }

      if (movesToAdd.length === 0) {
        showError('No valid moves found in puzzle');
        return;
      }

      // Add moves to tree as variation
      const updatedTree = addMovesAsVariation(treeDataRes.tree_data, movesToAdd);

      // Save updated tree
      const { error: saveError } = await supabase
        .from('trees')
        .update({
          tree_data: updatedTree,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTree.id);

      if (saveError) throw saveError;

      showSuccess(`Added ${movesToAdd.length} moves to "${selectedTree.title}"`);
      setShowTreeSelection(false);
      setSelectedTree(null);
    } catch (err) {
      console.error('Failed to integrate moves:', err);
      showError('Failed to add moves to tree');
    } finally {
      setIsIntegrating(false);
    }
  };

  // Convert a SAN move at the current position into a UCI-style arrow
  const sanToArrow = (fen: string, san: string, color: string) => {
    try {
      const tempGame = new Chess(fen);
      const moveObj = tempGame.move(san);
      if (!moveObj) return null;
      return { startSquare: moveObj.from, endSquare: moveObj.to, color };
    } catch {
      return null;
    }
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
    if (showResult || !currentPosition) return false;

    // Use a copy for validation to avoid mutating the ref prematurely
    const currentFen = gameRef.current.fen();
    const validationGame = new Chess(currentFen);

    console.log(`[Puzzle] Validating move ${sourceSquare}-${targetSquare} on FEN: ${currentFen}`);

    try {
      const moveObj = validationGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });

      if (!moveObj) {
        console.warn('[Puzzle] Move rejected by chess.js (illegal)');
        return false;
      }

      const userMoveSan = moveObj.san;
      const userMoveUCI = moveObj.from + moveObj.to + (moveObj.promotion || '');
      const masterMove = currentPosition?.masterMove || currentPosition?.master_move;

      if (!masterMove) {
        console.error('[Puzzle] Error: masterMove is missing! Keys:', Object.keys(currentPosition));
        return false;
      }

      const isMasterMove = userMoveSan === masterMove;
      const isEngineMove = !!(engineBestMoveUCI && userMoveUCI === engineBestMoveUCI);
      const correct = !!(isMasterMove || isEngineMove);

      console.log(`[Puzzle] User: ${userMoveSan} (${userMoveUCI}), Game: ${masterMove}, Engine: ${engineBestMoveUCI}, Correct: ${correct}`);

      if (correct) {
        // Commit the move to the main game ref
        gameRef.current = validationGame;
        setUserMove(userMoveSan);
        setIsCorrect(true);
        setShowResult(true);
        showSuccess('Correct! ✓');

        // Build master move arrow (green)
        const mArrow = masterMove ? sanToArrow(currentPosition.fen, masterMove, 'rgba(255, 255, 255, 0.9)') : null;
        setMasterMoveArrow(mArrow ? [mArrow] : []);

        // Save progress
        const localProgressKey = `chesstr.ee_daily_progress_${game.id}`;
        setCompletedPositions(prev => {
          const newCompleted = new Set([...prev, positionIndex]);
          localStorage.setItem(localProgressKey, JSON.stringify(Array.from(newCompleted)));
          return newCompleted;
        });
      } else {
        const currentRetries = retryCount[positionIndex] || 0;
        const newRetries = currentRetries + 1;
        setRetryCount(prev => ({ ...prev, [positionIndex]: newRetries }));

        if (newRetries >= 2) {
          // Second mistake - Reveal the answer
          const masterMove = currentPosition.masterMove || currentPosition.master_move;
          if (masterMove) {
            const masterGame = new Chess(currentPosition.fen);
            try {
              masterGame.move(masterMove);
              gameRef.current = masterGame; // Set board to master move state
            } catch (e) {
              console.error('[Puzzle] Failed to execute move:', masterMove, e);
            }
          }

          const mArrow = masterMove ? sanToArrow(currentPosition.fen, masterMove, 'rgba(255, 255, 255, 0.9)') : null;
          setMasterMoveArrow(mArrow ? [mArrow] : []);
          setIsCorrect(false);
          setShowResult(true);
          showInfo(`The move was ${masterMove || 'Unknown'}`);

          // Mark as done for dashboard
          const localDoneKey = `chesstr.ee_daily_done_${game.id}`;
          try {
            const done = JSON.parse(localStorage.getItem(localDoneKey) || '[]');
            if (!done.includes(positionIndex)) {
              localStorage.setItem(localDoneKey, JSON.stringify([...done, positionIndex]));
            }
          } catch (e) { }

          // Record attempt
          recordAttempt(userMoveSan, correct);

          // Return false so the WRONG piece snaps back, then the board re-renders with the master move
          return false;
        } else {
          // First mistake - Shake and snap back
          setBoardShake(true);
          showInfo('Not quite — try again!');
          setTimeout(() => setBoardShake(false), 600);

          // Record attempt
          recordAttempt(userMoveSan, correct);

          return false; // Snap piece back
        }
      }

      // Record attempt
      recordAttempt(userMoveSan, correct);
      return true;
    } catch (err) {
      console.error('Move validation error:', err);
      return false;
    }
  };

  const recordAttempt = async (userMoveSan: string, correct: boolean) => {
    if (!user || !currentPosition) return;

    const timeTaken = Math.floor((Date.now() - startTime) / 1000);

    try {
      await supabase.from('user_puzzle_attempts').insert({
        user_id: user.id,
        game_id: game.id,
        position_index: positionIndex,
        fen: currentPosition.fen,
        user_move: userMoveSan,
        master_move: currentPosition.masterMove || currentPosition.master_move,
        is_correct: correct,
        time_taken: timeTaken
      });
    } catch (error) {
      console.error('Error recording attempt:', error);
    }
  };


  const handleNext = () => {
    if (positionIndex < game.puzzle_positions.length - 1) {
      setPositionIndex(positionIndex + 1);
    } else {
      // Start celebration and auto-replay of the WHOLE game
      setShowFinishCelebration(true);

      // Auto-replay animation: Start from move 0 of the entire game
      setTimeout(() => {
        setReviewIndex(0);
        let currentStep = 0;
        const totalMoves = fullGameFens.length - 1;
        
        if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        
        replayIntervalRef.current = setInterval(() => {
          currentStep++;
          setReviewIndex(currentStep);
          if (currentStep >= totalMoves) {
            clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
            setTimeout(() => setShowFinishCelebration(false), 1000);
          }
        }, 500); // Slightly faster replay for whole game
      }, 1500);
    }
  };

  if (!currentPosition) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.9)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 24,
            height: 24,
            border: '3px solid var(--border-color)',
            borderTop: '3px solid var(--accent-color)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem auto'
          }} />
          <p>Loading position...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.95)',
      zIndex: 9999,
      display: 'flex',
      alignItems: isMobile ? 'flex-start' : 'center',
      justifyContent: isMobile ? 'flex-start' : 'center',
      padding: '1rem',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '1200px',
        width: '100%',
        display: isMobile ? 'block' : 'flex',
        gap: isMobile ? '1rem' : '2rem',
        alignItems: 'flex-start',
        padding: isMobile ? '0rem' : '2rem',
      }}>
        {/* Chess Board */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div className="chess-board-container" style={{ display: 'flex', width: '100%', flexDirection: isMobile ? 'column-reverse' : 'row', alignItems: 'center', overflow: 'hidden' }}>
            {/* Eval Bar Container */}
            <div
              className="eval-bar-wrapper"
              style={{
                width: isMobile ? '100%' : '2%',
                height: isMobile ? '12px' : 'auto',
                marginLeft: isMobile ? '0' : '0.5rem',
                marginBottom: isMobile ? '0.5rem' : '0rem'
              }}
            >
              <div
                className="eval-bar-bg"
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'row' : 'column',
                  justifyContent: 'flex-start',
                  height: '100%',
                  width: '100%',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}
              >
                <div
                  className="eval-bar-fill"
                  style={{
                    height: isMobile ? '100%' : `${50 + (evalNum / 100) * 50}%`,
                    width: isMobile ? `${50 + (evalNum / 100) * 50}%` : '100%',
                    backgroundColor: 'white',
                    transition: 'all 0.4s ease'
                  }}
                />
              </div>
            </div>

            {/* Board */}
            <div
              style={{ flex: 1, width: '100%', maxWidth: '100vw' }}
              className={boardShake ? 'board-shake' : ''}
            >
              {(() => {
                const Board = Chessboard as any;
                // After result: show green master move arrow + yellow engine arrow separately
                const arrows = reviewIndex !== null
                  ? [] // No arrows during full game review
                  : showResult
                    ? [
                      ...masterMoveArrow,
                      ...engineArrows.map((a: any) => ({ ...a, color: 'rgba(250, 21, 21, 0.85)' }))
                    ]
                    : [];
                return <Board
                  options={{
                    position: reviewIndex !== null ? fullGameFens[reviewIndex] : gameRef.current.fen(),
                    onPieceDrop: (reviewIndex !== null || showResult) ? undefined : onPieceDrop,
                    boardOrientation: (() => {
                      const base = currentPosition?.turn === 'black' ? 'black' : 'white';
                      if (!isFlipped) return base;
                      return base === 'white' ? 'black' : 'white';
                    })(),
                    pieces: calientePieces,
                    darkSquareStyle: boardStyles.darkSquareStyle,
                    lightSquareStyle: boardStyles.lightSquareStyle,
                    boardStyle: {
                      ...boardStyles.boardStyle,
                      borderRadius: '4px',
                      boxShadow: showResult
                        ? isCorrect
                          ? '0 0 0 3px rgba(255, 255, 255, 0.5), 0 8px 30px rgba(0,0,0,0.5)'
                          : '0 0 0 3px rgba(239,68,68,0.4), 0 8px 30px rgba(0,0,0,0.5)'
                        : '0 8px 30px rgba(0,0,0,0.5)'
                    },
                    showNotation: false,
                    arrows
                  }}
                />;
              })()}
            </div>
          </div>

          {/* Board Controls */}

        </div>

        {/* Puzzle Info Panel */}
        <div style={{
          width: isMobile ? '100%' : '350px',
          backgroundColor: 'var(--panel-bg)',
          borderRadius: '12px',
          padding: isMobile ? '1rem' : '1.5rem',
          border: '1px solid var(--border-color)'
        }}>
          {/* Game Info */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', position: 'relative' }}>
              <button
                onClick={onClose}
                className="btn btn-secondary"
                style={{
                  padding: '0.25rem 0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  position: 'absolute',
                  left: 0,
                  zIndex: 1
                }}
              >
                <ArrowLeft size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
                <Trophy size={20} color="var(--accent-color)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Daily Game</h3>
              </div>
            </div>

            {/* Date Navigation */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  onClick={() => handleDateChange('prev')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: !dateRangeState || selectedDate <= dateRangeState.earliest ? 'default' : 'pointer',
                    color: !dateRangeState || selectedDate <= dateRangeState.earliest ? 'rgba(255,255,255,0.2)' : 'var(--text-muted)'
                  }}
                  disabled={!dateRangeState || selectedDate <= dateRangeState.earliest}
                  onMouseEnter={(e) => { if (dateRangeState && selectedDate > dateRangeState.earliest) e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={(e) => { if (dateRangeState && selectedDate > dateRangeState.earliest) e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <ChevronLeft size={18} />
                </button>

                <div style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  fontWeight: '500'
                }}>
                  {selectedDate.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>

                <div style={{ width: '26px', display: 'flex', justifyContent: 'center' }}>
                  {/* Only show next button if there's a previous day to navigate to (never allow future dates) */}
                  {(() => {
                    const today = new Date();
                    today.setHours(23, 59, 59, 999);
                    const isAtOrPastToday = selectedDate >= today;
                    return !isAtOrPastToday && (
                      <button
                        onClick={() => handleDateChange('next')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          color: 'var(--text-muted)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <ChevronRight size={18} />
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* {selectedDate.toDateString() !== new Date().toDateString() && (
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={handleTodayClick}
                    className="btn btn-secondary"
                    style={{ 
                      fontSize: '0.8rem',
                      padding: '0.25rem 0.5rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <Calendar size={14} />
                    Today
                  </button>
                </div>
              )} */}
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '3px', width: '100%', marginBottom: '0.75rem' }}>
                {game.puzzle_positions.map((_, index) => {
                  const isCompleted = completedPositions.has(index);
                  const isRevealed = (() => {
                    try {
                      const done = JSON.parse(localStorage.getItem(`chesstr.ee_daily_done_${game.id}`) || '[]');
                      return done.includes(index);
                    } catch (e) { return false; }
                  })();

                  return (
                    <div
                      key={index}
                      onClick={() => setPositionIndex(index)}
                      style={{
                        flex: 1,
                        height: '6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        backgroundColor: isCompleted
                          ? 'rgba(255, 255, 255, 1)'
                          : isRevealed
                            ? 'rgba(239, 68, 68, 0.5)'
                            : index === positionIndex
                              ? 'var(--accent-color)'
                              : 'rgba(255,255,255,0.15)',
                        boxShadow: index === positionIndex ? '0 0 8px var(--accent-color)' : 'none'
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: '#ffffff',
                  border: '2px solid var(--border-color)',
                  borderRadius: '4px'
                }} />
                <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {game.white_player.length > 12 ? `${game.white_player.substring(0, 12)}...` : game.white_player}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: '500' }}>{game.white_rating}</div>
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: '#333333',
                  border: '2px solid var(--border-color)',
                  borderRadius: '4px'
                }} />
                <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {game.black_player.length > 12 ? `${game.black_player.substring(0, 12)}...` : game.black_player}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: '500' }}>{game.black_rating}</div>
              </div>
            </div>
            {game.opening_name && (
              <div style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-color)',
                fontStyle: 'italic'
              }}>
                {game.opening_name}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Target size={18} color="var(--accent-color)" />
                <div style={{
                  fontSize: '0.8rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  backgroundColor: currentPosition.turn === 'white' ? '#fff' : '#333',
                  color: currentPosition.turn === 'white' ? '#333' : '#fff',
                  fontWeight: 600,
                  border: '1px solid var(--border-color)'
                }}>
                  {reviewIndex !== null
                    ? (reviewIndex === 0
                      ? 'Start'
                      : `${Math.ceil(reviewIndex / 2)}. ${reviewIndex % 2 === 1 ? fullGameMoves[reviewIndex - 1] : '...' + fullGameMoves[reviewIndex - 1]}`)
                    : `${currentPosition.turn === 'white' ? 'White' : 'Black'} to move`
                  }
                </div> </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {reviewIndex !== null && (
                  <button 
                    onClick={() => setIsFlipped(!isFlipped)}
                    title="Flip Board"
                    style={{
                      background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-muted)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: '0.5rem'
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (replayIntervalRef.current) {
                      clearInterval(replayIntervalRef.current);
                      replayIntervalRef.current = null;
                      setShowFinishCelebration(false);
                    }
                    if (reviewIndex !== null) {
                      if (reviewIndex > 0) setReviewIndex(prev => prev! - 1);
                    } else if (positionIndex > 0) {
                      setPositionIndex(prev => prev - 1);
                    }
                  }}
                  disabled={reviewIndex !== null ? reviewIndex === 0 : positionIndex === 0}
                  style={{
                    background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-muted)',
                    cursor: (reviewIndex !== null ? reviewIndex === 0 : positionIndex === 0) ? 'default' : 'pointer',
                    opacity: (reviewIndex !== null ? reviewIndex === 0 : positionIndex === 0) ? 0.3 : 1,
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  <ChevronLeft size={18} />
                </button>
                {reviewIndex === null && (
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: '2.5rem', textAlign: 'center' }}>
                    {positionIndex + 1}/{game.puzzle_positions.length}
                  </span>
                )}
                <button 
                  onClick={() => {
                    if (replayIntervalRef.current) {
                      clearInterval(replayIntervalRef.current);
                      replayIntervalRef.current = null;
                      setShowFinishCelebration(false);
                    }
                    if (reviewIndex !== null) {
                      if (reviewIndex < fullGameFens.length - 1) setReviewIndex(prev => prev! + 1);
                    } else if (showResult && positionIndex < game.puzzle_positions.length - 1) {
                      handleNext();
                    }
                  }}
                  disabled={reviewIndex !== null ? reviewIndex >= fullGameFens.length - 1 : (!showResult || positionIndex >= game.puzzle_positions.length - 1)}
                  style={{
                    background: 'none', border: 'none', padding: '0.25rem', color: 'var(--text-muted)',
                    cursor: (reviewIndex !== null ? reviewIndex >= fullGameFens.length - 1 : (!showResult || positionIndex >= game.puzzle_positions.length - 1)) ? 'default' : 'pointer',
                    opacity: (reviewIndex !== null ? reviewIndex >= fullGameFens.length - 1 : (!showResult || positionIndex >= game.puzzle_positions.length - 1)) ? 0.3 : 1,
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {!showResult && (
              <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                What move was played in this game?
              </div>
            )}

            {/* Result feedback card */}
            {showResult && reviewIndex === null && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                backgroundColor: isCorrect ? 'rgba(197, 34, 34, 0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${isCorrect ? 'rgba(255, 172, 172, 0.4)' : 'rgba(239,68,68,0.35)'}`,
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: isCorrect ? 0 : '0.5rem' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    backgroundColor: isCorrect ? 'rgba(255, 207, 207, 0.8)' : 'rgba(239,68,68,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {isCorrect
                      ? <Check size={14} color="white" />
                      : <X size={14} color="white" />
                    }
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem', color: isCorrect ? 'rgba(255, 226, 226, 1)' : 'rgb(239,68,68)' }}>
                    {isCorrect ? 'Correct!' : 'Revealed'}
                  </span>
                </div>
                {!isCorrect && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingLeft: '2rem' }}>
                    Master move: <span style={{ color: 'rgba(255, 236, 236, 1)', fontWeight: 600 }}>{currentPosition.masterMove || (currentPosition as any).master_move}</span>
                  </div>
                )}
              </div>
            )}

            {/* PGN Code Block in Review Mode */}
            {reviewIndex !== null && game.pgn && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <GitMerge size={14} />
                  <span>Full Game PGN</span>
                </div>
                <div style={{ 
                  backgroundColor: 'rgba(0,0,0,0.3)', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  fontSize: '0.8rem', 
                  fontFamily: 'monospace', 
                  lineHeight: '1.5',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  whiteSpace: 'pre-wrap'
                }}>
                  {game.pgn.split('\n\n')[1] || game.pgn}
                </div>
              </div>
            )}

            {/* Arrow legend shown after result */}
            {showResult && engineArrows.length > 0 && reviewIndex === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.85)' }} />
                  <span>Game Move</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: 'rgba(250, 21, 21, 0.85)' }} />
                  <span>Engine best move</span>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          {showResult && (
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button
                onClick={handleNext}
                className="btn"
                style={{ width: '100%' }}
              >
                {positionIndex < game.puzzle_positions.length - 1 ? 'Next Position' : '🎉 Finish'}
              </button>

              {positionIndex === game.puzzle_positions.length - 1 && user && (
                <button
                  onClick={() => setShowTreeSelection(true)}
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <GitMerge size={16} />
                  Add to Tree
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Finish Celebration Overlay */}
      {showFinishCelebration && (
        <div 
          onClick={() => setShowFinishCelebration(false)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '1.5rem',
            animation: 'fadeIn 0.3s ease',
            cursor: 'pointer'
          }}
        >
          <div style={{
            width: 120, height: 120,
            backgroundColor: 'var(--accent-color)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 80px rgba(225, 29, 72, 0.5)',
            animation: 'popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275)'
          }}>
            <Trophy size={64} color="white" />
          </div>
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.6s ease 0.2s forwards', opacity: 0 }}>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontFamily: 'Outfit, sans-serif' }}>Daily Game Complete!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', margin: 0 }}>
              {(() => {
                const total = game.puzzle_positions.length;
                const correct = completedPositions.size;
                if (correct === total) return 'Perfect score! Master level performance.';
                if (correct >= total * 0.7) return `Great job! ${correct}/${total} correct.`;
                return `Finished! ${correct}/${total} moves found. Keep practicing!`;
              })()}
            </p>
          </div>
        </div>
      )}

      {/* Tree Selection Modal */}
      {showTreeSelection && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', position: 'relative' }}>
            <button
              onClick={() => setShowTreeSelection(false)}
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'var(--text-muted)' }}
            >
              <X size={24} />
            </button>

            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitMerge size={20} />
              Add Puzzle to Tree
            </h3>

            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
              Select a tree to add the puzzle moves as a new variation.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              {loadingTrees ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    border: '3px solid var(--border-color)',
                    borderTop: '3px solid var(--accent-color)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 1rem auto'
                  }} />
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>Loading your trees...</p>
                </div>
              ) : userTrees.length === 0 ? (
                <div className="card text-center" style={{ padding: '3rem 1.5rem' }}>
                  <GitMerge size={40} className="text-muted" style={{ margin: '0 auto 0.75rem auto' }} />
                  <h3 style={{ marginBottom: '0.5rem' }}>No opening trees yet</h3>
                  <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>Create your first tree to start mapping out your opening theory.</p>
                  <button onClick={() => setIsCreating(true)} className="btn">
                    <Plus size={18} />
                    Create Tree
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
                  {userTrees.map((tree) => (
                    <div
                      key={tree.id}
                      onClick={() => setSelectedTree(tree)}
                      style={{
                        padding: '0.75rem 1rem',
                        border: `2px solid ${selectedTree?.id === tree.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: selectedTree?.id === tree.id ? 'rgba(var(--accent-rgb, 180, 90, 40), 0.15)' : 'transparent',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                      onMouseEnter={(e) => { if (selectedTree?.id !== tree.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={(e) => { if (selectedTree?.id !== tree.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ width: '44px', height: '44px', flexShrink: 0, pointerEvents: 'none', borderRadius: '4px', overflow: 'hidden' }}>
                        {(() => {
                          const Board = Chessboard as any;
                          return <Board
                            options={{
                              position: tree.tree_data?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                              boardOrientation: tree.color === 'black' ? 'black' : 'white',
                              pieces: calientePieces,
                              darkSquareStyle: boardStyles.darkSquareStyle,
                              lightSquareStyle: boardStyles.lightSquareStyle,
                              showNotation: false
                            }}
                          />;
                        })()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: '600',
                          marginBottom: '0.2rem',
                          color: selectedTree?.id === tree.id ? 'var(--accent-color)' : 'var(--text-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>{tree.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {tree.color === 'white' ? 'White' : 'Black'} perspective
                        </div>
                      </div>
                      {selectedTree?.id === tree.id && (
                        <Check size={18} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Move Limit Selector */}
            {game.pgn && fullGameMoves.length > 0 && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Import moves up to:</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 700 }}>
                    Move {Math.ceil(importMoveLimit / 2)}{importMoveLimit % 2 === 1 ? 'w' : 'b'} ({importMoveLimit} plies)
                  </span>
                </div>
                <input 
                  type="range"
                  min="1"
                  max={fullGameMoves.length}
                  value={importMoveLimit}
                  onChange={(e) => setImportMoveLimit(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>Start</span>
                  <span>End of Game ({fullGameMoves.length})</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowTreeSelection(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleTreeIntegration}
                disabled={!selectedTree || isIntegrating}
                className="btn"
                style={{ flex: 1 }}
              >
                {isIntegrating ? 'Adding...' : 'Add to Tree'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Tree Modal */}
      <CreateTreeModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onSubmit={handleCreate}
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newColor={newColor}
        setNewColor={setNewColor}
      />

    </div>
  )
}
