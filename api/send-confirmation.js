// api/send-confirmation.js
// Vercel Serverless Function — Email confirmación + llamada API ProtectCrochet

async function callProtectCrochet(buyerEmail, customerName, patternSlug, orderRef) {
  const res = await fetch(
    `https://patrones.protectcrochet.com/api/external/${process.env.PC_DESIGNER_ID}/order-paid`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.PC_API_KEY,
      },
      body: JSON.stringify({
        buyer_email: buyerEmail,
        pattern_slug: patternSlug,
        order_id: orderRef,
        customer_name: customerName,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'ProtectCrochet API error');
  return data.access_url;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { customerEmail, customerName, items, total, currency, payMethod, orderRef, shippingAddress } = req.body;

    if (!customerEmail || !items?.length) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const ref = orderRef || `KP-${Date.now().toString().slice(-6)}`;

    // ── Resolver URLs de entrega por item ──
    const resolvedItems = await Promise.all(items.map(async (item) => {
      if (item.patternSlug) {
        try {
          const accessUrl = await callProtectCrochet(customerEmail, customerName, item.patternSlug, ref);
          return { ...item, resolvedUrl: accessUrl, deliveryType: 'protect' };
        } catch (e) {
          console.error(`PC API error for "${item.title}":`, e.message);
          return { ...item, resolvedUrl: null, deliveryType: 'manual' };
        }
      } else if (item.pdfUrl) {
        return { ...item, resolvedUrl: item.pdfUrl, deliveryType: 'pdf' };
      }
      return { ...item, resolvedUrl: null, deliveryType: 'manual' };
    }));

    // ── Token Upstash para PDFs (ProtectCrochet ya manda su propio correo) ──
    let downloadToken = null;
    const pdfItems = resolvedItems.filter(i => i.deliveryType === 'pdf');

    if (pdfItems.length > 0) {
      try {
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        const { randomBytes } = await import('crypto');
        downloadToken = 'kp_' + randomBytes(16).toString('hex');

        await redis.set(`dl:${downloadToken}`, {
          email: customerEmail,
          orderRef: ref,
          items: pdfItems.map(i => ({ title: i.title, url: i.resolvedUrl, type: 'pdf' })),
        });
      } catch (kvErr) {
        console.error('KV token error (non-fatal):', kvErr);
      }
    }

    // ── Build items table ──
    const itemsHtml = items.map(i => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #F0C8DC;font-family:'Arial',sans-serif;font-size:14px;color:#3A1E2E;">
          ${i.title}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #F0C8DC;text-align:right;font-family:'Arial',sans-serif;font-size:14px;color:#C06090;font-weight:bold;">
          $${i.price} ${currency || 'MXN'}
        </td>
      </tr>`).join('');

    // ── Sección de entrega en el correo ──
    const pcItems = resolvedItems.filter(i => i.deliveryType === 'protect');
    const manualItems = resolvedItems.filter(i => i.deliveryType === 'manual');

    let deliverySection = '';

    if (pcItems.length > 0 && pdfItems.length === 0) {
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;text-align:center;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:8px;">📦 Acceso a tus patrones</div>
          <p style="font-size:13px;color:#7A4D65;margin:0;">Recibirás un correo de <strong>acceso@protectcrochet.com</strong> con tu link de acceso personalizado. Si no lo ves en 5 minutos, revisa tu carpeta de spam.</p>
        </div>`;
    } else if (pdfItems.length > 0 && downloadToken) {
      const downloadUrl = `https://kroshapatterns.com/descargar.html?token=${downloadToken}`;
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;text-align:center;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:8px;">📦 Descarga tus patrones</div>
          <a href="${downloadUrl}" style="display:inline-block;background:#C06090;color:#fff;text-decoration:none;padding:14px 28px;border-radius:24px;font-size:14px;font-weight:bold;">
            📥 Descargar mis patrones
          </a>
          ${pcItems.length > 0 ? `<p style="font-size:12px;color:#7A4D65;margin:12px 0 0;">Los patrones de ProtectCrochet llegarán por separado a tu correo desde acceso@protectcrochet.com.</p>` : ''}
          <p style="font-size:11px;color:#B48EA8;margin:8px 0 0;">¿No funciona? Escríbenos a hola@kroshapatterns.com 🎀</p>
        </div>`;
    } else {
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:6px;">📦 Entrega de tu pedido</div>
          <p style="font-size:13px;color:#7A4D65;margin:0;">Recibirás tu acceso por correo en breve. ¿Dudas? Escríbenos a hola@kroshapatterns.com</p>
        </div>`;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF0F5;font-family:'Arial',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF0F5;padding:40px 20px;">
    <tr><td>
      <table width="100%" maxwidth="580" style="max-width:580px;margin:0 auto;background:#FFFBFD;border-radius:24px;overflow:hidden;border:1.5px solid #F0C8DC;">

        <tr>
          <td style="background:#C06090;padding:32px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🎀</div>
            <div style="font-family:'Georgia',serif;font-size:26px;font-style:italic;color:#fff;font-weight:bold;">KroshaPatterns</div>
            <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px;">kroshapatterns.com</div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <h2 style="font-family:'Georgia',serif;font-size:24px;color:#3A1E2E;margin:0 0 8px;">
              ¡Gracias por tu compra, ${customerName || 'amiga'}! 🎀
            </h2>
            <p style="font-size:14px;color:#7A4D65;line-height:1.7;margin:0 0 24px;">
              Tu pedido ha sido confirmado y procesado exitosamente.
            </p>

            <div style="background:#FFF0F5;border-radius:12px;padding:14px 18px;margin-bottom:24px;border:1px solid #F0C8DC;">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#B48EA8;font-weight:bold;">Número de pedido</span>
              <div style="font-size:20px;font-weight:bold;color:#C06090;margin-top:4px;">#${ref}</div>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#B48EA8;font-weight:bold;padding-bottom:8px;">Productos</td>
                <td style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#B48EA8;font-weight:bold;padding-bottom:8px;text-align:right;">Precio</td>
              </tr>
              ${itemsHtml}
              <tr>
                <td style="padding:14px 0 0;font-size:16px;font-weight:bold;color:#3A1E2E;">Total</td>
                <td style="padding:14px 0 0;font-size:20px;font-weight:bold;color:#C06090;text-align:right;">$${total} ${currency || 'MXN'}</td>
              </tr>
            </table>

            <div style="background:#D4EFE3;border-radius:12px;padding:14px 18px;margin-bottom:24px;border:1px solid #b0ddc8;">
              <span style="font-size:13px;color:#2E7D52;font-weight:bold;">✅ Pago confirmado vía ${payMethod || 'Stripe'}</span>
            </div>

            ${deliverySection}

            <div style="text-align:center;padding:20px 0;">
              <p style="font-size:13px;color:#7A4D65;margin:0 0 12px;">¿Tienes alguna duda? ¡Escríbeme! 🎀</p>
              <a href="https://www.instagram.com/kro_shaa/" style="display:inline-block;background:#C06090;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;margin:4px;">◎ @kro_shaa</a>
              <a href="https://www.tiktok.com/@kroshard" style="display:inline-block;background:#3A1E2E;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;margin:4px;">♪ @kroshard</a>
            </div>
          </td>
        </tr>

        <tr>
          <td style="background:#F5D0E0;padding:20px;text-align:center;">
            <p style="font-size:12px;color:#8B3565;margin:0;">© 2026 KroshaPatterns · kroshapatterns.com</p>
            <p style="font-size:11px;color:#B48EA8;margin:4px 0 0;">Patrones de crochet con amor, diseñados por Jennyfer 🎀</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: 'KroshaPatterns <hola@kroshapatterns.com>',
      to: customerEmail,
      subject: `🎀 ¡Pedido confirmado! #${ref} — KroshaPatterns`,
      html: emailHtml,
    });

    // Guardar pedido en Redis para el admin
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const raw = await redis.get('krosha:orders');
      const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      if (!orders.find(o => o.ref === ref)) {
        orders.unshift({
          id: Date.now(),
          ref,
          date: new Date().toISOString(),
          name: customerName || '',
          email: customerEmail,
          products: items.map(i => i.title).join(', '),
          itemsRaw: items,
          total,
          currency: currency || 'MXN',
          method: payMethod || 'stripe',
          status: 'paid',
          shippingAddress: shippingAddress || null,
        });
        if (orders.length > 500) orders.length = 500;
        await redis.set('krosha:orders', JSON.stringify(orders));
      }
    } catch (redisErr) {
      console.error('Redis order save error (non-fatal):', redisErr);
    }

    // Copia a Jennyfer
    const needsManual = resolvedItems.filter(i => i.deliveryType === 'manual');
    await resend.emails.send({
      from: 'KroshaPatterns <hola@kroshapatterns.com>',
      to: 'kroshapatterns@gmail.com',
      subject: `🛍 Nuevo pedido #${ref} — $${total} ${currency} — ${customerEmail}`,
      html: `<p><strong>Nuevo pedido recibido:</strong></p>
        <p>Cliente: ${customerName} (${customerEmail})</p>
        <p>Total: $${total} ${currency}</p>
        <p>Método: ${payMethod}</p>
        <p>Productos:<br>${resolvedItems.map(i =>
          `${i.title} — ${i.deliveryType === 'protect' ? '✅ ProtectCrochet OK' : i.deliveryType === 'pdf' ? '✅ PDF' : '⚠️ ENTREGA MANUAL'}`
        ).join('<br>')}</p>
        ${needsManual.length ? `<p style="color:red;font-weight:bold;">⚠️ ENTREGA MANUAL REQUERIDA:<br>${needsManual.map(i => i.title).join('<br>')}</p>` : ''}
        <p>Ref: #${ref}</p>`,
    });

    return res.status(200).json({ success: true, orderRef: ref, downloadToken });

  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
