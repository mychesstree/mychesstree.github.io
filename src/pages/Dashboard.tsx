import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, GitMerge, LayoutGrid, Users, Info } from 'lucide-react';
import { Chess } from 'chess.js';
import TooltipButton from '../components/TooltipButton';
import ReviewHeatmap from '../components/ReviewHeatmap';

interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
}

interface Tree {
  id: string;
  title: string;
  color: 'white' | 'black';
  created_at: string;
  cards_due?: number;
  tree_data?: TreeNode;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'white' | 'black'>('white');
  const [viewMode, setViewMode] = useState<'owned' | 'shared'>('owned');
  const navigate = useNavigate();

  // Temporary declaration to fix the fallback before moving to useEffect
  const loadTrees = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('trees')
      .select('*')
      .order('created_at', { ascending: false });

    if (viewMode === 'owned') {
      query = query.eq('user_id', user.id);
    } else {
      const { data: sharedIds } = await supabase
        .from('tree_shares')
        .select('tree_id')
        .eq('user_id', user.id);

      const ids = (sharedIds || []).map(s => s.tree_id);
      if (ids.length === 0) {
        setTrees([]);
        setLoading(false);
        return;
      }
      query = query.in('id', ids);
    }

    const { data } = await query;

    if (data) {
      const treesWithDue = await Promise.all(data.map(async (tree) => {
        // Fetch all reviews for this tree
        const { data: reviews } = await supabase
          .from('reviews')
          .select('fen, next_review_date')
          .eq('tree_id', tree.id);

        const reviewMap = new Map(reviews?.map(r => [r.fen, new Date(r.next_review_date)]) || []);
        
        // Traverse tree to count due positions (only positions where it's player's turn)
        let dueCount = 0;
        const isPlayerWhite = tree.color === 'white';

        function traverse(node: TreeNode) {
          const chess = new Chess(node.fen);
          const isWhiteTurn = chess.turn() === 'w';
          const isSideToMatch = isPlayerWhite ? isWhiteTurn : !isWhiteTurn;

          if (isSideToMatch && node.children && node.children.length > 0) {
            const nextReview = reviewMap.get(node.fen);
            const isDue = !nextReview || nextReview <= new Date();
            if (isDue) dueCount++;
          }

          if (node.children) {
            node.children.forEach(child => traverse(child));
          }
        }

        if (tree.tree_data) traverse(tree.tree_data);
        return { ...tree, cards_due: dueCount };
      }));
      setTrees(treesWithDue);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTrees();
  }, [user, viewMode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Initial tree data is an empty object
    const { data, error } = await supabase
      .from('trees')
      .insert({
        user_id: user.id,
        title: newTitle,
        color: newColor,
        tree_data: {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          children: []
        }
      })
      .select()
      .single();

    if (!error && data) {
      navigate(`/editor/${data.id}`);
    } else {
      console.error(error);
      alert('Failed to create tree');
    }
  };

  if (loading) return <div>Loading trees...</div>;

  return (
    <div className="animate-fade-in">

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <TooltipButton
            tooltip={viewMode === 'owned' ? "View Shared Trees" : "View My Trees"}
            onClick={() => setViewMode(viewMode === 'owned' ? 'shared' : 'owned')}
            className={`btn btn-icon ${viewMode === 'shared' ? '' : 'btn-secondary'}`}
            style={{
              borderRadius: '50%',
              width: 38,
              height: 38,
              padding: 0,
              backgroundColor: viewMode === 'shared' ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)'
            }}
          >
            {viewMode === 'owned' ? <LayoutGrid size={20} /> : <Users size={20} />}
          </TooltipButton>
          <h2 style={{ fontSize: '1.25rem', marginLeft: '0.5rem' }}>
            {viewMode === 'owned' ? 'My Repertoire' : 'Shared with Me'}
          </h2>
        </div>
        {viewMode === 'owned' && (
          <button onClick={() => setIsCreating(true)} className="btn">
            <Plus size={18} />
            New Tree
          </button>
        )}
      </div>

      {isCreating && (
        <div className="card mb-6 animate-fade-in" style={{ border: '1px solid var(--accent-color)' }}>
          <h3 className="mb-4 text-white">Create New Tree</h3>
          <form onSubmit={handleCreate} className="flex items-center gap-4 flex-wrap">
            <div className="input-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                className="input"
                placeholder="E.g., Caro-Kann Defense"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <select
                className="input"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value as 'white' | 'black')}
              >
                <option value="white">Playing as White</option>
                <option value="black">Playing as Black</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn">Create</button>
              <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {trees.length === 0 && !isCreating ? (
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
        <div className="decks-scroll-container">
          {trees.map((tree) => (
            <div key={tree.id} className="card flex flex-col justify-between" style={{ transition: 'transform 0.2s', padding: '1.5rem' }}>
              <div>
                <div className="flex items-center justify-between mb-4" style={{ position: 'relative' }}>
                  <h3 style={{ margin: 0, borderBottom: tree.color === 'white' ? '3px solid #fff' : '3px solid #777', display: 'inline-block', lineHeight: '1.4' }}>{tree.title}</h3>
                  <TooltipButton
                    tooltip={`Created ${new Date(tree.created_at).toLocaleDateString()}`}
                    onClick={() => {}}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'help',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <Info size={16} />
                  </TooltipButton>
                </div>
              </div>
              <div className="flex gap-2">
                <Link to={`/editor/${tree.id}`} className="btn" style={{ flex: 1 }}>
                  <GitMerge size={16} />
                  Edit
                </Link>
                <Link to={`/review/${tree.id}`} className="btn btn-secondary" style={{ position: 'relative' }}>
                  Review
                  {tree.cards_due! > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 10,
                      height: 10,
                      backgroundColor: '#ef4444',
                      borderRadius: '50%',
                      border: '2px solid var(--panel-bg)'
                    }} />
                  )}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReviewHeatmap />
    </div>
  );
}
