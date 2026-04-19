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
}

const GUEST_TREES_KEY = 'mychesstree_guest_trees';

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
    }}>
      {children}
    </AuthContext.Provider>
  );
};