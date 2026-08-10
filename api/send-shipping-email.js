// api/send-shipping-email.js — Correo de notificación de envío con número de guía
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { orderRef, customerEmail, customerName, carrier, trackingNumber, trackUrl, products } = req.body || {};
  if (!customerEmail || !carrier || !trackingNumber) {
    return res.status(400).json({ error: 'Faltan datos: customerEmail, carrier, trackingNumber' });
  }

  // URL de rastreo: usar la proporcionada o generar una por carrier
  const autoTrackUrls = {
    'DHL': `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${trackingNumber}`,
    'FedEx': `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    'Estafeta': `https://www.estafeta.com/Tracking/searchByGet?wayBillType=1&wayBill=${trackingNumber}`,
    'Redpack': `https://www.redpack.com.mx/es/rastreo/?guias=${trackingNumber}`,
    'Paquetexpress': `https://www.paquetexpress.com.mx/rastreo/${trackingNumber}`,
    'UPS': `https://www.ups.com/track?tracknum=${trackingNumber}`,
    'Correos de México': `https://www.correosdemexico.com.mx/SSLServicios/ConsultaCP/Rastreo.aspx`,
    'Sendex': `https://www.sendex.mx/rastreo?guia=${trackingNumber}`,
    'J&T Express': `https://www.jtexpressmexico.com/rastreo/?tracking=${trackingNumber}`,
  };

  const finalTrackUrl = trackUrl || autoTrackUrls[carrier] || null;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF0F5;font-family:'Arial',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF0F5;padding:40px 20px;">
    <tr><td>
      <table width="100%" style="max-width:580px;margin:0 auto;background:#FFFBFD;border-radius:24px;overflow:hidden;border:1.5px solid #F0C8DC;">

        <tr>
          <td style="background:#C06090;padding:32px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🎀</div>
            <div style="font-family:'Georgia',serif;font-size:26px;font-style:italic;color:#fff;font-weight:bold;">KroshaPatterns</div>
            <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px;">kroshapatterns.com</div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <h2 style="font-family:'Georgia',serif;font-size:22px;color:#3A1E2E;margin:0 0 8px;">
              ¡Tu pedido va en camino, ${customerName || 'amiga'}! 🚚
            </h2>
            <p style="font-size:14px;color:#7A4D65;line-height:1.7;margin:0 0 24px;">
              Tu pedido ha sido enviado. Aquí tienes tu información de rastreo.
            </p>

            <div style="background:#FFF0F5;border-radius:12px;padding:14px 18px;margin-bottom:20px;border:1px solid #F0C8DC;">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#B48EA8;font-weight:bold;">Número de pedido</span>
              <div style="font-size:18px;font-weight:bold;color:#C06090;margin-top:4px;">#${orderRef}</div>
            </div>

            ${products ? `<div style="background:#FFF8EC;border-radius:12px;padding:12px 16px;margin-bottom:20px;border:1px solid #F0E0C0;">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#B48EA8;font-weight:bold;">Productos</span>
              <div style="font-size:13px;color:#3A1E2E;margin-top:4px;">${products}</div>
            </div>` : ''}

            <div style="background:#D0E8FF;border-radius:16px;padding:20px;margin-bottom:24px;border:1.5px solid #93C5FD;text-align:center;">
              <div style="font-size:28px;margin-bottom:8px;">📦</div>
              <div style="font-size:13px;font-weight:700;color:#1a5fa6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Información de rastreo</div>
              <div style="font-size:15px;color:#3A1E2E;font-weight:700;margin-bottom:4px;">${carrier}</div>
              <div style="font-size:22px;font-weight:800;color:#1a5fa6;letter-spacing:.05em;margin-bottom:${finalTrackUrl ? '16px' : '0'};">${trackingNumber}</div>
              ${finalTrackUrl ? `<a href="${finalTrackUrl}" target="_blank"
                style="display:inline-block;background:#1a5fa6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-size:14px;font-weight:700;">
                🔍 Rastrear mi pedido
              </a>` : ''}
            </div>

            <p style="font-size:13px;color:#7A4D65;line-height:1.7;margin:0 0 20px;text-align:center;">
              ¿Tienes alguna duda sobre tu envío? ¡Escríbeme! 🎀
            </p>
            <div style="text-align:center;">
              <a href="https://www.instagram.com/kro_shaa/" style="display:inline-block;background:#C06090;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;margin:4px;">◎ @kro_shaa</a>
              <a href="mailto:kroshapatterns@gmail.com" style="display:inline-block;background:#3A1E2E;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;margin:4px;">✉ kroshapatterns@gmail.com</a>
            </div>
          </td>
        </tr>

        <tr>
          <td style="background:#F5D0E0;padding:20px;text-align:center;">
            <p style="font-size:12px;color:#8B3565;margin:0;">© 2026 KroshaPatterns · kroshapatterns.com</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'KroshaPatterns <hola@kroshapatterns.com>',
      to: customerEmail,
      subject: `🚚 Tu pedido #${orderRef} va en camino — ${carrier} ${trackingNumber}`,
      html: emailHtml,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-shipping-email]', e);
    return res.status(500).json({ error: e.message });
  }
}
