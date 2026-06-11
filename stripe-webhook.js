// Stripe Webhook - サブスクリプション状態をSupabaseに同期

import Stripe from 'stripe';

export const config = {
  api: { bodyParser: false },
  maxDuration: 10,
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const upsertSub = async (stripeCustomerId, status, plan, stripeSubId) => {
    // stripe_customer_idからuser_idを取得
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${stripeCustomerId}&select=user_id`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const profiles = await profileRes.json();
    if (!profiles.length) return;
    const userId = profiles[0].user_id;

    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        stripe_subscription_id: stripeSubId,
        stripe_customer_id: stripeCustomerId,
        status,
        plan,
        updated_at: new Date().toISOString(),
      }),
    });
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        await upsertSub(session.customer, 'active', sub.items.data[0].price.lookup_key || 'monthly', sub.id);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status === 'active' ? 'active' : sub.status;
        await upsertSub(sub.customer, status, sub.items.data[0].price.lookup_key || 'monthly', sub.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await upsertSub(sub.customer, 'cancelled', null, sub.id);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object;
        await upsertSub(inv.customer, 'past_due', null, inv.subscription);
        break;
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
