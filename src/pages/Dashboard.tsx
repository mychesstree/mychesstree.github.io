import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, GitMerge, LayoutGrid, Users } from 'lucide-react';
import TooltipButton from '../components/TooltipButton';
import ReviewHeatmap from '../components/ReviewHeatmap';

interface Tree {
  id: string;
  title: string;
  color: 'white' | 'black';
  created_at: string;
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
      // Fetch trees where user is in tree_shares
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
    if (data) setTrees(data);
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
                <div className="flex items-center justify-between mb-2">
                  <h3 style={{ margin: 0 }}>{tree.title}</h3>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '1rem',
                    fontSize: '0.75rem',
                    backgroundColor: tree.color === 'white' ? '#f3f4f6' : '#374151',
                    color: tree.color === 'white' ? '#111827' : '#f3f4f6',
                    fontWeight: 600
                  }}>
                    {tree.color.toUpperCase()}
                  </span>
                </div>
                <p className="text-muted text-sm mb-4">
                  Created {new Date(tree.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/editor/${tree.id}`} className="btn" style={{ flex: 1 }}>
                  <GitMerge size={16} />
                  Edit Tree
                </Link>
                <Link to={`/review/${tree.id}`} className="btn btn-secondary">
                  Review
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
