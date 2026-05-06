// Database schema for subscriptions
// Run this SQL in your Supabase dashboard to set up the subscription system

export const SUBSCRIPTIONS_SCHEMA = `
-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create subscription_usage table for tracking tree limits
CREATE TABLE IF NOT EXISTS subscription_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tree_count INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to get user subscription info
CREATE OR REPLACE FUNCTION get_user_subscription(u_id UUID)
RETURNS TABLE(
  tier TEXT,
  max_trees INTEGER,
  max_depth INTEGER,
  tree_count INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(s.tier, 'free') as tier,
    CASE 
      WHEN COALESCE(s.tier, 'free') = 'pro' THEN 999999
      ELSE 4
    END as max_trees,
    CASE 
      WHEN COALESCE(s.tier, 'free') = 'pro' THEN 36
      ELSE 24
    END as max_depth,
    COALESCE(su.tree_count, 0) as tree_count,
    s.stripe_customer_id,
    s.stripe_subscription_id
  FROM auth.users u
  LEFT JOIN subscriptions s ON u.id = s.user_id
  LEFT JOIN subscription_usage su ON u.id = su.user_id
  WHERE u.id = u_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create or update subscription
CREATE OR REPLACE FUNCTION upsert_subscription(
  u_id UUID,
  p_tier TEXT,
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_stripe_price_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_current_period_start TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  sub_id UUID;
BEGIN
  INSERT INTO subscriptions (
    user_id, tier, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, status, current_period_start, current_period_end,
    cancel_at_period_end
  ) VALUES (
    u_id, p_tier, p_stripe_customer_id, p_stripe_subscription_id,
    p_stripe_price_id, p_status, p_current_period_start, p_current_period_end,
    p_cancel_at_period_end
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    updated_at = NOW()
  RETURNING id INTO sub_id;
  
  RETURN sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update tree count
CREATE OR REPLACE FUNCTION update_tree_count(u_id UUID, delta INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO subscription_usage (user_id, tree_count)
  VALUES (u_id, delta)
  ON CONFLICT (user_id) DO UPDATE SET
    tree_count = subscription_usage.tree_count + delta,
    updated_at = NOW()
  RETURNING tree_count INTO new_count;
  
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_usage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription" ON subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own usage" ON subscription_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON subscription_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON subscription_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_user_id ON subscription_usage(user_id);
`;
