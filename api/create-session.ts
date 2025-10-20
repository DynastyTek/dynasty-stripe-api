import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY as string, {
  apiVersion: '2023-10-16',
});

/**
 * POST /api/create-session
 * Body JSON: { priceId: string, quantity?: number, customerEmail?: string, successUrl?: string, cancelUrl?: string }
 * Returns: { url: string }  // Stripe Checkout URL
 *
 * ENV required:
 *  - STRIPE_RESTRICTED_KEY     (rk_live_... with scopes: Checkout Sessions: write; Prices: read; Products: read)
 *  - NEXT_PUBLIC_BASE_URL      (e.g., https://quant.yourdomain.com OR https://credit.yourdomain.com)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { priceId, quantity = 1, customerEmail, successUrl, cancelUrl } = (req.body || {}) as {
      priceId?: string;
      quantity?: number;
      customerEmail?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!priceId) return res.status(400).json({ error: 'Missing priceId' });

    // OPTIONAL: lock down allowed prices per brand
    // const ALLOWED = new Set(['price_live_quant_starter','price_live_quant_pro','price_live_credit_basic','price_live_credit_premium']);
    // if (!ALLOWED.has(priceId)) return res.status(400).json({ error: 'Invalid priceId' });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) return res.status(500).json({ error: 'Missing NEXT_PUBLIC_BASE_URL env' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: [{ price: String(priceId), quantity: Number(quantity) }],
      success_url: successUrl || `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${baseUrl}/pricing`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: false }
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('create-session error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
}
