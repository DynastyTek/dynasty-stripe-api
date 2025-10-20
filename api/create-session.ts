import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY as string, {
  apiVersion: '2023-10-16',
});

/**
 * POST /api/create-session
 * Body JSON: { priceId: string, brand?: 'quant' | 'credit', quantity?: number, customerEmail?: string, successUrl?: string, cancelUrl?: string }
 * Returns: { url: string }
 *
 * ENV:
 *  - STRIPE_RESTRICTED_KEY       (rk_live_... with minimal scopes)
 *  - NEXT_PUBLIC_BASE_URL_QUANT  (https://quant.yourdomain.com)
 *  - NEXT_PUBLIC_BASE_URL_CREDIT (https://credit.yourdomain.com)
 */

// ✅ brand-scoped allow-lists (replace with your real live Price IDs)
const ALLOWLIST: Record<string, Set<string>> = {
  quant: new Set([
    'price_live_quant_starter',
    'price_live_quant_pro',
  ]),
  credit: new Set([
    'price_live_credit_basic',
    'price_live_credit_premium',
  ]),
};

// choose base URL by brand; fall back to generic NEXT_PUBLIC_BASE_URL if you prefer a single site
function getBaseUrl(brand?: string): string | undefined {
  if (brand === 'credit') return process.env.NEXT_PUBLIC_BASE_URL_CREDIT;
  if (brand === 'quant') return process.env.NEXT_PUBLIC_BASE_URL_QUANT;
  return process.env.NEXT_PUBLIC_BASE_URL; // optional fallback
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      priceId,
      brand = 'quant',
      quantity = 1,
      customerEmail,
      successUrl,
      cancelUrl,
    } = (req.body || {}) as {
      priceId?: string;
      brand?: 'quant' | 'credit';
      quantity?: number;
      customerEmail?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!priceId) return res.status(400).json({ error: 'Missing priceId' });
    if (!ALLOWLIST[brand]?.has(priceId)) {
      return res.status(400).json({ error: `Invalid priceId for brand ${brand}` });
    }

    const baseUrl = getBaseUrl(brand);
    if (!baseUrl) return res.status(500).json({ error: 'Missing BASE_URL env for brand' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: [{ price: String(priceId), quantity: Number(quantity) }],
      success_url: successUrl || `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${baseUrl}/pricing`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('create-session error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
}
