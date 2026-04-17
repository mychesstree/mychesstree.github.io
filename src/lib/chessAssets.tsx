import bbSrc from '../assets/caliente/bb.svg';
import bwSrc from '../assets/caliente/bw.svg';
import kbSrc from '../assets/caliente/kb.svg';
import kwSrc from '../assets/caliente/kw.svg';
import nbSrc from '../assets/caliente/nb.svg';
import nwSrc from '../assets/caliente/nw.svg';
import pbSrc from '../assets/caliente/pb.svg';
import pwSrc from '../assets/caliente/pw.svg';
import qbSrc from '../assets/caliente/qb.svg';
import qwSrc from '../assets/caliente/qw.svg';
import rbSrc from '../assets/caliente/rb.svg';
import rwSrc from '../assets/caliente/rw.svg';

export const pieceMap: Record<string, string> = {
  wP: pwSrc, wN: nwSrc, wB: bwSrc, wR: rwSrc, wQ: qwSrc, wK: kwSrc,
  bP: pbSrc, bN: nbSrc, bB: bbSrc, bR: rbSrc, bQ: qbSrc, bK: kbSrc,
};

export const calientePieces = Object.fromEntries(
  Object.entries(pieceMap).map(([key, src]) => [
    key,
    () => (
      <img 
        src={src} 
        alt={key} 
        style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
      />
    ),
  ])
);

export const boardStyles = {
  darkSquareStyle: { backgroundColor: '#c47e8a' },
  lightSquareStyle: { backgroundColor: '#f5ece9' },
  boardStyle: {
    borderRadius: '4px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
  }
};
