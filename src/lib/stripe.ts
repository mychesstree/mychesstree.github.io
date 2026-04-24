import { supabase } from './supabase'

export async function createCheckoutSession(priceId: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { priceId, userId },
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createCustomerPortalSession(userId: string) {
  const { data, error } = await supabase.functions.invoke('create-customer-portal-session', {
    body: { userId },
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}
