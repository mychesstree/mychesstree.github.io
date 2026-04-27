import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { calientePieces, boardStyles } from '../lib/chessAssets';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, X, Target, Trophy, GitMerge, Plus, Check, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useMobile } from '../hooks/useMobile';
import { uciToWhiteArrow, addMovesAsVariation } from '../utils/treeUtils';
import { useToast } from '../components/Toast';
import CreateTreeModal from '../components/CreateTreeModal';

interface PuzzlePosition {
  fen: string;
  masterMove: string;
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
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Progress tracking state
  const [completedPositions, setCompletedPositions] = useState<Set<number>>(new Set());
  const [retryCount, setRetryCount] = useState<{ [key: number]: number }>({});
  const [showHint, setShowHint] = useState(false);
  const [dateRangeState, setDateRangeState] = useState<{ earliest: Date; latest: Date } | null>(null);

  // Engine analysis state
  const engineRef = useRef<Worker | null>(null);
  const [evalNum, setEvalNum] = useState(0);
  const [engineArrows, setEngineArrows] = useState<any[]>([]);

  // Tree integration state
  const [showTreeSelection, setShowTreeSelection] = useState(false);
  const [userTrees, setUserTrees] = useState<Tree[]>([]);
  const [selectedTree, setSelectedTree] = useState<Tree | null>(null);
  const [isIntegrating, setIsIntegrating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'white' | 'black'>('white');

  useEffect(() => {
    if (game && game.puzzle_positions[positionIndex]) {
      const position = game.puzzle_positions[positionIndex];
      setCurrentPosition(position);
      gameRef.current = new Chess(position.fen);
      setStartTime(Date.now());
      setUserMove(null);
      setShowResult(false);
      setShowHint(false);

      // Reset engine analysis for new position
      setEvalNum(0);
      setEngineArrows([]);
    }
  }, [game, positionIndex]);

  // Initialize engine
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker('/stockfish.js');
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
          const bestMoveMatch = line.match(/bestmove ([a-h][1-8][a-h][1-8][qnrb]?)/);
          if (bestMoveMatch) {
            const arrow = uciToWhiteArrow(bestMoveMatch[1]);
            setEngineArrows(arrow ? [{ ...arrow, key: `engine-${bestMoveMatch[1]}` }] : []);
          }
        }
      };

      worker.postMessage('uci');
      worker.postMessage('isready');
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
    if (!engine || !currentPosition) return;

    engine.postMessage('stop');
    engine.postMessage(`position fen ${currentPosition.fen}`);
    engine.postMessage('go depth 12');
  }, [currentPosition]);

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

  const fetchUserProgress = async () => {
    if (!game) return;

    let completed = new Set<number>();
    
    // Check local storage first
    try {
      const localProgress = localStorage.getItem(`chesstr.ee_daily_progress_${game.id}`);
      if (localProgress) {
        completed = new Set(JSON.parse(localProgress));
      }
    } catch (e) {}

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

    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }

    // Validate date is within range
    if (newDate >= dateRangeState.earliest && newDate <= dateRangeState.latest) {
      fetchGameForDate(newDate);
    } else if (direction === 'next' && newDate > dateRangeState.latest) {
      showError('No future puzzles available yet');
    } else if (direction === 'prev' && newDate < dateRangeState.earliest) {
      showError('No older puzzles available');
    }
  };

  const getHintText = () => {
    if (!currentPosition) return '';
    const move = currentPosition.masterMove;

    // Provide hint based on move type
    if (move.includes('x')) {
      return 'Hint: Look for a capture!';
    } else if (move.includes('+')) {
      return 'Hint: Consider a check!';
    } else if (move.includes('O-O')) {
      return 'Hint: Think about castling!';
    } else if (move.match(/[KQRBN][a-h1-8]/)) {
      return 'Hint: A piece move might be best!';
    } else {
      return 'Hint: Sometimes the quietest moves are strongest!';
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
    try {
      console.log('Fetching trees for user:', user!.id);
      const { data, error } = await supabase
        .from('trees')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_daily_game', false)
        .order('updated_at', { ascending: false });

      console.log('Tree fetch result:', { data, error });

      if (error) {
        console.error('Tree fetch error:', error);
        throw error;
      }

      console.log('Setting userTrees:', data || []);
      setUserTrees(data || []);
    } catch (err) {
      console.error('Failed to fetch trees:', err);
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

      // Create moves array from the game (all puzzle positions)
      const puzzleMoves: string[] = [];
      const tempGame = new Chess();

      // Add moves to reach the first puzzle position
      for (const position of game.puzzle_positions) {
        try {
          const move = tempGame.move(position.masterMove);
          if (move) {
            puzzleMoves.push(move.san);
          }
        } catch (e) {
          console.error('Failed to add master move:', position.masterMove);
          break;
        }
      }

      if (puzzleMoves.length === 0) {
        showError('No valid moves found in puzzle');
        return;
      }

      // Add moves to tree as variation
      const updatedTree = addMovesAsVariation(treeDataRes.tree_data, puzzleMoves);

      // Save updated tree
      const { error: saveError } = await supabase
        .from('trees')
        .update({
          tree_data: updatedTree,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTree.id);

      if (saveError) throw saveError;

      showSuccess(`Added ${puzzleMoves.length} moves to "${selectedTree.title}"`);
      setShowTreeSelection(false);
      setSelectedTree(null);
    } catch (err) {
      console.error('Failed to integrate moves:', err);
      showError('Failed to add moves to tree');
    } finally {
      setIsIntegrating(false);
    }
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
    if (showResult || !currentPosition) return false;

    const chessGame = gameRef.current;
    const prevFen = chessGame.fen();

    try {
      const moveObj = chessGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });

      if (!moveObj) {
        gameRef.current = new Chess(prevFen);
        return false;
      }

      const userMoveSan = moveObj.san;
      setUserMove(userMoveSan);

      // Check if move matches master move
      const correct = userMoveSan === currentPosition.masterMove;

      if (correct) {
        setShowResult(true);
        showSuccess('Correct');
        // Add to completed positions
        setCompletedPositions(prev => {
          const newCompleted = new Set([...prev, positionIndex]);
          const localProgressKey = `chesstr.ee_daily_progress_${game.id}`;
          localStorage.setItem(localProgressKey, JSON.stringify(Array.from(newCompleted)));
          return newCompleted;
        });
      } else {
        // Increment retry count
        const currentRetries = retryCount[positionIndex] || 0;
        const newRetries = currentRetries + 1;
        setRetryCount(prev => ({ ...prev, [positionIndex]: newRetries }));

        // Show hint after 2 incorrect attempts
        if (newRetries >= 2) {
          setShowHint(true);
          showInfo(getHintText());
        } else {
          showInfo('Good try!');
        }

        setShowResult(true);
      }

      // Record attempt
      recordAttempt(userMoveSan, correct);

      return true;
    } catch {
      gameRef.current = new Chess(prevFen);
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
        master_move: currentPosition.masterMove,
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
      onClose();
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
            <div style={{ flex: 1, width: '100%', maxWidth: '100vw' }}>
              {(() => {
                const Board = Chessboard as any;
                return <Board
                  options={{
                    position: gameRef.current.fen(),
                    onPieceDrop: onPieceDrop,
                    boardOrientation: currentPosition?.turn === 'black' ? 'black' : 'white',
                    pieces: calientePieces,
                    darkSquareStyle: boardStyles.darkSquareStyle,
                    lightSquareStyle: boardStyles.lightSquareStyle,
                    boardStyle: {
                      ...boardStyles.boardStyle,
                      borderRadius: '4px',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                    },
                    showNotation: false,
                    arrows: showResult ? engineArrows : []
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
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Daily Master Game</h3>
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
                  {(!dateRangeState || selectedDate < dateRangeState.latest) && (
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
                  )}
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

              {/* Progress indicators */}
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
                {game.puzzle_positions.map((_, index) => (
                  <div
                    key={index}
                    style={{
                      flex: 1,
                      height: '6px',
                      borderRadius: '3px',
                      backgroundColor: completedPositions.has(index)
                        ? 'var(--accent-color)'
                        : index === positionIndex
                          ? 'var(--border-color)'
                          : 'var(--panel-bg)',
                      border: '1px solid var(--border-color)'
                    }}
                    title={`Position ${index + 1}${completedPositions.has(index) ? ' (Completed)' : ''}`}
                  />
                ))}
              </div>

              {/* Position checkmarks */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {game.puzzle_positions.map((_, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {completedPositions.has(index) && <Check size={12} color="var(--accent-color)" />}
                  </div>
                ))}
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

          {/* Position Info */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Target size={18} color="var(--accent-color)" />
              <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Move {currentPosition.moveNumber}</h4>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                {positionIndex + 1}/{game.puzzle_positions.length}
              </span>
            </div>

            <div style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
              <div className="text-muted">
                What move was played in this game?
              </div>

              {/* Retry counter and hint */}
              {(retryCount[positionIndex] > 0 || showHint) && (
                <div style={{ marginTop: '1rem' }}>
                  {retryCount[positionIndex] > 0 && (
                    <div style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.5rem'
                    }}>
                      Attempts: {retryCount[positionIndex]}
                    </div>
                  )}

                  {showHint && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      backgroundColor: 'var(--panel-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <Lightbulb size={16} color="var(--accent-color)" />
                      {getHintText()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          {showResult && (
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button
                onClick={handleNext}
                className="btn"
                style={{ width: '100%' }}
              >
                {positionIndex < game.puzzle_positions.length - 1 ? 'Next Position' : 'Finish'}
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
              {(() => {
                console.log('Rendering tree selection, userTrees.length:', userTrees.length);
                console.log('userTrees:', userTrees);
                return userTrees.length === 0 ? (
                  <div className="card text-center" style={{ padding: '4rem 2rem' }}>
                    <GitMerge size={48} className="text-muted" style={{ margin: '0 auto 1rem auto' }} />
                    <h3>No opening trees yet</h3>
                    <p className="text-muted mb-4">Create your first tree to start mapping out your theory.</p>
                    <button onClick={() => setIsCreating(true)} className="btn">
                      <Plus size={18} />
                      Create Tree
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {userTrees.map((tree) => (
                      <div
                        key={tree.id}
                        onClick={() => setSelectedTree(tree)}
                        style={{
                          padding: '1rem',
                          border: `2px solid ${selectedTree?.id === tree.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: selectedTree?.id === tree.id ? 'var(--accent-color)' : 'transparent',
                          color: selectedTree?.id === tree.id ? 'white' : 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem'
                        }}
                      >
                        <div style={{ width: '48px', height: '48px', flexShrink: 0, pointerEvents: 'none' }}>
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
                        <div>
                          <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{tree.title}</div>
                          <div style={{ fontSize: '0.85rem', opacity: selectedTree?.id === tree.id ? 1 : 0.8 }}>
                            {tree.node_count} nodes • {tree.color === 'white' ? 'White' : 'Black'} perspective
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

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
