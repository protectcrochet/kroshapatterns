// api/create-mp-preference.js
// Vercel Serverless Function — Mercado Pago Checkout Pro

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

    const { items, customerEmail, customerName, currency } = req.body;

    if (!items?.length || !customerEmail) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Convert items to MP format
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
        payment_methods: {
          excluded_payment_types: [],
          installments: 1,
        },
        back_urls: {
          success: 'https://kroshapatterns.com/krosha-checkout.html?status=success&method=mp',
          failure: 'https://kroshapatterns.com/krosha-checkout.html?status=failure',
          pending: 'https://kroshapatterns.com/krosha-checkout.html?status=pending',
        },
        auto_return: 'approved',
        statement_descriptor: 'KROSHAPATTERNS',
        external_reference: `KP-${Date.now()}`,
        notification_url: 'https://kroshapatterns.com/api/mp-webhook',
      },
    });

    return res.status(200).json({
      preferenceId: result.id,
      initPoint: result.init_point,
    });

  } catch (err) {
    console.error('MP error:', err);
    return res.status(500).json({ error: err.message });
  }
}
