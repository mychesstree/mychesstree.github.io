import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Subscription {
  tier: 'free' | 'pro';
  max_trees: number;
  max_depth: number;
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
          // For guest users, provide unlimited tree creation and depth
          setSubscription({
            tier: 'free',
            max_trees: 999999, // Unlimited for guests
            max_depth: 999999, // Unlimited for guests
            tree_count: 0,
          });
          setLoading(false);
          return;
        }

        // Try RPC first
        let { data, error } = await supabase
          .rpc('get_user_subscription', { u_id: user.id })
          .single();

        if (error && error.code === 'PGRST202') {
          // RPC missing, try direct table queries as fallback
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('tier, stripe_customer_id, stripe_subscription_id')
            .eq('user_id', user.id)
            .maybeSingle();

          const { data: usageData } = await supabase
            .from('subscription_usage')
            .select('tree_count')
            .eq('user_id', user.id)
            .maybeSingle();

          const tier = subData?.tier || 'free';
          data = {
            tier,
            max_trees: tier === 'pro' ? 999999 : 10,
            max_depth: tier === 'pro' ? 36 : 24,
            tree_count: usageData?.tree_count || 0,
            stripe_customer_id: subData?.stripe_customer_id,
            stripe_subscription_id: subData?.stripe_subscription_id
          };
          error = null;
        }

        if (error) {
          console.error('Error fetching subscription:', error);
          // Fallback to free tier if RPC and tables fail
          setSubscription({
            tier: 'free',
            max_trees: 4,
            max_depth: 24,
            tree_count: 0,
          });
        } else {
          // Ensure max_depth is included in data from RPC if it's not already
          const subData = data as any;
          if (!subData.max_depth) {
            subData.max_depth = subData.tier === 'pro' ? 36 : 24;
          }
          setSubscription(subData as Subscription);
        }
      } catch (error) {
        console.error('Error in useSubscription:', error);
        setSubscription({
          tier: 'free',
          max_trees: 4,
          max_depth: 24,
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

  const canAddMove = (currentDepth: number) => {
    if (loading) return false;
    if (!subscription) return true;
    return currentDepth < subscription.max_depth;
  };

  const isPro = () => {
    return subscription?.tier === 'pro';
  };

  return { 
    subscription, 
    loading, 
    canCreateTree, 
    treesRemaining, 
    canAddMove,
    isPro 
  };
}
