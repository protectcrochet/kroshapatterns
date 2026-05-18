// api/send-confirmation.js
// Vercel Serverless Function — Email confirmación con Resend + token de descarga vía KV

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { customerEmail, customerName, items, total, currency, payMethod, orderRef } = req.body;

    if (!customerEmail || !items?.length) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const ref = orderRef || `KP-${Date.now().toString().slice(-6)}`;

    // ── Generate download token for digital items ──
    let downloadToken = null;
    let downloadPageUrl = null;
    const digitalItems = items.filter(i => i.protectUrl || i.pdfUrl);

    if (digitalItems.length > 0) {
      try {
        const { kv } = await import('@vercel/kv');
        const { randomBytes } = await import('crypto');
        downloadToken = 'kp_' + randomBytes(16).toString('hex');
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

        await kv.set(`dl:${downloadToken}`, {
          email: customerEmail,
          orderRef: ref,
          items: digitalItems.map(i => ({
            title: i.title,
            url: i.protectUrl || i.pdfUrl,
            type: i.protectUrl ? 'protect' : 'pdf',
          })),
          downloads: 0,
          maxDownloads: 15,
          expiresAt,
        }, { exat: Math.floor(expiresAt / 1000) });

        downloadPageUrl = `https://kroshapatterns.com/descargar.html?token=${downloadToken}`;
      } catch (kvErr) {
        console.error('KV token error (non-fatal):', kvErr);
      }
    }

    // ── Build items table for email ──
    const itemsHtml = items.map(i => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #F0C8DC;font-family:'Arial',sans-serif;font-size:14px;color:#3A1E2E;">
          ${i.title}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #F0C8DC;text-align:right;font-family:'Arial',sans-serif;font-size:14px;color:#C06090;font-weight:bold;">
          $${i.price} ${currency || 'MXN'}
        </td>
      </tr>`).join('');

    // ── Download section for email ──
    let deliverySection = '';
    if (downloadPageUrl) {
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;text-align:center;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:8px;">📦 Accede a tus patrones</div>
          <p style="font-size:13px;color:#7A4D65;margin:0 0 16px;">Tu enlace personal de descarga (válido 7 días):</p>
          <a href="${downloadPageUrl}" style="display:inline-block;background:#C06090;color:#fff;text-decoration:none;padding:14px 28px;border-radius:24px;font-size:14px;font-weight:bold;">
            🔐 Acceder a mis patrones
          </a>
          <p style="font-size:11px;color:#B48EA8;margin:12px 0 0;">¿No funciona el enlace? Escríbenos a hola@kroshapatterns.com 🎀</p>
        </div>`;
    } else if (digitalItems.length > 0) {
      // Fallback: show direct links if KV failed
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:12px;">📦 Accede a tus patrones</div>
          ${digitalItems.map(i => {
            const url = i.protectUrl || i.pdfUrl;
            const label = i.protectUrl ? '🔐 Acceder en ProtectCrochet' : '📥 Descargar PDF';
            return `<div style="margin-bottom:10px;">
              <div style="font-size:12px;color:#B48EA8;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${i.title}</div>
              <a href="${url}" style="display:inline-block;background:#C06090;color:#fff;text-decoration:none;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:bold;">${label}</a>
            </div>`;
          }).join('')}
          <p style="font-size:12px;color:#B48EA8;margin:12px 0 0;">¿No puedes acceder? Escríbenos a hola@kroshapatterns.com 🎀</p>
        </div>`;
    } else {
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:6px;">📦 Entrega de tu pedido</div>
          <p style="font-size:13px;color:#7A4D65;margin:0;">Recibirás instrucciones de envío por este correo en breve.</p>
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

        <!-- HEADER -->
        <tr>
          <td style="background:#C06090;padding:32px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🎀</div>
            <div style="font-family:'Georgia',serif;font-size:26px;font-style:italic;color:#fff;font-weight:bold;">KroshaPatterns</div>
            <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px;">kroshapatterns.com</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px;">
            <h2 style="font-family:'Georgia',serif;font-size:24px;color:#3A1E2E;margin:0 0 8px;">
              ¡Gracias por tu compra, ${customerName || 'amiga'}! 🎀
            </h2>
            <p style="font-size:14px;color:#7A4D65;line-height:1.7;margin:0 0 24px;">
              Tu pedido ha sido confirmado y procesado exitosamente.
              A continuación encontrarás los detalles de tu compra.
            </p>

            <!-- ORDER REF -->
            <div style="background:#FFF0F5;border-radius:12px;padding:14px 18px;margin-bottom:24px;border:1px solid #F0C8DC;">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#B48EA8;font-weight:bold;">Número de pedido</span>
              <div style="font-size:20px;font-weight:bold;color:#C06090;margin-top:4px;">#${ref}</div>
            </div>

            <!-- ITEMS -->
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

            <!-- PAYMENT METHOD -->
            <div style="background:#D4EFE3;border-radius:12px;padding:14px 18px;margin-bottom:24px;border:1px solid #b0ddc8;">
              <span style="font-size:13px;color:#2E7D52;font-weight:bold;">✅ Pago confirmado vía ${payMethod || 'Stripe'}</span>
            </div>

            <!-- DELIVERY -->
            ${deliverySection}

            <!-- SUPPORT -->
            <div style="text-align:center;padding:20px 0;">
              <p style="font-size:13px;color:#7A4D65;margin:0 0 12px;">¿Tienes alguna duda? ¡Escríbeme! 🎀</p>
              <a href="https://www.instagram.com/kro_shaa/" style="display:inline-block;background:#C06090;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;margin:4px;">◎ @kro_shaa</a>
              <a href="https://www.tiktok.com/@kroshard" style="display:inline-block;background:#3A1E2E;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;margin:4px;">♪ @kroshard</a>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
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

    // Send to customer
    await resend.emails.send({
      from: 'KroshaPatterns <hola@kroshapatterns.com>',
      to: customerEmail,
      subject: `🎀 ¡Pedido confirmado! #${ref} — KroshaPatterns`,
      html: emailHtml,
    });

    // Send copy to Jennyfer
    const needsManual = items.filter(i => !i.protectUrl && !i.pdfUrl);
    await resend.emails.send({
      from: 'KroshaPatterns <hola@kroshapatterns.com>',
      to: 'hola@kroshapatterns.com',
      subject: `🛍 Nuevo pedido #${ref} — $${total} ${currency} — ${customerEmail}`,
      html: `<p><strong>Nuevo pedido recibido:</strong></p>
        <p>Cliente: ${customerName} (${customerEmail})</p>
        <p>Total: $${total} ${currency}</p>
        <p>Método: ${payMethod}</p>
        <p>Productos: ${items.map(i => `${i.title}${i.protectUrl ? ' ✅ ProtectCrochet' : i.pdfUrl ? ' ✅ PDF' : ' ⚠️ SIN LINK'}`).join('<br>')}</p>
        ${needsManual.length ? `<p style="color:red;font-weight:bold;">⚠️ ESTOS PRODUCTOS NECESITAN ENTREGA MANUAL:<br>${needsManual.map(i => i.title).join('<br>')}</p>` : ''}
        ${downloadPageUrl ? `<p>🔐 Token de descarga: <a href="${downloadPageUrl}">${downloadPageUrl}</a></p>` : ''}
        <p>Ref: #${ref}</p>`,
    });

    return res.status(200).json({ success: true, orderRef: ref, downloadToken });

  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
