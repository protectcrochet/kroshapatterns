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

    const { customerEmail, customerName, items, total, currency, payMethod, orderRef, shippingAddress, shippingRate, shippingPackage, forceResend } = req.body;

    if (!customerEmail || !items?.length) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const ref = orderRef || `KP-${Date.now().toString().slice(-6)}`;

    // ── Dedup: si el pedido ya existe en Redis, no reenviar correo ──
    // forceResend=true lo salta (usado desde el admin para reenviar acceso)
    if (orderRef && !forceResend) {
      try {
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
        const raw = await redis.get('krosha:orders');
        const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
        if (orders.find(o => o.ref === ref)) {
          console.log(`Dedup: pedido ${ref} ya procesado, omitiendo correo.`);
          return res.status(200).json({ success: true, orderRef: ref, duplicate: true });
        }
      } catch (e) { /* no bloquear si Redis falla */ }
    }

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

    // ── PDFs y ProtectCrochet ──
    const pdfItems = resolvedItems.filter(i => i.deliveryType === 'pdf');
    const pcItems = resolvedItems.filter(i => i.deliveryType === 'protect');

    // Descargar PDFs para adjuntar al correo
    const attachments = [];
    for (const item of pdfItems) {
      if (!item.resolvedUrl) continue;
      try {
        const pdfRes = await fetch(item.resolvedUrl);
        if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status}`);
        const buf = await pdfRes.arrayBuffer();
        const filename = (item.title || 'patron')
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9\s]/g, '').trim()
          .replace(/\s+/g, '_') + '.pdf';
        attachments.push({ filename, content: Buffer.from(buf).toString('base64') });
      } catch (e) {
        console.error(`Error adjuntando PDF "${item.title}":`, e.message);
      }
    }

    // Token backup (para ProtectCrochet y como respaldo si falla adjunto)
    let downloadToken = null;
    const tokenItems = [
      ...pdfItems.map(i => ({ title: i.title, url: i.resolvedUrl, type: 'pdf' })),
      ...pcItems.filter(i => i.resolvedUrl).map(i => ({ title: i.title, url: i.resolvedUrl, type: 'protect' })),
    ];
    if (tokenItems.length > 0) {
      try {
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        const { randomBytes } = await import('crypto');
        downloadToken = 'kp_' + randomBytes(16).toString('hex');
        await redis.set(`dl:${downloadToken}`, { email: customerEmail, orderRef: ref, items: tokenItems });
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
    const manualItems = resolvedItems.filter(i => i.deliveryType === 'manual' && i.title !== 'Envío' && i.title !== 'Shipping');

    let deliverySection = '';
    const hasPdfAttachments = attachments.length > 0;
    const hasPcItems = pcItems.length > 0;

    if (hasPdfAttachments || hasPcItems) {
      const attachedList = attachments.map(a =>
        `<div style="margin:6px 0;font-size:13px;color:#3A1E2E;">📎 ${a.filename.replace(/_/g,' ').replace('.pdf','')}</div>`
      ).join('');

      // PC siempre muestra mensaje de correo desde ProtectCrochet (no link directo)
      const pcList = pcItems.map(i =>
        `<div style="margin:6px 0;font-size:13px;color:#7A4D65;">🔐 <strong>${i.title}</strong> — recibirás tu acceso por correo desde <strong>acceso@protectcrochet.com</strong></div>`
      ).join('');

      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;text-align:center;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:12px;">🎀 Tus patrones</div>
          ${hasPdfAttachments ? `<div style="font-size:13px;color:#7A4D65;margin-bottom:10px;">Tu patrón viene adjunto en este correo 📎</div>${attachedList}` : ''}
          ${pcList}
          <p style="font-size:11px;color:#B48EA8;margin:12px 0 0;">¿Problemas? Escríbenos a kroshapatterns@gmail.com 🎀</p>
        </div>`;
    } else if (pcItems.length > 0) {
      // fallback (no debería llegar aquí)
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;text-align:center;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:8px;">📦 Acceso a tus patrones</div>
          <p style="font-size:13px;color:#7A4D65;margin:0;">Recibirás un correo de <strong>acceso@protectcrochet.com</strong> con tu link de acceso. Si no lo ves en 5 minutos, revisa spam o escríbenos a kroshapatterns@gmail.com.</p>
        </div>`;
    } else {
      deliverySection = `
        <div style="background:#FFF8EC;border-radius:12px;padding:18px;margin-bottom:24px;border:1px solid #F0E0C0;">
          <div style="font-size:15px;font-weight:bold;color:#3A1E2E;margin-bottom:6px;">📦 Entrega de tu pedido</div>
          <p style="font-size:13px;color:#7A4D65;margin:0;">Recibirás tu acceso por correo en breve. ¿Dudas? Escríbenos a kroshapatterns@gmail.com</p>
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
      ...(attachments.length ? { attachments } : {}),
    });

    // Guardar pedido en Redis, reducir inventario y enriquecer correo admin
    let allProds = [];
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      // Fetch products for kit details + inventory lookup
      const prodRaw = await redis.get('krosha:products');
      allProds = prodRaw ? (typeof prodRaw === 'string' ? JSON.parse(prodRaw) : prodRaw) : [];

      const raw = await redis.get('krosha:orders');
      const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      const isNewOrder = !orders.find(o => o.ref === ref);
      if (isNewOrder) {
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
          shippingRate: shippingRate || null,
          shippingPackage: shippingPackage || null,
        });
        if (orders.length > 500) orders.length = 500;
        await redis.set('krosha:orders', JSON.stringify(orders));

        // Reduce yarn inventory only for physical items (kits/hilo), never for patrones
        const invRaw = await redis.get('krosha:inventory');
        let inv = invRaw ? (typeof invRaw === 'string' ? JSON.parse(invRaw) : invRaw) : {};
        let invChanged = false;
        for (const item of items) {
          const prod = allProds.find(p => String(p.id) === String(item.id));
          if (!prod) continue;
          if (prod.type === 'patrones') continue; // digital — never touch inventory
          const yarnList = prod.yarnList || [];
          for (const y of yarnList) {
            if (y.color && typeof inv[y.color] === 'number' && inv[y.color] > 0) {
              inv[y.color] = Math.max(0, inv[y.color] - (y.qty || 1));
              invChanged = true;
            }
          }
        }
        if (invChanged) {
          await redis.set('krosha:inventory', JSON.stringify(inv));
          console.log('[send-confirmation] Inventory updated for order', ref);
        }
      }
    } catch (redisErr) {
      console.error('Redis order save error (non-fatal):', redisErr);
    }

    // Copia a Jennyfer
    const needsManual = resolvedItems.filter(i => i.deliveryType === 'manual');
    const hasPhysical = !!shippingAddress;

    const enviaBlock = hasPhysical ? `
<div style="background:#e8f4fd;border:2px solid #2a6fad;border-radius:10px;padding:16px;margin-top:20px;font-family:monospace;font-size:13px;line-height:1.8;">
  <div style="font-family:Arial,sans-serif;font-weight:bold;color:#1a4f82;font-size:14px;margin-bottom:10px;">📦 DATOS PARA ENVIA.COM</div>
  <b>Destinatario:</b> ${customerName}<br>
  ${shippingAddress.phone ? `<b>Teléfono:</b> ${shippingAddress.phone}<br>` : ''}
  <b>Calle:</b> ${shippingAddress.street}<br>
  ${shippingAddress.colonia ? `<b>Colonia:</b> ${shippingAddress.colonia}<br>` : ''}
  <b>Ciudad:</b> ${shippingAddress.city}<br>
  ${shippingAddress.state ? `<b>Estado:</b> ${shippingAddress.state}<br>` : ''}
  <b>CP:</b> ${shippingAddress.zip}<br>
  <b>País:</b> ${shippingAddress.country}<br>
  ${shippingPackage ? `<br><b>Paquete:</b> ${shippingPackage.peso} kg · ${shippingPackage.largo}×${shippingPackage.ancho}×${shippingPackage.alto} cm<br>` : ''}
  ${shippingRate ? `<b>Carrier:</b> ${shippingRate.carrier?.toUpperCase()} — ${shippingRate.serviceDescription || shippingRate.service}<br><b>Días:</b> ${shippingRate.days}<br><b>Costo cotizado:</b> $${shippingRate.price} MXN<br>` : ''}
</div>` : '';

    // Build item detail rows for admin email (shows kit yarn contents)
    const itemDetailRows = resolvedItems.map(i => {
      const prod = allProds.find(p => String(p.id) === String(i.id));
      const typeLabel = prod?.type === 'kits' ? '📦 KIT FÍSICO'
        : prod?.type === 'hilo' ? '🧶 ESTAMBRE'
        : prod?.type === 'patrones' ? '📄 PATRÓN DIGITAL'
        : '';
      const deliveryLabel = i.deliveryType === 'protect' ? '✅ ProtectCrochet'
        : i.deliveryType === 'pdf' ? '✅ PDF'
        : '⚠️ ENTREGA MANUAL';
      let yarnDetail = '';
      if (prod?.yarnList?.length) {
        yarnDetail = `<br><span style="color:#555;font-size:12px;padding-left:16px;">Estambres: ${
          prod.yarnList.map(y => `${y.color}${y.qty > 1 ? ` ×${y.qty}` : ''}`).join(', ')
        }</span>`;
      }
      return `<tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:13px;">
          <strong>${i.title}</strong> <span style="color:#888;font-size:11px;">${typeLabel}</span>${yarnDetail}
        </td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap;">$${i.price} ${currency}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap;">${deliveryLabel}</td>
      </tr>`;
    }).join('');

    await resend.emails.send({
      from: 'KroshaPatterns <hola@kroshapatterns.com>',
      to: 'kroshapatterns@gmail.com',
      subject: `🛍 Nuevo pedido #${ref} — $${total} ${currency}${hasPhysical ? ' 📦 FÍSICO' : ''} — ${customerEmail}`,
      html: `
        <p><strong>🛍 Nuevo pedido recibido</strong></p>
        <p>Cliente: <strong>${customerName}</strong> (${customerEmail})<br>
        Total: <strong>$${total} ${currency}</strong> · Método: ${payMethod}<br>
        Ref: <strong>#${ref}</strong></p>
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin-bottom:12px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:8px 6px;text-align:left;font-size:12px;border-bottom:2px solid #ddd;">Producto</th>
              <th style="padding:8px 6px;text-align:right;font-size:12px;border-bottom:2px solid #ddd;">Precio</th>
              <th style="padding:8px 6px;text-align:left;font-size:12px;border-bottom:2px solid #ddd;">Entrega</th>
            </tr>
          </thead>
          <tbody>${itemDetailRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:10px 6px 0;font-size:14px;font-weight:bold;text-align:right;">
                Total: $${total} ${currency}
              </td>
            </tr>
          </tfoot>
        </table>
        ${needsManual.length ? `<p style="color:#c00;font-weight:bold;">⚠️ ENTREGA MANUAL REQUERIDA:<br>${needsManual.map(i => i.title).join('<br>')}</p>` : ''}
        ${enviaBlock}`,
    });

    return res.status(200).json({ success: true, orderRef: ref, downloadToken });

  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
