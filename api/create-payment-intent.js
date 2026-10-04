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

    const { amount, items, customerEmail, customerName } = req.body;

    if (!amount || !customerEmail) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Always charge in MXN so Stripe never does the currency conversion.
    // The customer's bank converts from their local currency to MXN, ensuring
    // you always receive exactly the listed MXN price (no Stripe FX spread).
    const cur = 'mxn';

    // Amount in smallest unit (centavos)
    const amountInCents = Math.round(amount * 100);

    // Stripe minimum for MXN is $10.00 MXN = 1000 centavos
    const finalAmount = Math.max(amountInCents, 1000);

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
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
