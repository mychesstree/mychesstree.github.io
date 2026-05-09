import { X, Plus } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useToast } from './Toast';

interface CreateTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  newTitle: string;
  setNewTitle: (title: string) => void;
  newColor: 'white' | 'black';
  setNewColor: (color: 'white' | 'black') => void;
}

export default function CreateTreeModal({
  isOpen,
  onClose,
  onSubmit,
  newTitle,
  setNewTitle,
  newColor,
  setNewColor
}: CreateTreeModalProps) {
  const { canCreateTree, treesRemaining, loading } = useSubscription();
  const { error } = useToast();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) {
      error('Loading subscription information...');
      return;
    }

    if (!canCreateTree()) {
      error(`Tree limit reached! You can create ${treesRemaining()} more trees. Upgrade to Pro for unlimited trees.`);
      return;
    }

    onSubmit(e);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        className="card animate-fade-in"
        style={{ maxWidth: 500, width: '100%', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          <X size={24} />
        </button>

        <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={24} color="var(--accent-color)" />
          Create New Tree
        </h2>

        <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
          Create a new opening tree to start mapping out your chess theory and practice positions.
        </p>

        {!loading && treesRemaining() < 5 && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: treesRemaining() === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(255,193,7,0.1)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            border: treesRemaining() === 0 ? '1px solid #ef4444' : '1px solid #ffc107'
          }}>
            <div style={{ fontSize: '0.8rem', color: treesRemaining() === 0 ? '#ef4444' : '#ffc107' }}>
              {treesRemaining() === 0
                ? 'Tree limit reached. Upgrade to Pro for unlimited trees.'
                : `${treesRemaining()} trees remaining. Upgrade to Pro for unlimited trees.`
              }
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Tree Name</label>
            <input
              type="text"
              className="input"
              placeholder="E.g., Caro-Kann-Defense"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value.replace(/\s+/g, '-'))}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.preventDefault();
                  setNewTitle(newTitle + '-');
                }
              }}
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label>Playing As</label>
            <select
              className="input"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value as 'white' | 'black')}
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="btn flex-1"
              disabled={!canCreateTree()}
            >
              Create Tree
            </button>
          </div>

          {!loading && treesRemaining() < 5 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '0.5rem'
            }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '600',
                color: treesRemaining() > 0 ? 'var(--accent-color)' : '#ef4444',
                backgroundColor: treesRemaining() > 0 ? 'rgba(var(--accent-color-rgb), 0.1)' : 'rgba(239,68,68,0.1)',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                border: treesRemaining() > 0 ? '1px solid rgba(var(--accent-color-rgb), 0.2)' : '1px solid rgba(239,68,68,0.2)'
              }}>
                {treesRemaining()} trees left
              </span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
