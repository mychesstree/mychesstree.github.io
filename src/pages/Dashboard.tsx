import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, GitMerge, LayoutGrid, Users, Info, AlertCircle, Download, Upload, X } from 'lucide-react';
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
  const { user, isGuest, loadGuestTrees, saveGuestTree } = useAuth();
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'white' | 'black'>('white');
  const [viewMode, setViewMode] = useState<'owned' | 'shared'>('owned');
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Temporary declaration to fix the fallback before moving to useEffect
  const loadTrees = async () => {
    setLoading(true);

    if (isGuest) {
      const guestTrees = loadGuestTrees();
      setTrees(guestTrees.map(t => ({
        ...t,
        cards_due: 0
      })));
      setLoading(false);
      return;
    }

    if (!user) return;

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
  }, [user, viewMode, isGuest]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const newTree = {
      id: crypto.randomUUID(),
      title: newTitle,
      color: newColor,
      created_at: new Date().toISOString(),
      tree_data: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        children: []
      }
    };

    if (isGuest) {
      saveGuestTree(newTree);
      navigate(`/editor/${newTree.id}`);
      return;
    }

    if (!user) return;

    const { data, error } = await supabase
      .from('trees')
      .insert({
        user_id: user.id,
        title: newTitle,
        color: newColor,
        tree_data: newTree.tree_data
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

  const handleExport = async () => {
    try {
      // Fetch all trees with their review data
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        trees: []
      };

      for (const tree of trees) {
        const treeData = {
          id: tree.id,
          title: tree.title,
          color: tree.color,
          created_at: tree.created_at,
          tree_data: tree.tree_data,
          reviews: []
        };

        // Fetch reviews for this tree
        if (!isGuest && user) {
          const { data: reviews } = await supabase
            .from('reviews')
            .select('*')
            .eq('tree_id', tree.id);

          treeData.reviews = reviews || [];
        }

        exportData.trees.push(treeData);
      }

      // Create and download the JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mychesstree-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.trees || !Array.isArray(importData.trees)) {
        throw new Error('Invalid file format');
      }

      let importedCount = 0;

      for (const treeData of importData.trees) {
        // Create new tree with imported data
        const newTree = {
          id: crypto.randomUUID(), // Generate new ID to avoid conflicts
          title: treeData.title || 'Imported Tree',
          color: treeData.color || 'white',
          created_at: new Date().toISOString(),
          tree_data: treeData.tree_data || {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            children: []
          }
        };

        if (isGuest) {
          saveGuestTree(newTree);
          importedCount++;
        } else if (user) {
          const { error } = await supabase
            .from('trees')
            .insert({
              user_id: user.id,
              title: newTree.title,
              color: newTree.color,
              tree_data: newTree.tree_data
            });

          if (!error) {
            // Import reviews if they exist
            if (treeData.reviews && Array.isArray(treeData.reviews)) {
              for (const review of treeData.reviews) {
                await supabase
                  .from('reviews')
                  .insert({
                    tree_id: newTree.id,
                    fen: review.fen,
                    next_review_date: review.next_review_date,
                    interval: review.interval,
                    ease_factor: review.ease_factor,
                    repetitions: review.repetitions
                  });
              }
            }
            importedCount++;
          }
        }
      }

      alert(`Successfully imported ${importedCount} trees!`);
      loadTrees(); // Refresh the tree list
      setShowImportExportModal(false);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed. Please make sure the file is a valid MyChessTree export.');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) return <div>Loading trees...</div>;

  return (
    <>
      {/* Import/Export Modal */}
      {showImportExportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 500, width: '100%', position: 'relative' }}>
            <button onClick={() => setShowImportExportModal(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={24} color="var(--accent-color)" />
              Import/Export Trees
            </h2>
            <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
              Export your trees and review data to backup or share, or import previously exported trees.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setImportExportTab('export')}
                style={{
                  borderBottom: importExportTab === 'export' ? '2px solid var(--accent-color)' : 'none',
                  borderRadius: '0.25rem 0.25rem 0 0',
                  background: 'transparent',
                  opacity: importExportTab === 'export' ? 1 : 0.7
                }}
              >
                Export
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setImportExportTab('import')}
                style={{
                  borderBottom: importExportTab === 'import' ? '2px solid var(--accent-color)' : 'none',
                  borderRadius: '0.25rem 0.25rem 0 0',
                  background: 'transparent',
                  opacity: importExportTab === 'import' ? 1 : 0.7
                }}
              >
                Import
              </button>
            </div>

            {importExportTab === 'export' && (
              <div className="card" style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Export All Trees</h4>
                <p className="text-muted text-sm" style={{ margin: '0 0 1rem 0' }}>
                  Download all your trees and review data as a JSON file.
                </p>
                <button onClick={handleExport} className="btn">
                  <Download size={16} />
                  Export All Trees
                </button>
              </div>
            )}

            {importExportTab === 'import' && (
              <div className="card" style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Import Trees</h4>
                <p className="text-muted text-sm" style={{ margin: '0 0 1rem 0' }}>
                  Upload a previously exported JSON file to restore your trees.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: 'none' }}
                />
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
                  <Upload size={16} />
                  Choose File to Import
                </button>
              </div>
            )}
          </div>
        </div>
      )}    <div className="animate-fade-in">

        {isGuest && (
          <div className="card mb-4" style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <div className="flex items-center gap-2">
              <AlertCircle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Guest: Trees stored in this browser only
                <Link to="/login" style={{ color: 'var(--accent-color)', marginLeft: '0.25rem' }}>Create account to save</Link>
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3">
            {!isGuest && (
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
            )}
            <h2 style={{ fontSize: '1.25rem', marginLeft: isGuest ? 0 : '0.5rem' }}>
              {isGuest ? 'My Trees' : (viewMode === 'owned' ? 'My Repertoire' : 'Shared with Me')}
            </h2>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowImportExportModal(true)} className="btn btn-secondary">
              <Download size={18} />
              Import/Export
            </button>
            <button onClick={() => setIsCreating(true)} className="btn">
              <Plus size={18} />
              New Tree
            </button>
          </div>
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
                      onClick={() => { }}
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
                  {!isGuest && (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <ReviewHeatmap />
      </div>
    </>
  );
}
