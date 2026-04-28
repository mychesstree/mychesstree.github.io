/**
 * A comprehensive database of chess opening positions derived from the ECO standard.
 * Includes over 12,000 positions covering volumes A through E.
 */

import ecoData from '../data/eco_combined.json';

const OPENING_DATABASE: Record<string, string> = ecoData;

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
  const canonical = getCanonicalFen(fen);
  return OPENING_DATABASE[canonical] || null;
}

/**
 * Checks if a FEN is considered a "Theory" position.
 */
export function isTheoryPosition(fen: string): boolean {
  const canonical = getCanonicalFen(fen);
  return !!OPENING_DATABASE[canonical];
}
