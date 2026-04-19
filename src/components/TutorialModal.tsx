import React from 'react';
import { X, HelpCircle, Play, Save, Trash2, ChevronRight, Info, Share2 } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div className="card animate-fade-in" style={{ maxWidth: 500, width: '100%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={24} />
        </button>
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HelpCircle size={24} color="var(--accent-color)" />
          How to use MyChessTree
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <TutorialStep icon={<Play size={18} />} title="Build Your Tree" text="Make moves on the board to add them to your tree. New moves appear in yellow until saved." />
          <TutorialStep icon={<Save size={18} />} title="Save Your Progress" text="Click 'Save' to commit your new moves. Save turns off-white when you have pending changes." />
          <TutorialStep icon={<Trash2 size={18} />} title="Prune Branches" text="Toggle 'Delete Mode' (Trash icon) to remove entire branches. Click any line to see how many positions it contains before confirming." />
          <TutorialStep icon={<ChevronRight size={18} />} title="Analyze with Engine" text="Stockfish runs in your browser. The eval bar and red arrows show the best engine moves." />
          <TutorialStep icon={<Info size={18} />} title="Navigation" text="Click nodes in the tree to jump to that position. Right-click the board to draw your own arrows." />
          <TutorialStep icon={<Share2 size={18} />} title="Collaborate" text="Use the 'Share' button to grant friends read or edit access to your repertoire by their username." />
        </div>
        <button onClick={onClose} className="btn" style={{ width: '100%', marginTop: '2rem' }}>Got it!</button>
      </div>
    </div>
  );
}

function TutorialStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ color: 'var(--accent-color)', marginTop: 2 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 2 }}>{title}</div>
        <div className="text-muted text-sm" style={{ lineHeight: 1.4 }}>{text}</div>
      </div>
    </div>
  );
}
