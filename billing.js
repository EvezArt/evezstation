// billing.js — Stripe checkout + quota walls for all 6 APIs
// Requires: npm install stripe

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  octoklaw:     { name: 'OctoKlaw Pro',     price: 2900, freeLimit: 1000, priceId: process.env.STRIPE_OCTOKLAW_PRICE_ID },
  meshpulse:    { name: 'MeshPulse Pro',    price: 1900, freeLimit: 5,    priceId: process.env.STRIPE_MESHPULSE_PRICE_ID },
  quantumseal:  { name: 'QuantumSeal Pro',  price: 1500, freeLimit: 500,  priceId: process.env.STRIPE_QUANTUMSEAL_PRICE_ID },
  nexuslink:    { name: 'NexusLink Pro',    price: 1200, freeLimit: 100,  priceId: process.env.STRIPE_NEXUSLINK_PRICE_ID },
  spectrumscan: { name: 'SpectrumScan Pro', price: 2500, freeLimit: 200,  priceId: process.env.STRIPE_SPECTRUMSCAN_PRICE_ID },
  vortexq:      { name: 'VortexQ Pro',      price: 2000, freeLimit: 5000, priceId: process.env.STRIPE_VORTEXQ_PRICE_ID },
};

const APP_URL = process.env.APP_URL || 'https://evezstation.vercel.app';

const createCheckout = async (req, res) => {
  const { service } = req.params;
  const plan = PLANS[service];
  if (!plan) return res.status(404).json({ error: `Unknown service: ${service}` });
  if (!plan.priceId) return res.status(500).json({ error: `Stripe price not configured for ${service}` });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&service=${service}`,
      cancel_url:  `${APP_URL}/billing/cancel?service=${service}`,
      metadata: { service, userId: req.user?.id || req.ip },
      subscription_data: { metadata: { service } }
    });
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[STRIPE CHECKOUT]', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

const handleWebhook = (supabase) => async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature invalid' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { service, userId } = session.metadata || {};
      if (supabase && service && userId) {
        await supabase.schema('evezstation').from('user_subscriptions').upsert({
          user_id: userId, service, tier: 'pro',
          stripe_customer: session.customer, stripe_sub_id: session.subscription,
          active: true, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,service' });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      if (supabase && sub.metadata?.service) {
        await supabase.schema('evezstation').from('user_subscriptions')
          .update({ tier: 'free', active: false, updated_at: new Date().toISOString() })
          .eq('stripe_sub_id', sub.id);
      }
      break;
    }
  }
  return res.json({ received: true });
};

export const checkQuota = (service, supabase) => async (req, res, next) => {
  if (!supabase) return next();
  const userId = req.user?.id || req.ip;
  const plan = PLANS[service];
  if (!plan) return next();

  try {
    const { data: sub } = await supabase.schema('evezstation').from('user_subscriptions')
      .select('tier, active').eq('user_id', userId).eq('service', service).single();
    if (sub?.tier === 'pro' && sub?.active) return next();

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { count } = await supabase.schema('evezstation').from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('service', service)
      .gte('created_at', monthStart.toISOString());

    if ((count || 0) >= plan.freeLimit) {
      const checkout = await stripe.checkout.sessions.create({
        mode: 'subscription', payment_method_types: ['card'],
        line_items: [{ price: plan.priceId, quantity: 1 }],
        success_url: `${APP_URL}/billing/success?service=${service}`,
        cancel_url: `${APP_URL}/billing/cancel`,
        metadata: { service, userId }
      });
      return res.status(402).json({
        error: 'Free tier limit reached', service, limit: plan.freeLimit,
        used: count, upgradeUrl: checkout.url, plan: plan.name, price: `$${plan.price / 100}/mo`
      });
    }

    await supabase.schema('evezstation').from('api_usage').insert({
      user_id: userId, service, created_at: new Date().toISOString()
    }).catch(() => {});
    return next();
  } catch (err) {
    console.error('[QUOTA CHECK]', err.message);
    return next(); // fail open
  }
};

export const registerBillingRoutes = (app, supabase) => {
  app.post('/api/billing/checkout/:service', createCheckout);
  app.post('/api/billing/webhook', (req, res, next) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { req.rawBody = data; next(); });
  }, handleWebhook(supabase));
  app.get('/api/billing/plans', (req, res) => {
    const plans = Object.entries(PLANS).map(([svc, p]) => ({
      service: svc, name: p.name, price: `$${p.price / 100}/mo`, freeLimit: p.freeLimit
    }));
    res.json({ plans });
  });
  console.log('[EVEZ] Billing routes registered');
};

export { PLANS };
