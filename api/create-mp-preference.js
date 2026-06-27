// api/create-mp-preference.js
// Vercel Serverless Function — Mercado Pago Checkout Pro

function buildPaymentMethods(paymentType) {
  if (paymentType === 'oxxo') {
    // Allow only ticket (OXXO/cash) in Mexico
    return {
      excluded_payment_types: [
        { id: 'credit_card' },
        { id: 'debit_card' },
        { id: 'bank_transfer' },
        { id: 'atm' },
        { id: 'prepaid_card' },
        { id: 'digital_currency' },
        { id: 'digital_wallet' },
        { id: 'voucher_card' },
      ],
    };
  }
  if (paymentType === 'card') {
    // Exclude cash/ticket methods, allow only cards
    return {
      excluded_payment_types: [
        { id: 'ticket' },
        { id: 'atm' },
        { id: 'bank_transfer' },
      ],
      installments: 1,
    };
  }
  // Default: all methods
  return { excluded_payment_types: [], installments: 1 };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { MercadoPagoConfig, Preference } = await import('mercadopago');

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const { items, customerEmail, customerName, currency, paymentType } = req.body;

    if (!items?.length || !customerEmail) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const ref = `KP-${Date.now()}`;

    // Store order in Redis so the webhook can retrieve items and deliver patterns
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      await redis.set(`mp_order:${ref}`, JSON.stringify({
        items,
        customerEmail,
        customerName: customerName || 'Cliente',
        currency: currency || 'MXN',
        orderRef: ref,
      }), { ex: 60 * 60 * 24 * 7 });
    } catch (kvErr) {
      console.error('Redis store error (non-fatal):', kvErr);
    }

    const mpItems = items.map(item => ({
      id: String(item.id),
      title: item.title,
      description: item.title,
      quantity: item.qty || 1,
      unit_price: parseFloat(item.price),
      currency_id: currency || 'MXN',
    }));

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: mpItems,
        payer: {
          email: customerEmail,
          name: customerName || 'Cliente',
        },
        payment_methods: buildPaymentMethods(paymentType),
        back_urls: {
          success: 'https://kroshapatterns.com/krosha-checkout.html?status=success&method=mp',
          failure: 'https://kroshapatterns.com/krosha-checkout.html?status=failure',
          pending: 'https://kroshapatterns.com/krosha-checkout.html?status=pending',
        },
        auto_return: 'approved',
        statement_descriptor: 'KROSHAPATTERNS',
        external_reference: ref,
        notification_url: 'https://kroshapatterns.com/api/mp-webhook',
      },
    });

    const response = { preferenceId: result.id, initPoint: result.init_point, orderRef: ref };
    if (paymentType === 'oxxo') response.oxxoPoint = result.init_point;
    return res.status(200).json(response);

  } catch (err) {
    console.error('MP error:', err);
    return res.status(500).json({ error: err.message });
  }
}
