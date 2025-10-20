import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// Tell Vercel to pass the raw request body (required for signature verification)
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY as string, {
  apiVersion: '2023-10-16',
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

async function buffer(req: VercelRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * POST /api/webhook
 * Stripe sends events here (live). We verify signatures using the raw body.
 *
 * ENV required:
 *  - STRIPE_RESTRICTED_KEY     (rk_live_...)
 *  - STRIPE_WEBHOOK_SECRET     (whsec_...)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    if (!endpointSecret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET env');
      return res.status(500).send('Webhook misconfigured');
    }

    const rawBody = await buffer(req);
    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err?.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle relevant events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // TODO: provision access, mark subscription active, send welcome email, etc.
        break;
      }
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        // TODO: persist subscription details/status
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        // TODO: confirm payment in your system
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('webhook handler error:', err?.message || err);
    return res.status(500).send('Internal Server Error');
  }
}
