import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface Subscription {
  tier: 'free' | 'pro';
  max_trees: number;
  max_depth: number;
  tree_count: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

const FREE_LIMITS = { max_trees: 4, max_depth: 24 };
const PRO_LIMITS  = { max_trees: 9, max_depth: 99999 };
// Trees stored locally (is_local=true or guest) get effectively unlimited depth
export const LOCAL_DEPTH_LIMIT = 999;

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Guest — unlimited creation (localStorage), no cloud limits apply
        setSubscription({
          tier: 'free',
          max_trees: 999999,
          max_depth: LOCAL_DEPTH_LIMIT,
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
        // RPC missing — direct table fallback
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('tier, stripe_customer_id, stripe_subscription_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        const { data: usageData } = await supabase
          .from('subscription_usage')
          .select('tree_count')
          .eq('user_id', user.id)
          .maybeSingle();

        const tier = (subData?.tier || 'free') as 'free' | 'pro';
        const limits = tier === 'pro' ? PRO_LIMITS : FREE_LIMITS;
        data = {
          tier,
          ...limits,
          tree_count: usageData?.tree_count || 0,
          stripe_customer_id: subData?.stripe_customer_id,
          stripe_subscription_id: subData?.stripe_subscription_id,
        };
        error = null;
      }

      if (error) {
        console.error('Error fetching subscription:', error);
        setSubscription({ tier: 'free', ...FREE_LIMITS, tree_count: 0 });
      } else {
        const sub = data as any;
        // Ensure max_depth is always set
        if (!sub.max_depth) {
          sub.max_depth = sub.tier === 'pro' ? PRO_LIMITS.max_depth : FREE_LIMITS.max_depth;
        }
        setSubscription(sub as Subscription);
      }
    } catch (err) {
      console.error('Error in useSubscription:', err);
      setSubscription({ tier: 'free', ...FREE_LIMITS, tree_count: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          fetchSubscription();
        }
      }
    );

    return () => authSub?.unsubscribe();
  }, [fetchSubscription]);

  // Expose refresh so callers can re-fetch after tree creation or pro upgrade
  const refreshSubscription = useCallback(() => {
    setLoading(true);
    fetchSubscription();
  }, [fetchSubscription]);

  /**
   * Can the user create a new cloud tree?
   * Always true for guest (local only) and local-mode trees.
   */
  const canCreateTree = useCallback(() => {
    if (loading) return false;
    if (!subscription) return true;
    return subscription.tree_count < subscription.max_trees;
  }, [loading, subscription]);

  const treesRemaining = useCallback(() => {
    if (loading) return 0;
    if (!subscription) return 999999;
    return Math.max(0, subscription.max_trees - subscription.tree_count);
  }, [loading, subscription]);

  /**
   * Can a move be added at this depth?
   * @param currentDepth - depth of the parent node
   * @param isLocal - whether the tree is in local mode (unlimited depth)
   */
  const canAddMove = useCallback((currentDepth: number, isLocal = false) => {
    if (loading) return false;
    if (isLocal) return currentDepth < LOCAL_DEPTH_LIMIT;
    if (!subscription) return true;
    return currentDepth < subscription.max_depth;
  }, [loading, subscription]);

  const isPro = useCallback(() => subscription?.tier === 'pro', [subscription]);

  return {
    subscription,
    loading,
    canCreateTree,
    treesRemaining,
    canAddMove,
    isPro,
    refreshSubscription,
  };
}
