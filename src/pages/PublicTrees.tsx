import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Globe, Users, Calendar } from 'lucide-react';

interface PublicTree {
  id: string;
  title: string;
  color: 'white' | 'black';
  created_at: string;
  updated_at: string;
  owner_username: string;
}

export default function PublicTrees() {
  const [trees, setTrees] = useState<PublicTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTrees, setFilteredTrees] = useState<PublicTree[]>([]);

  useEffect(() => {
    loadPublicTrees();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredTrees(trees);
    } else {
      const filtered = trees.filter(tree => 
        tree.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tree.owner_username.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTrees(filtered);
    }
  }, [searchTerm, trees]);

  const loadPublicTrees = async () => {
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
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const formattedTrees: PublicTree[] = (data || []).map((tree: any) => ({
        id: tree.id,
        title: tree.title,
        color: tree.color,
        created_at: tree.created_at,
        updated_at: tree.updated_at,
        owner_username: tree.users?.username || 'Unknown'
      }));

      setTrees(formattedTrees);
      setFilteredTrees(formattedTrees);
    } catch (error) {
      console.error('Error loading public trees:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        Loading public trees...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
        <Globe size={32} color="var(--accent-color)" />
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Public Trees</h1>
      </div>

      <div style={{ marginBottom: '2rem' }}>
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
            placeholder="Search by tree name or owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{ 
              paddingLeft: '2.5rem', 
              width: '100%',
              fontSize: '1rem'
            }}
          />
        </div>
      </div>

      {filteredTrees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          {searchTerm ? 'No public trees found matching your search.' : 'No public trees available yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {filteredTrees.map((tree) => (
            <Link
              key={tree.id}
              to={`/tree/${tree.id}`}
              className="card"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
                padding: '1.5rem',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', borderBottom: tree.color === 'white' ? '3px solid #fff' : '3px solid #444', display: 'inline-block', lineHeight: '1.3' }}>
                  {tree.title}
                </h3>
                <Globe size={16} color="#22c55e" style={{ flexShrink: 0 }} />
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <Users size={14} />
                <span>{tree.owner_username}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <Calendar size={12} />
                <span>Updated {formatDate(tree.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
