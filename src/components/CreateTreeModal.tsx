import { X, Plus } from 'lucide-react';

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
  if (!isOpen) return null;

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
        
        <form onSubmit={onSubmit}>
          <div className="input-group">
            <label>Tree Name</label>
            <input
              type="text"
              className="input"
              placeholder="E.g., Caro-Kann Defense"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
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
            <button type="submit" className="btn flex-1">Create Tree</button>
          </div>
        </form>
      </div>
    </div>
  );
}
