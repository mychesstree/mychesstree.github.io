import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useMobile } from '../hooks/useMobile';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, GitMerge, LayoutGrid, Search, AlertCircle, Download, Upload, X, MoreHorizontal, Trash2 } from 'lucide-react';
import TooltipButton from '../components/TooltipButton';
import ReviewHeatmap from '../components/ReviewHeatmap';
import CreateTreeModal from '../components/CreateTreeModal';
import type { TreeNode } from '../types/tree';
import { calculateDuePositions } from '../utils/treeUtils';

interface Tree {
  id: string;
  title: string;
  color: 'white' | 'black';
  created_at: string;
  cards_due?: number;
  tree_data?: TreeNode;
}

export default function Dashboard() {
  const { user, isGuest, loadGuestTrees, saveGuestTree, loadGuestReviews } = useAuth();
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'white' | 'black'>('white');
  const [viewMode, setViewMode] = useState<'owned' | 'shared'>('owned');
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMobile();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showGuestNotification, setShowGuestNotification] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Tree[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = () => {
      if (activeDropdown) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  // Temporary declaration to fix the fallback before moving to useEffect
  const loadTrees = async () => {
    setLoading(true);

    if (isGuest) {
      const guestTrees = loadGuestTrees();
      const treesWithDue = guestTrees.map(tree => {
        const reviews = loadGuestReviews(tree.id);
        const dueCount = tree.tree_data
          ? calculateDuePositions(tree.tree_data, reviews, tree.color)
          : 0;
        return { ...tree, cards_due: dueCount };
      });
      setTrees(treesWithDue);
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
      // For shared view, show top 5 public trees by default
      const topPublicTrees = await fetchTopPublicTrees();
      setTrees(topPublicTrees);
      setLoading(false);
      return;
    }

    const { data } = await query;

    if (data) {
      const treesWithDue = await Promise.all(data.map(async (tree) => {
        // Fetch all reviews for this tree
        const { data: reviews } = await supabase
          .from('reviews')
          .select('fen, next_review_date')
          .eq('tree_id', tree.id);

        const dueCount = tree.tree_data
          ? calculateDuePositions(tree.tree_data, reviews || [], tree.color)
          : 0;
        return { ...tree, cards_due: dueCount };
      }));
      setTrees(treesWithDue);
    }
    setLoading(false);
  };

  const searchPublicTrees = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('trees')
        .select(`
          id,
          title,
          color,
          created_at,
          updated_at,
          users!trees_user_id_fkey(username)
        `)
        .eq('is_public', true)
        .or(`title.ilike.%${query}%,owner_username.ilike.%${query}%`)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchTopPublicTrees = async () => {
    try {
      const { data, error } = await supabase
        .from('trees')
        .select(`
          id,
          title,
          color,
          created_at,
          updated_at,
          users!trees_user_id_fkey(username)
        `)
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching top public trees:', error);
      return [];
    }
  };

  useEffect(() => {
    loadTrees();
  }, [user, viewMode, isGuest]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate tree name
    const nameRegex = /^[a-zA-Z0-9]{3,10}$/;
    if (!nameRegex.test(newTitle)) {
      alert('Tree name must be 3-10 alphanumeric characters (letters and numbers only)');
      return;
    }

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

  const handleDeleteTree = async (treeId: string) => {
    if (isGuest) {
      // Guest user - delete from localStorage
      const guestTrees = loadGuestTrees();
      const updatedTrees = guestTrees.filter(t => t.id !== treeId);
      localStorage.setItem('mychesstree_guest_trees', JSON.stringify(updatedTrees));
      setDeleteConfirm(null);
      setActiveDropdown(null);
      loadTrees(); // Refresh the tree list
    } else {
      // Authenticated user - delete from Supabase
      const { error } = await supabase.from('trees').delete().eq('id', treeId);
      if (!error) {
        setDeleteConfirm(null);
        setActiveDropdown(null);
        loadTrees(); // Refresh the tree list
      } else {
        console.error(error);
        alert('Failed to delete tree');
      }
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
      <CreateTreeModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onSubmit={handleCreate}
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newColor={newColor}
        setNewColor={setNewColor}
      />
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
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="card animate-fade-in" style={{ maxWidth: 400, width: '100%', border: '1px solid var(--error)' }}>
            <h2 style={{ marginBottom: '1rem', color: '#ef4444' }}>Delete Tree?</h2>
            <p style={{ marginBottom: '1.5rem' }}>
              Are you sure you want to delete this tree? This action cannot be undone and all associated review data will be lost.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTree(deleteConfirm)}
                className="btn"
                style={{ backgroundColor: '#ef4444' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="animate-fade-in">

        {isGuest && showGuestNotification && (
          <div className="card mb-4" style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
            <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
              <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                <AlertCircle size={16} style={{ color: '#ffffff', flexShrink: 0 }} />
                <p className="text-muted" style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  lineHeight: isMobile ? '1.2' : 'normal',
                  display: isMobile ? 'block' : 'inline'
                }}>
                  {isMobile ? (
                    <>
                      Trees are stored in this browser only
                      <br />
                      <Link to="/login" style={{ color: 'var(--accent-color)' }}>Create account to save</Link>
                    </>
                  ) : (
                    <>
                      Trees are stored in this browser only
                      <Link to="/login" style={{ color: 'var(--accent-color)', marginLeft: '1rem' }}>Create account to save</Link>
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowGuestNotification(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

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
                backgroundColor: viewMode === 'shared' ? 'var(--accent-color)' : 'rgba(255,255,255,0.25)'
              }}
            >
              {viewMode === 'owned' ? <Search size={20} /> : <LayoutGrid size={20} />}
            </TooltipButton>
            <h2 style={{ fontSize: '1.25rem', marginLeft: '0.5rem' }}>
              {viewMode === 'owned' ? 'My Repertoire' : 'Shared with Me'}
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportExportModal(true)}
              className="btn btn-secondary"
              title={isMobile ? "Import/Export" : undefined}
            >
              <Download size={18} />
              {!isMobile && " Import/Export"}
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="btn"
              title={isMobile ? "New Tree" : undefined}
            >
              <Plus size={18} />
              {!isMobile && " New Tree"}
            </button>
          </div>
        </div>

        {/* Search Interface for Shared/Public Trees */}
        {viewMode === 'shared' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative', maxWidth: '400px' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                placeholder="Search public trees by title or owner..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim()) {
                    searchPublicTrees(e.target.value);
                  } else {
                    setSearchResults([]);
                  }
                }}
                className="input"
                style={{
                  paddingLeft: '2.5rem',
                  width: '100%',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>
        )}

        {trees.length === 0 && !isCreating && viewMode === 'owned' ? (
          <div className="card text-center" style={{ padding: '4rem 2rem' }}>
            <GitMerge size={48} className="text-muted" style={{ margin: '0 auto 1rem auto' }} />
            <h3>No opening trees yet</h3>
            <p className="text-muted mb-4">Create your first tree to start mapping out your theory.</p>
            <button onClick={() => setIsCreating(true)} className="btn">
              <Plus size={18} />
              Create Tree
            </button>
          </div>
        ) : trees.length === 0 && !isCreating && viewMode === 'shared' && searchQuery === '' ? (
          <div className="card text-center" style={{ padding: '4rem 2rem' }}>
            <Search size={48} className="text-muted" style={{ margin: '0 auto 1rem auto' }} />
            <h3>Discover public trees</h3>
            <p className="text-muted mb-4">Search for trees shared by the community or create your own.</p>
          </div>
        ) : searchQuery.trim() && searchResults.length === 0 && !isSearching ? (
          <div className="card text-center" style={{ padding: '4rem 2rem' }}>
            <Search size={48} className="text-muted" style={{ margin: '0 auto 1rem auto' }} />
            <h3>No trees found</h3>
            <p className="text-muted mb-4">Try searching for different keywords or check your spelling.</p>
          </div>
        ) : searchQuery.trim() && isSearching ? (
          <div className="card text-center" style={{ padding: '4rem 2rem' }}>
            <div style={{
              width: 24,
              height: 24,
              border: '3px solid var(--border-color)',
              borderTop: '3px solid var(--accent-color)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem auto'
            }} />
            <h3>Searching...</h3>
            <p className="text-muted mb-4">Looking for public trees.</p>
          </div>
        ) : (
          <div className="decks-scroll-container">
            {/* Show search results when searching, otherwise show regular trees */}
            {(viewMode === 'shared' && searchQuery.trim() ? searchResults : trees).map((tree) => (
              <div key={tree.id} className="card flex flex-col justify-between" style={{ transition: 'transform 0.2s', padding: '1.5rem' }}>
                <div>
                  <div className="flex items-center justify-between mb-4" style={{ position: 'relative' }}>
                    <h3 style={{ margin: 0, borderBottom: tree.color === 'white' ? '3px solid #fff' : '3px solid #777', display: 'inline-block', lineHeight: '1.4' }}>{tree.title}</h3>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown === tree.id ? null : tree.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          borderRadius: '4px'
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {activeDropdown === tree.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '4px',
                            backgroundColor: 'var(--panel-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 1000,
                            minWidth: '200px'
                          }}>
                          <div style={{ padding: '8px 0' }}>
                            <div style={{
                              padding: '8px 16px',
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                              borderBottom: '1px solid var(--border-color)',
                              marginBottom: '4px'
                            }}>
                              Created: {new Date(tree.created_at).toLocaleDateString()}
                            </div>
                            <button
                              onClick={() => {
                                setDeleteConfirm(tree.id);
                                setActiveDropdown(null);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 16px',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                color: '#ef4444',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Trash2 size={14} />
                              Delete Tree
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
                        width: 15,
                        height: 15,
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
        {/* Show heatmap only for owned trees view */}
        {viewMode === 'owned' && <ReviewHeatmap />}
      </div>
    </>
  );
}
