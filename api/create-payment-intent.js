// api/create-payment-intent.js
// Vercel Serverless Function — Stripe

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { amount, currency, items, customerEmail, customerName } = req.body;

    if (!amount || !currency || !customerEmail) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Currencies supported by Stripe (zero-decimal currencies need no *100)
    const stripeSupported = ['mxn','usd','eur','dop','cad','gbp','ars','brl','cop','clp','pen','uyu','gtq','hnl','nio','crc'];
    const zeroDecimal = ['clp','jpy','krw','pyg'];
    let cur = currency.toLowerCase();
    // Fall back to MXN for unsupported currencies — prices are stored in MXN
    if (!stripeSupported.includes(cur)) cur = 'mxn';

    // Amount in smallest unit (cents), zero-decimal currencies stay as-is
    const amountInCents = zeroDecimal.includes(cur) ? Math.round(amount) : Math.round(amount * 100);

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: cur,
      receipt_email: customerEmail,
      metadata: {
        customerName: customerName || 'Cliente',
        items: JSON.stringify(items?.map(i => i.title) || []),
        store: 'KroshaPatterns',
      },
      description: `KroshaPatterns — ${items?.map(i => i.title).join(', ') || 'Patrones de Crochet'}`,
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
