import { useState } from 'react';
import { Check, CreditCard, Crown, Zap, Shield, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { useToast } from '../components/Toast';
import { createCheckoutSession, createCustomerPortalSession } from '../lib/stripe';

interface Plan {
  id: string;
  name: string;
  price: number;
  yearlyPrice?: number;
  priceId?: string;
  features: string[];
  icon: React.ReactNode;
  popular?: boolean;
  color: string;
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: [
      '4 chess trees (5000 nodes each)',
      'Basic PGN import',
      'Tree analysis',
      'Share trees (read-only)',
      'Unlimited local storage'
    ],
    icon: <Users size={24} />,
    color: '#6b7280'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 3,
    yearlyPrice: 30,
    priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
    features: [
      'Unlimited chess trees',
      'Priority support',
      'Custom themes',
      'Collaborative editing',
    ],
    icon: <Crown size={24} />,
    popular: true,
    color: '#f50b0b'
  }
];

export default function Pricing() {
  const { user } = useAuth();
  const { isPro, loading } = useSubscription();
  const { error } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubscribe = async (plan: Plan) => {
    if (!user) {
      error('Please sign in to subscribe');
      return;
    }
    if (plan.id === 'free' || !plan.priceId) return;
    
    setSelectedPlan(plan.id);
    setIsProcessing(true);
    
    try {
      const { url } = await createCheckoutSession(plan.priceId, user.id);
      window.location.href = url;
    } catch (err) {
      error('Failed to start checkout. Please try again.');
    } finally {
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;
    try {
      const { url } = await createCustomerPortalSession(user.id);
      window.location.href = url;
    } catch (err) {
      error('Failed to open subscription portal. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="spinner" />
        <span className="text-muted">Loading pricing...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'white' }}>
          Choose Your Plan
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            style={{
              padding: '2rem',
              borderRadius: 'var(--radius-lg)',
              border: plan.popular ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
              backgroundColor: 'var(--panel-bg)',
              ...(plan.popular && { transform: 'scale(1.05)' })
            }}
          >
            {plan.popular && (
              <div style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'var(--accent-color)',
                color: 'white',
                padding: '0.25rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}>
                MOST POPULAR
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: `${plan.color}20`,
                color: plan.color
              }}>
                {plan.icon}
              </div>
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: plan.popular ? 'var(--accent-color)' : 'var(--text-main)' }}>
                  {plan.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 'bold', color: plan.popular ? 'var(--accent-color)' : 'var(--text-main)' }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/month</span>
                </div>
                {plan.yearlyPrice && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                      or ${plan.yearlyPrice}/year
                    </span>
                    <span style={{
                      fontSize: '0.8rem',
                      color: 'var(--accent-color)',
                      fontWeight: '500',
                      backgroundColor: 'rgba(225, 29, 72, 0.1)',
                      padding: '0.125rem 0.375rem',
                      borderRadius: '0.25rem'
                    }}>
                      Save 17%
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              {plan.features.map((feature, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                  color: 'var(--text-main)',
                  fontWeight: 'normal',
                  fontStyle: 'normal'
                }}>
                  <Check size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.95rem' }}>{feature}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                if (isPro() && plan.id === 'pro') {
                  handleManageSubscription();
                } else if (plan.id !== 'free') {
                  handleSubscribe(plan);
                }
              }}
              className={`btn ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', fontWeight: 'bold' }}
            >
              {isProcessing && selectedPlan === plan.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px' }} />
                  Processing...
                </div>
              ) : isPro() && plan.id === 'pro' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CreditCard size={16} />
                  Manage Subscription
                </div>
              ) : plan.id === 'free' ? (
                'Current Plan'
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={16} />
                  Upgrade to Pro
                </div>
              )}
            </button>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'var(--panel-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Shield size={24} color="var(--accent-color)" />
          <h3 style={{ margin: 0, color: 'var(--accent-color)' }}>30-Day Money Back Guarantee</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', margin: '0 auto', maxWidth: '600px' }}>
          Not satisfied with MyChessTree Pro? Get a full refund within 30 days, no questions asked.
        </p>
      </div>
    </div>
  );
}
