import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';

interface StarButtonProps {
  treeId: string;
  starCount: number;
  isStarred?: boolean;
  onStarChange?: (newStarCount: number, isStarred: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

export default function StarButton({ 
  treeId, 
  starCount, 
  isStarred: initialIsStarred = false,
  onStarChange,
  size = 'sm',
  showCount = true 
}: StarButtonProps) {
  const { user } = useAuth();
  const [isStarred, setIsStarred] = useState(initialIsStarred);
  const [currentStarCount, setCurrentStarCount] = useState(starCount);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  
  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20
  };

  // Keep internal state in sync with props
  useEffect(() => {
    setIsStarred(initialIsStarred);
  }, [initialIsStarred]);

  useEffect(() => {
    setCurrentStarCount(starCount);
  }, [starCount]);

  const handleToggleStar = async () => {
    if (!user || loading) return;

    setLoading(true);
    try {
      if (isStarred) {
        // Unstar
        const { error } = await supabase
          .from('tree_stars')
          .delete()
          .eq('tree_id', treeId)
          .eq('user_id', user.id);

        if (error) {
          // If already deleted or not found, just update UI
          if (error.code === 'PGRST116') {
            setIsStarred(false);
            return;
          }
          throw error;
        }
        
        setIsStarred(false);
        setCurrentStarCount(prev => Math.max(0, prev - 1));
        onStarChange?.(Math.max(0, currentStarCount - 1), false);
      } else {
        // Star
        const { error } = await supabase
          .from('tree_stars')
          .insert({ tree_id: treeId, user_id: user.id });

        if (error) {
          // Handle conflict: already starred
          if (error.code === '23505' || error.message.includes('unique constraint')) {
            setIsStarred(true);
            // Don't increment count here as it was already starred
            onStarChange?.(currentStarCount, true);
            return;
          }
          throw error;
        }
        
        setIsStarred(true);
        setCurrentStarCount(prev => prev + 1);
        onStarChange?.(currentStarCount + 1, true);
      }
    } catch (error) {
      console.error('Star error:', error);
      // Show user feedback if schema isn't applied
      if (error instanceof Error && error.message.includes('relation "tree_stars" does not exist')) {
        showError('Star feature not available yet');
      } else {
        showError('Failed to toggle star');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggleStar}
      disabled={!user || loading}
      className={`btn ${isStarred ? 'btn-accent' : ''} ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ padding: '0.3rem 0.5rem' }}
      title={!user ? 'Sign in to star this tree' : (isStarred ? 'Unstar' : 'Star')}
    >
      <Star 
        size={iconSizes[size]} 
        fill={isStarred ? 'currentColor' : 'none'}
        className={loading ? 'animate-pulse' : ''}
      />
      {showCount && <span className="ml-2">{currentStarCount}</span>}
    </button>
  );
}
