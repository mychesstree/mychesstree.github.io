import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
}

interface GuestTree {
  id: string;
  title: string;
  color: 'white' | 'black';
  tree_data: TreeNode;
  created_at: string;
}

interface GuestReview {
  fen: string;
  tree_id: string;
  next_review_date: string;
  interval: number;
  ease_factor: number;
  repetitions: number;
}

interface AuthContextType {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  loginAsGuest: () => void;
  logoutGuest: () => void;
  saveGuestTree: (tree: GuestTree) => void;
  loadGuestTrees: () => GuestTree[];
  deleteGuestTree: (id: string) => void;
  getGuestTree: (id: string) => GuestTree | undefined;
  saveGuestReview: (review: GuestReview) => void;
  loadGuestReviews: (treeId: string) => GuestReview[];
  deleteGuestReviews: (treeId: string) => void;
  getGuestReview: (fen: string, treeId: string) => GuestReview | undefined;
}

const GUEST_TREES_KEY = 'mychesstree_guest_trees';
const GUEST_REVIEWS_KEY = 'mychesstree_guest_reviews';

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  isGuest: false, 
  loading: true,
  loginAsGuest: () => {},
  logoutGuest: () => {},
  saveGuestTree: () => {},
  loadGuestTrees: () => [],
  deleteGuestTree: () => {},
  getGuestTree: () => undefined,
  saveGuestReview: () => {},
  loadGuestReviews: () => [],
  deleteGuestReviews: () => {},
  getGuestReview: () => undefined,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loginAsGuest = useCallback(() => {
    setIsGuest(true);
  }, []);

  const logoutGuest = useCallback(() => {
    setIsGuest(false);
  }, []);

  const loadGuestTrees = useCallback((): GuestTree[] => {
    try {
      const data = localStorage.getItem(GUEST_TREES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }, []);

  const saveGuestTree = useCallback((tree: GuestTree) => {
    const trees = loadGuestTrees();
    const existingIndex = trees.findIndex(t => t.id === tree.id);
    if (existingIndex >= 0) {
      trees[existingIndex] = tree;
    } else {
      trees.push(tree);
    }
    localStorage.setItem(GUEST_TREES_KEY, JSON.stringify(trees));
  }, [loadGuestTrees]);

  const deleteGuestTree = useCallback((id: string) => {
    const trees = loadGuestTrees().filter(t => t.id !== id);
    localStorage.setItem(GUEST_TREES_KEY, JSON.stringify(trees));
  }, [loadGuestTrees]);

  const getGuestTree = useCallback((id: string): GuestTree | undefined => {
    return loadGuestTrees().find(t => t.id === id);
  }, [loadGuestTrees]);

  const loadGuestReviews = useCallback((treeId: string): GuestReview[] => {
    try {
      const data = localStorage.getItem(GUEST_REVIEWS_KEY);
      const allReviews = data ? JSON.parse(data) : [];
      return allReviews.filter((review: GuestReview) => review.tree_id === treeId);
    } catch {
      return [];
    }
  }, []);

  const saveGuestReview = useCallback((review: GuestReview) => {
    try {
      const data = localStorage.getItem(GUEST_REVIEWS_KEY);
      const allReviews = data ? JSON.parse(data) : [];
      const existingIndex = allReviews.findIndex(
        (r: GuestReview) => r.fen === review.fen && r.tree_id === review.tree_id
      );
      
      if (existingIndex >= 0) {
        allReviews[existingIndex] = review;
      } else {
        allReviews.push(review);
      }
      
      localStorage.setItem(GUEST_REVIEWS_KEY, JSON.stringify(allReviews));
    } catch (error) {
      console.error('Failed to save guest review:', error);
    }
  }, []);

  const deleteGuestReviews = useCallback((treeId: string) => {
    try {
      const data = localStorage.getItem(GUEST_REVIEWS_KEY);
      const allReviews = data ? JSON.parse(data) : [];
      const filteredReviews = allReviews.filter((review: GuestReview) => review.tree_id !== treeId);
      localStorage.setItem(GUEST_REVIEWS_KEY, JSON.stringify(filteredReviews));
    } catch (error) {
      console.error('Failed to delete guest reviews:', error);
    }
  }, []);

  const getGuestReview = useCallback((fen: string, treeId: string): GuestReview | undefined => {
    try {
      const data = localStorage.getItem(GUEST_REVIEWS_KEY);
      const allReviews = data ? JSON.parse(data) : [];
      return allReviews.find(
        (review: GuestReview) => review.fen === fen && review.tree_id === treeId
      );
    } catch {
      return undefined;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      isGuest, 
      loading, 
      loginAsGuest, 
      logoutGuest,
      saveGuestTree,
      loadGuestTrees,
      deleteGuestTree,
      getGuestTree,
      saveGuestReview,
      loadGuestReviews,
      deleteGuestReviews,
      getGuestReview,
    }}>
      {children}
    </AuthContext.Provider>
  );
};