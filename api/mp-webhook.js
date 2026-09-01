// api/mp-webhook.js
// Mercado Pago IPN/Webhook — notificación de pago aprobado

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { MercadoPagoConfig, Payment } = await import('mercadopago');

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const topic = req.query.topic || req.body?.type;
    const id = req.query.id || req.body?.data?.id;

    if (topic !== 'payment' && req.body?.type !== 'payment') {
      return res.status(200).json({ ok: true });
    }

    if (!id) return res.status(200).json({ ok: true });

    const payment = new Payment(client);
    const paymentData = await payment.get({ id });

    if (paymentData.status !== 'approved') {
      return res.status(200).json({ ok: true, status: paymentData.status });
    }

    const ref = paymentData.external_reference;
    const payerEmail = paymentData.payer?.email;
    const payerName = paymentData.payer?.first_name || 'Cliente';
    const total = paymentData.transaction_amount;
    const currency = paymentData.currency_id || 'MXN';

    // Retrieve order items from Redis
    let orderData = null;
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const raw = await redis.get(`mp_order:${ref}`);
      if (raw) orderData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (kvErr) {
      console.error('Redis get error:', kvErr);
    }

    if (orderData) {
      // Full confirmation flow: ProtectCrochet access + download token + proper email
      await fetch('https://kroshapatterns.com/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: orderData.customerEmail || payerEmail,
          customerName: orderData.customerName || payerName,
          items: orderData.items,
          total,
          currency,
          payMethod: 'mercadopago',
          orderRef: ref,
          shippingAddress: orderData.shippingAddress || null,
          shippingRate: orderData.shippingRate || null,
          shippingPackage: orderData.shippingPackage || null,
        }),
      });
    } else {
      // Fallback: order not found in Redis, send manual alert
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      if (payerEmail) {
        await resend.emails.send({
          from: 'KroshaPatterns <hola@kroshapatterns.com>',
          to: payerEmail,
          subject: `🎀 ¡Pago confirmado! ${ref} — KroshaPatterns`,
          html: `<p>¡Hola ${payerName}! Tu pago de $${total} ${currency} fue aprobado. Ref: ${ref}</p>
                 <p>Estamos preparando tu acceso y te escribiremos en breve. ¿Dudas? <a href="mailto:hola@kroshapatterns.com">hola@kroshapatterns.com</a></p>`,
        });
      }

      await resend.emails.send({
        from: 'KroshaPatterns <hola@kroshapatterns.com>',
        to: 'kroshapatterns@gmail.com',
        subject: `⚠️ MP pago sin orden ${ref} — entrega manual requerida`,
        html: `<p>Pago MP aprobado pero no se encontraron los ítems en Redis.<br>
               Cliente: ${payerName} (${payerEmail})<br>
               Total: $${total} ${currency}<br>
               MP Payment ID: ${id}<br>
               Ref: ${ref}<br><br>
               <strong>Enviar acceso manualmente.</strong></p>`,
      });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('MP webhook error:', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
