import type { ArchivedGame } from './pgnParser';

export interface CachedChesscomGames {
  username: string;
  month: string;
  games: ArchivedGame[];
  cachedAt: number;
  lastAccessed: number;
}

export interface ChesscomCache {
  entries: Record<string, CachedChesscomGames>;
}

const CACHE_KEY = 'chesscom_games_cache';
const MAX_CACHE_SIZE = 100; // Maximum number of entries to cache
const CACHE_EXPIRY_DAYS = 7; // Days before cache expires

const getCacheKey = (username: string, month: string): string => `${username.toLowerCase()}_${month}`;

export const chesscomCache = {
  // Get cached games for a username and month
  getGames(username: string, month: string): CachedChesscomGames | null {
    try {
      const cache: ChesscomCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"entries":{}}');
      const key = getCacheKey(username, month);
      const entry = cache.entries[key];
      
      if (!entry) return null;
      
      // Check if cache is expired
      const daysSinceCached = (Date.now() - entry.cachedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceCached > CACHE_EXPIRY_DAYS) {
        this.removeGames(username, month);
        return null;
      }
      
      // Update last accessed time
      entry.lastAccessed = Date.now();
      this.saveCache(cache);
      
      return entry;
    } catch (error) {
      console.error('Error reading chess.com cache:', error);
      return null;
    }
  },

  // Save games to cache
  saveGames(username: string, month: string, games: ArchivedGame[]): void {
    try {
      const cache: ChesscomCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"entries":{}}');
      const key = getCacheKey(username, month);
      
      const entry: CachedChesscomGames = {
        username,
        month,
        games,
        cachedAt: Date.now(),
        lastAccessed: Date.now()
      };
      
      cache.entries[key] = entry;
      
      // Remove oldest entries if cache is full
      const entryKeys = Object.keys(cache.entries);
      if (entryKeys.length > MAX_CACHE_SIZE) {
        const sortedByAccess = entryKeys
          .map(key => ({ key, lastAccessed: cache.entries[key].lastAccessed }))
          .sort((a, b) => a.lastAccessed - b.lastAccessed);
        
        const toRemove = sortedByAccess.slice(0, entryKeys.length - MAX_CACHE_SIZE);
        toRemove.forEach(({ key }) => delete cache.entries[key]);
      }
      
      this.saveCache(cache);
    } catch (error) {
      console.error('Error saving chess.com cache:', error);
    }
  },

  // Remove specific entry from cache
  removeGames(username: string, month: string): void {
    try {
      const cache: ChesscomCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"entries":{}}');
      const key = getCacheKey(username, month);
      delete cache.entries[key];
      this.saveCache(cache);
    } catch (error) {
      console.error('Error removing chess.com cache entry:', error);
    }
  },

  // Get all cached entries
  getAllEntries(): CachedChesscomGames[] {
    try {
      const cache: ChesscomCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"entries":{}}');
      return Object.values(cache.entries)
        .filter(entry => {
          // Filter out expired entries
          const daysSinceCached = (Date.now() - entry.cachedAt) / (1000 * 60 * 60 * 24);
          return daysSinceCached <= CACHE_EXPIRY_DAYS;
        })
        .sort((a, b) => b.lastAccessed - a.lastAccessed);
    } catch (error) {
      console.error('Error getting cached chess.com entries:', error);
      return [];
    }
  },

  // Clear all cached entries
  clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('Error clearing chess.com cache:', error);
    }
  },

  // Get cache size
  getCacheSize(): number {
    try {
      const cache: ChesscomCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"entries":{}}');
      return Object.keys(cache.entries).length;
    } catch (error) {
      console.error('Error getting chess.com cache size:', error);
      return 0;
    }
  },

  // Helper to save cache to localStorage
  saveCache(cache: ChesscomCache): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
};
