import type { LichessStudy } from './pgnParser';

export interface CachedStudy extends LichessStudy {
  cachedAt: number;
  lastAccessed: number;
}

export interface StudyCache {
  studies: Record<string, CachedStudy>;
}

const CACHE_KEY = 'lichess_study_cache';
const MAX_CACHE_SIZE = 50; // Maximum number of studies to cache
const CACHE_EXPIRY_DAYS = 30; // Days before cache expires

export const studyCache = {
  // Get study from cache
  getStudy(studyId: string): CachedStudy | null {
    try {
      const cache: StudyCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"studies":{}}');
      const study = cache.studies[studyId];
      
      if (!study) return null;
      
      // Check if cache is expired
      const daysSinceCached = (Date.now() - study.cachedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceCached > CACHE_EXPIRY_DAYS) {
        this.removeStudy(studyId);
        return null;
      }
      
      // Update last accessed time
      study.lastAccessed = Date.now();
      this.saveCache(cache);
      
      return study;
    } catch (error) {
      console.error('Error reading study cache:', error);
      return null;
    }
  },

  // Save study to cache
  saveStudy(study: LichessStudy): void {
    try {
      const cache: StudyCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"studies":{}}');
      
      const cachedStudy: CachedStudy = {
        ...study,
        cachedAt: Date.now(),
        lastAccessed: Date.now()
      };
      
      cache.studies[study.id] = cachedStudy;
      
      // Remove oldest studies if cache is full
      const studyIds = Object.keys(cache.studies);
      if (studyIds.length > MAX_CACHE_SIZE) {
        const sortedByAccess = studyIds
          .map(id => ({ id, lastAccessed: cache.studies[id].lastAccessed }))
          .sort((a, b) => a.lastAccessed - b.lastAccessed);
        
        const toRemove = sortedByAccess.slice(0, studyIds.length - MAX_CACHE_SIZE);
        toRemove.forEach(({ id }) => delete cache.studies[id]);
      }
      
      this.saveCache(cache);
    } catch (error) {
      console.error('Error saving study cache:', error);
    }
  },

  // Remove specific study from cache
  removeStudy(studyId: string): void {
    try {
      const cache: StudyCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"studies":{}}');
      delete cache.studies[studyId];
      this.saveCache(cache);
    } catch (error) {
      console.error('Error removing study from cache:', error);
    }
  },

  // Get all cached studies
  getAllStudies(): CachedStudy[] {
    try {
      const cache: StudyCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"studies":{}}');
      return Object.values(cache.studies)
        .filter(study => {
          // Filter out expired studies
          const daysSinceCached = (Date.now() - study.cachedAt) / (1000 * 60 * 60 * 24);
          return daysSinceCached <= CACHE_EXPIRY_DAYS;
        })
        .sort((a, b) => b.lastAccessed - a.lastAccessed);
    } catch (error) {
      console.error('Error getting cached studies:', error);
      return [];
    }
  },

  // Clear all cached studies
  clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('Error clearing study cache:', error);
    }
  },

  // Get cache size
  getCacheSize(): number {
    try {
      const cache: StudyCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"studies":{}}');
      return Object.keys(cache.studies).length;
    } catch (error) {
      console.error('Error getting cache size:', error);
      return 0;
    }
  },

  // Helper to save cache to localStorage
  saveCache(cache: StudyCache): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
};
