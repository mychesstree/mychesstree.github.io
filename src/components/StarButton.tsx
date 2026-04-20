import { useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

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

  
  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20
  };

  const handleToggleStar = async () => {
    if (!user || loading) return;

    setLoading(true);
    try {
      if (isStarred) {
        // Unstar
        console.log('Unstarring tree:', treeId);
        const { error } = await supabase
          .from('tree_stars')
          .delete()
          .eq('tree_id', treeId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Unstar error:', error);
          throw error;
        }
        
        setIsStarred(false);
        setCurrentStarCount(prev => prev - 1);
        onStarChange?.(currentStarCount - 1, false);
        console.log('Unstarred successfully');
      } else {
        // Star
        console.log('Starring tree:', treeId);
        const { error } = await supabase
          .from('tree_stars')
          .insert({ tree_id: treeId, user_id: user.id });

        if (error) {
          console.error('Star error:', error);
          throw error;
        }
        
        setIsStarred(true);
        setCurrentStarCount(prev => prev + 1);
        onStarChange?.(currentStarCount + 1, true);
        console.log('Starred successfully');
      }
    } catch (error) {
      console.error('Error toggling star:', error);
      // Show user feedback if schema isn't applied
      if (error instanceof Error && error.message.includes('relation "tree_stars" does not exist')) {
        console.warn('Star system schema not applied yet. Please apply star_system_schema.sql to Supabase.');
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
