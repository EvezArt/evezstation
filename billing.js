// billing.js — Stripe billing for all 6 EVEZ APIs (ESM)
// Import: import { registerBillingRoutes, checkQuota, PLANS } from './billing.js';

const PLANS = {
  octoklaw:     { name: 'OctoKlaw Pro',     price: 2900, freeLimit: 1000, priceId: process.env.STRIPE_OCTOKLAW_PRICE_ID },
  meshpulse:    { name: 'MeshPulse Pro',     price: 1900, freeLimit: 5,    priceId: process.env.STRIPE_MESHPULSE_PRICE_ID },
  quantumseal:  { name: 'QuantumSeal Pro',   price: 1500, freeLimit: 500,  priceId: process.env.STRIPE_QUANTUMSEAL_PRICE_ID },
  nexuslink:    { name: 'NexusLink Pro',     price: 1200, freeLimit: 100,  priceId: process.env.STRIPE_NEXUSLINK_PRICE_ID },
  spectrumscan: { name: 'SpectrumScan Pro',  price: 2500, freeLimit: 200,  priceId: process.env.STRIPE_SPECTRUMSCAN_PRICE_ID },
  vortexq:      { name: 'VortexQ Pro',       price: 2000, freeLimit: 5000, priceId: process.env.STRIPE_VORTEXQ_PRICE_ID },
};

export { PLANS };

let stripe = null;
const getStripe = async () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default;
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    } catch {
      console.warn('[BILLING] stripe package not installed');
    }
  }
  return stripe;
};

const createCheckout = async (req, res) => {
  const s = await getStripe();
  if (!s) return res.status(503).json({ error: 'Billing not configured' });

  const { service } = req.params;
  const plan = PLANS[service];
  if (!plan) return res.status(404).json({ error: `Unknown service: ${service}` });
  if (!plan.priceId) return res.status(500).json({ error: `Price not configured for ${service}` });

  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL || 'https://evezstation.vercel.app'}/billing/success?session_id={CHECKOUT_SESSION_ID}&service=${service}`,
      cancel_url: `${process.env.APP_URL || 'https://evezstation.vercel.app'}/billing/cancel?service=${service}`,
      metadata: { service, userId: req.user?.id || req.ip }
    });
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[STRIPE]', err.message);
    return res.status(500).json({ error: 'Checkout failed' });
  }
};

export const checkQuota = (service, supabase) => async (req, res, next) => {
  const s = await getStripe();
  if (!supabase || !s) return next();

  const userId = req.user?.id || req.ip;
  const plan = PLANS[service];
  if (!plan) return next();

  try {
    const { data: sub } = await supabase.schema('evezstation')
      .from('user_subscriptions')
      .select('tier, active')
      .eq('user_id', userId)
      .eq('service', service)
      .single();

    if (sub?.tier === 'pro' && sub?.active) return next();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabase.schema('evezstation')
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('service', service)
      .gte('created_at', monthStart.toISOString());

    if ((count || 0) >= plan.freeLimit) {
      return res.status(402).json({
        error: 'Free tier limit reached',
        service,
        limit: plan.freeLimit,
        used: count,
        plan: plan.name,
        price: `$${plan.price / 100}/mo`,
        upgradeUrl: `${process.env.APP_URL || 'https://evezstation.vercel.app'}/api/billing/checkout/${service}`
      });
    }

    await supabase.schema('evezstation').from('api_usage').insert({
      user_id: userId, service, created_at: new Date().toISOString()
    }).catch(() => {});

    return next();
  } catch (err) {
    console.error('[QUOTA]', err.message);
    return next();
  }
};

export const registerBillingRoutes = (app, supabase) => {
  app.post('/api/billing/checkout/:service', createCheckout);

  app.get('/api/billing/plans', (req, res) => {
    const plans = Object.entries(PLANS).map(([service, p]) => ({
      service, name: p.name, price: `$${p.price / 100}/mo`, freeLimit: p.freeLimit,
    }));
    res.json({ plans });
  });

  console.log('[EVEZ] Billing routes registered');
};
