import { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { supabase } from '../lib/supabase';
import { calientePieces, boardStyles } from '../lib/chessAssets';
import { Trophy, Check, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DailyGame {
  id: string;
  date: string;
  white_player: string;
  black_player: string;
  white_rating?: number;
  black_rating?: number;
  result: string;
  opening_name?: string;
  puzzle_positions: Array<{
    fen: string;
    masterMove: string;
    moveNumber: number;
    turn: string;
  }>;
}

interface DailyGamePanelProps {
  onStartPuzzle: (game: DailyGame, positionIndex: number) => void;
  isCompleted?: boolean;
  game?: DailyGame;
  gameId?: string;
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  dateRange?: { earliest: Date; latest: Date };
  refreshTrigger?: number;
}

export default function DailyGamePanel({ onStartPuzzle, isCompleted = false, game: initialGame, selectedDate = new Date(), onDateChange, dateRange, refreshTrigger }: DailyGamePanelProps) {
  const [localCompleted, setLocalCompleted] = useState(isCompleted);
  const [dailyGame, setDailyGame] = useState<DailyGame | null>(initialGame || null);
  const [loading, setLoading] = useState(!initialGame);
  const [error, setError] = useState<string | null>(null);
  const [dateRangeState, setDateRangeState] = useState<{ earliest: Date; latest: Date } | null>(null);

  useEffect(() => {
    if (dateRange) {
      setDateRangeState(dateRange);
    } else {
      fetchDateRange();
    }
  }, [dateRange]);

  useEffect(() => {
    if (dailyGame) {
      const localProgressKey = `chesstr.ee_daily_progress_${dailyGame.id}`;
      const localDoneKey = `chesstr.ee_daily_done_${dailyGame.id}`;
      try {
        const localProgress = JSON.parse(localStorage.getItem(localProgressKey) || '[]');
        const localDone = JSON.parse(localStorage.getItem(localDoneKey) || '[]');
        const allDone = new Set([...localProgress, ...localDone]);

        if (allDone.size >= dailyGame.puzzle_positions.length) {
          setLocalCompleted(true);
          return;
        }
      } catch (e) { }
    }
    setLocalCompleted(isCompleted);
  }, [dailyGame, isCompleted, refreshTrigger]);

  useEffect(() => {
    if (initialGame) {
      setDailyGame(initialGame);
      setLoading(false);
      setError(null);
    } else {
      fetchDailyGame();
    }
  }, [selectedDate, initialGame]);

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

  const fetchDailyGame = async () => {
    // setLoading(true);
    try {
      // First test if table is accessible
      const { error: testError } = await supabase
        .from('daily_master_games')
        .select('date')
        .limit(1);

      if (testError) {
        console.error('Table access error:', testError);
        setError('Daily games table not available');
        return;
      }

      // Get game directly from table by date
      const targetDate = selectedDate.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_master_games')
        .select('*')
        .eq('date', targetDate)
        .maybeSingle();

      if (error) {
        console.error('Database error:', error);
        setError('No game available for this date');
      } else if (data) {
        setDailyGame(data);
      } else {
        // No game found for this date - this is normal
        setError('No game available for this date');
      }
    } catch (err) {
      console.error('Failed to fetch daily game:', err);
      setError('Failed to load daily game');
    } finally {
      setLoading(false);
    }
  };

  const getFirstPositionFen = () => {
    return dailyGame?.puzzle_positions?.[0]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Trophy size={20} color="var(--accent-color)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Daily Game</h3>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{
            width: 24,
            height: 24,
            border: '3px solid var(--border-color)',
            borderTop: '3px solid var(--accent-color)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem auto'
          }} />
          <p className="text-muted">Loading today's game...</p>
        </div>
      </div>
    );
  }

  if (error || !dailyGame) {
    return (
      <div className="card" style={{ padding: '1rem', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: -7,
          right: -17,
          backgroundColor: 'rgba(119, 19, 19, 0.78)',
          borderRadius: '0.5rem',
          padding: '0.4rem',
          paddingLeft: '0.8rem',
          paddingRight: '0.8rem',
          transform: 'translate(-10px,-10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Trophy size={14} color="var(--accent-color)" />
            <h3 style={{ margin: 0, fontSize: '0.8rem' }}>Daily Game</h3>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <p className="text-muted">{error || 'No game available'}</p>
          <button onClick={fetchDailyGame} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        padding: '0.5rem',
        maxWidth: '350px',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        position: 'relative'
      }}
      onClick={() => onStartPuzzle(dailyGame, 0)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
    >

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', }}>
        <div style={{
          position: 'absolute',
          top: 20,
          right: 0,
          backgroundColor: 'rgba(119, 19, 19, 0.78)',
          borderRadius: '0.5rem',
          padding: '0.4rem',
          paddingLeft: '0.8rem',
          paddingRight: '0.8rem',
          transform: 'translate(-10px,-10px)',
          zIndex: 999999999
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Trophy size={14} color="var(--accent-color)" />
            <h3 style={{ margin: 0, fontSize: '0.8rem' }}>Daily Game</h3>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      {onDateChange && dateRangeState && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 1);
                if (newDate >= dateRangeState.earliest) {
                  onDateChange(newDate);
                }
              }}
              className="btn btn-secondary"
              style={{
                padding: '0.25rem 0.5rem',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.8rem'
              }}
              disabled={selectedDate <= dateRangeState.earliest}
            >
              <ChevronLeft size={14} />
            </button>

            <div style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              minWidth: '120px'
            }}>
              {selectedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              })}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 1);
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                if (newDate <= dateRangeState.latest && newDate <= today) {
                  onDateChange(newDate);
                }
              }}
              className="btn btn-secondary"
              style={{
                padding: '0.25rem 0.5rem',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.8rem'
              }}
              disabled={(() => {
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                return selectedDate >= dateRangeState.latest || selectedDate >= today;
              })()}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {selectedDate.toDateString() !== new Date().toDateString() && (
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDateChange(new Date());
                }}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.4rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <Calendar size={12} />
                Today
              </button>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '300px', height: '300px', flexShrink: 0, filter: localCompleted ? 'grayscale(100%) opacity(0.5)' : 'none', transition: 'filter 0.3s ease', borderRadius: '10px', overflow: 'hidden' }}>
          {(() => {
            const Board = Chessboard as any;
            return <Board
              options={{
                position: getFirstPositionFen(),
                draggable: false,
                pieces: calientePieces,
                darkSquareStyle: boardStyles.darkSquareStyle,
                lightSquareStyle: boardStyles.lightSquareStyle,
                showNotation: false
              }}
            />;
          })()}
        </div>
      </div>

      {/* Completion Overlay */}
      {localCompleted && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'transparent',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 10
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            backgroundColor: 'var(--accent-color)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <Check size={36} color="white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
          </div>
        </div>
      )}
    </div>
  );
}
