import { useState } from 'react';
import { Info, Edit2, X } from 'lucide-react';
import type { TreeNode } from '../types/tree';

interface NodeInfoProps {
  node: TreeNode;
  onUpdate?: (title: string, description: string) => void;
  compact?: boolean;
}

export default function NodeInfo({ node, onUpdate, compact = false }: NodeInfoProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(node.title || '');
  const [description, setDescription] = useState(node.description || '');

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(title.trim().substring(0, 20), description.trim().substring(0, 100));
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(node.title || '');
    setDescription(node.description || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="card" style={{ 
        padding: compact ? '0.75rem' : '1rem', 
        maxWidth: '300px',
        fontSize: compact ? '0.85rem' : '0.9rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: compact ? '0.9rem' : '1rem' }}>Edit Node Info</h4>
          <button 
            onClick={handleCancel}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: '0.25rem' }}
          >
            <X size={16} />
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Title (max 20 chars)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.substring(0, 20))}
              placeholder="Node title..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem'
              }}
              maxLength={20}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {title.length}/20
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Description (max 100 chars)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.substring(0, 100))}
              placeholder="Node description..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                minHeight: '60px',
                resize: 'vertical'
              }}
              maxLength={100}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {description.length}/100
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              onClick={handleCancel}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: '0.85rem'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasInfo = !!(node.title || node.description);

  return (
    <div className="card" style={{ 
      padding: compact ? '0.5rem' : '0.75rem', 
      maxWidth: '300px',
      fontSize: compact ? '0.8rem' : '0.85rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasInfo ? (
            <>
              {node.title && (
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: compact ? '0.85rem' : '0.9rem', fontWeight: '600' }}>
                  {node.title}
                </h4>
              )}
              {node.description && (
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {node.description}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No node information added
            </p>
          )}
        </div>
        
        {onUpdate && (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '0.25rem',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              flexShrink: 0
            }}
            title="Edit node information"
          >
            <Edit2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

interface NodeInfoButtonProps {
  node: TreeNode;
  onUpdate?: (title: string, description: string) => void;
}

export function NodeInfoButton({ node, onUpdate }: NodeInfoButtonProps) {
  const [showInfo, setShowInfo] = useState(false);
  const hasInfo = !!(node.title || node.description);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowInfo(!showInfo)}
        style={{
          background: hasInfo ? 'var(--accent-color)' : 'var(--surface)',
          border: hasInfo ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: hasInfo ? 'white' : 'var(--text-muted)'
        }}
        title={hasInfo ? "View node information" : "Add node information"}
      >
        <Info size={12} />
      </button>
      
      {showInfo && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '0.5rem',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          <NodeInfo 
            node={node} 
            onUpdate={onUpdate}
            compact={true}
          />
          <button
            onClick={() => setShowInfo(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'default',
              zIndex: -1
            }}
          />
        </div>
      )}
    </div>
  );
}
