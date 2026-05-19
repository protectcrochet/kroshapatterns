// api/mp-webhook.js
// Mercado Pago IPN/Webhook — notificación de pago aprobado

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const { Resend } = await import('resend');

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    // MP sends either query param or body
    const topic = req.query.topic || req.body?.type;
    const id = req.query.id || req.body?.data?.id;

    // Only process payment notifications
    if (topic !== 'payment' && req.body?.type !== 'payment') {
      return res.status(200).json({ ok: true });
    }

    if (!id) return res.status(200).json({ ok: true });

    // Fetch payment details from MP
    const payment = new Payment(client);
    const paymentData = await payment.get({ id });

    if (paymentData.status !== 'approved') {
      return res.status(200).json({ ok: true, status: paymentData.status });
    }

    // Payment approved — send confirmation email
    const resend = new Resend(process.env.RESEND_API_KEY);
    const ref = paymentData.external_reference || `KP-${Date.now().toString().slice(-6)}`;
    const email = paymentData.payer?.email;
    const name = paymentData.payer?.first_name || 'Cliente';
    const total = paymentData.transaction_amount;
    const currency = paymentData.currency_id || 'MXN';

    if (email) {
      await resend.emails.send({
        from: 'KroshaPatterns <hola@kroshapatterns.com>',
        to: email,
        subject: `🎀 ¡Pago confirmado! ${ref} — KroshaPatterns`,
        html: `<p>¡Hola ${name}! Tu pago de $${total} ${currency} fue aprobado. Ref: ${ref}</p>
               <p>Recibirás tus patrones en breve. ¿Dudas? Escríbenos a hola@kroshapatterns.com</p>`,
      });

      await resend.emails.send({
        from: 'KroshaPatterns <hola@kroshapatterns.com>',
        to: 'hola@kroshapatterns.com',
        subject: `🏪 MP Pago aprobado ${ref} — $${total} ${currency} — ${email}`,
        html: `<p>Pago Mercado Pago aprobado.<br>
               Cliente: ${name} (${email})<br>
               Total: $${total} ${currency}<br>
               MP Payment ID: ${id}<br>
               Ref: ${ref}</p>`,
      });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('MP webhook error:', err);
    // Always return 200 to MP so it doesn't retry infinitely
    return res.status(200).json({ ok: false, error: err.message });
  }
}
