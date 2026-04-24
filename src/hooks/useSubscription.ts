import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Subscription {
  tier: 'free' | 'pro';
  max_trees: number;
  tree_count: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // For guest users, provide unlimited tree creation
          setSubscription({
            tier: 'free',
            max_trees: 999999, // Unlimited for guests
            tree_count: 0,
          });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .rpc('get_user_subscription', { u_id: user.id })
          .single();

        if (error) {
          console.error('Error fetching subscription:', error);
          // Fallback to free tier if RPC fails
          setSubscription({
            tier: 'free',
            max_trees: 4,
            tree_count: 0,
          });
        } else {
          setSubscription(data as Subscription);
        }
      } catch (error) {
        console.error('Error in useSubscription:', error);
        setSubscription({
          tier: 'free',
          max_trees: 4,
          tree_count: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();

    // Listen for auth changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          fetchSubscription();
        }
      }
    );

    return () => {
      authSubscription?.unsubscribe();
    };
  }, []);

  const canCreateTree = () => {
    if (loading) return false;
    if (!subscription) return true; // Default to allowing creation for safety
    return subscription.tree_count < subscription.max_trees;
  };

  const treesRemaining = () => {
    if (loading) return 0;
    if (!subscription) return 999999; // Default to unlimited for safety
    return Math.max(0, subscription.max_trees - subscription.tree_count);
  };

  const isPro = () => {
    return subscription?.tier === 'pro';
  };

  return { 
    subscription, 
    loading, 
    canCreateTree, 
    treesRemaining, 
    isPro 
  };
}
