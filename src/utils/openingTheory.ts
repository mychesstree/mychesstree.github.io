/**
 * A comprehensive database of chess opening positions derived from the ECO standard.
 * Includes over 12,000 positions covering volumes A through E.
 */

import { useState, useEffect } from 'react';

let OPENING_DATABASE: Record<string, string> | null = null;

/**
 * Initializes the opening database lazily.
 */
export async function initOpeningTheory() {
  if (!OPENING_DATABASE) {
    const data = await import('../data/eco_combined.json');
    OPENING_DATABASE = data.default || data;
  }
  return OPENING_DATABASE;
}

/**
 * Hook to trigger lazy loading of the opening database and re-render when ready.
 */
export function useOpeningTheory() {
  const [isReady, setIsReady] = useState(!!OPENING_DATABASE);
  
  useEffect(() => {
    if (!isReady) {
      initOpeningTheory().then(() => setIsReady(true));
    }
  }, [isReady]);
  
  return isReady;
}

/**
 * Gets the canonical FEN (ignores halfmove/fullmove clocks)
 */
export function getCanonicalFen(fen: string): string {
  if (!fen) return '';
  const parts = fen.split(' ');
  // Keep board, turn, castling, and en passant target
  return parts.slice(0, 4).join(' ');
}

/**
 * Returns the name of the opening for a given FEN, if known.
 */
export function getOpeningName(fen: string): string | null {
  if (!OPENING_DATABASE) return null;
  const canonical = getCanonicalFen(fen);
  return OPENING_DATABASE[canonical] || null;
}

/**
 * Checks if a FEN is considered a "Theory" position.
 */
export function isTheoryPosition(fen: string): boolean {
  if (!OPENING_DATABASE) return false;
  const canonical = getCanonicalFen(fen);
  return !!OPENING_DATABASE[canonical];
}
