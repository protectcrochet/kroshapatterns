// api/t1-guide.js — Genera guía con T1 Envíos (DEV)
// API: https://apiv2.dev.t1envios.com
// Auth: Keycloak username/password → Bearer token

const T1_AUTH_URL = 'https://keycloak.dev.plataformat1.com/auth/realms/claroshop-sapi-sa-cv/protocol/openid-connect/token';
const T1_BASE     = process.env.T1_BASE_URL || 'https://apiv2.dev.t1envios.com';

async function getT1Token() {
  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     't1envios',
    client_secret: process.env.T1_CLIENT_SECRET || '',
    username:      process.env.T1_USERNAME || '',
    password:      process.env.T1_PASSWORD || '',
  });
  const r = await fetch(T1_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error('T1 auth error: ' + await r.text());
  const d = await r.json();
  return d.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.ADMIN_KEY || 'Answin1+';
  if (req.headers['x-admin-key'] !== expected) return res.status(401).json({ error: 'No autorizado' });

  const { orderRef, tokenQuote: selectedToken, carrier: selectedCarrier, service: selectedService } = req.body || {};
  if (!orderRef) return res.status(400).json({ error: 'orderRef requerido' });

  if (!process.env.T1_USERNAME || !process.env.T1_PASSWORD) {
    return res.status(500).json({ error: 'T1_USERNAME y T1_PASSWORD no configuradas en Vercel' });
  }
  const storeId = process.env.T1_STORE_ID;
  if (!storeId) return res.status(500).json({ error: 'T1_STORE_ID no configurada en Vercel' });

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });

  const raw = await redis.get('krosha:orders');
  const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  const idx = orders.findIndex(o => o.ref === orderRef);
  if (idx === -1) return res.status(404).json({ error: 'Pedido no encontrado' });
  const order = orders[idx];

  if (!order.shippingAddress) {
    return res.status(400).json({ error: 'El pedido no tiene dirección de envío guardada' });
  }
  const addr = order.shippingAddress;
  if (!addr.zip || !/^\d{5}$/.test(addr.zip)) {
    return res.status(400).json({ error: 'CP destino inválido (requiere 5 dígitos)' });
  }

  const cpOrigen = process.env.T1_CP_ORIGEN || process.env.ENVIA_ORIGIN_POSTAL || '76030';

  try {
    const token = await getT1Token();

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'shop_id':       storeId,
    };

    // Paso 1 — cotización
    const quoteBody = {
      codigo_postal_origen:  cpOrigen,
      codigo_postal_destino: addr.zip,
      peso:           1,
      largo:          25,
      ancho:          25,
      alto:           37,
      dias_embarque:  1,
      seguro:         false,
      valor_paquete:  0,
      tipo_paquete:   0,
      comercio_id:    storeId,
    };

    const quoteRes  = await fetch(`${T1_BASE}/quote/create`, { method: 'POST', headers, body: JSON.stringify(quoteBody) });
    const quoteData = await quoteRes.json();
    console.log('T1 cotización:', JSON.stringify(quoteData));

    if (!quoteRes.ok) {
      return res.status(quoteRes.status).json({ error: 'Error en cotización T1', details: quoteData });
    }

    // Aplanar servicios de result[].cotizacion.servicios (objeto) → array plano
    const allServices = [];
    for (const carrier of (quoteData.result || [])) {
      const servicios = carrier.cotizacion?.servicios || {};
      for (const [key, svc] of Object.entries(servicios)) {
        allServices.push({ ...svc, mensajeria: carrier.clave, servicio: key });
      }
    }
    // Ordenar por precio (más barato primero)
    allServices.sort((a, b) => (a.costo_total || 0) - (b.costo_total || 0));

    if (!allServices.length) {
      return res.status(400).json({ error: 'No hay servicios T1 disponibles para ese CP', details: quoteData });
    }

    // Si no se eligió servicio aún, devolver lista para que el admin elija
    if (!selectedToken) {
      const quotes = allServices.map(s => ({
        carrier:   s.mensajeria,
        service:   s.servicio,
        tipo:      s.tipo_servicio || '',
        precio:    s.costo_total,
        dias:      s.dias_entrega,
        entrega:   s.fecha_claro_entrega || s.fecha_mensajeria_entrega || '',
        token:     s.token || s.token_quote || s.tokenQuote || '',
      }));
      return res.status(200).json({ ok: true, quotes });
    }

    const tokenQuote    = selectedToken;
    const chosenCarrier = selectedCarrier || 'T1';
    const chosenService = selectedService || '';

    // Paso 2 — generar guía con cotización
    const [firstName, ...lastParts] = (order.name || 'Cliente').split(' ');
    const lastName = lastParts.join(' ') || '.';

    const guideBody = {
      contenido:               (order.products || 'Kit crochet KroshaPatterns').slice(0, 50),
      pedido_comercio:         String(order.ref || order.id || ''),
      nombre_origen:           process.env.ENVIA_ORIGIN_NAME   || 'KroshaPatterns',
      apellidos_origen:        process.env.ENVIA_ORIGIN_LASTNAME || 'N/A',
      email_origen:            process.env.ENVIA_ORIGIN_EMAIL  || 'kroshapatterns@gmail.com',
      calle_origen:            process.env.ENVIA_ORIGIN_STREET || 'Calle Origen 1',
      numero_origen:           process.env.ENVIA_ORIGIN_NUMBER || '1',
      colonia_origen:          process.env.ENVIA_ORIGIN_COLONIA|| 'Centro',
      telefono_origen:         process.env.ENVIA_ORIGIN_PHONE  || '4421000000',
      estado_origen:           process.env.ENVIA_ORIGIN_STATE  || 'QRO',
      municipio_origen:        process.env.ENVIA_ORIGIN_CITY   || 'Querétaro',
      referencias_origen:      process.env.ENVIA_ORIGIN_REF    || 'N/A',
      codigo_postal_origen:    cpOrigen,
      nombre_destino:          firstName,
      apellidos_destino:       lastName,
      email_destino:           order.email || '',
      calle_destino:           addr.street  || '',
      numero_destino:          addr.number  || 'S/N',
      colonia_destino:         addr.colonia || '',
      telefono_destino:        addr.phone   || '5550000000',
      estado_destino:          addr.state   || '',
      municipio_destino:       addr.city    || '',
      referencias_destino:     addr.references || 'N/A',
      codigo_postal_destino:   addr.zip,
      generar_recoleccion:     false,
      tiene_notificacion:      false,
      origen_guia:             '2001',
      comercio_id:             storeId,
      nombre_comercio_origen:  '',
      nombre_comercio_destino: '',
      token_quote:             tokenQuote,
    };

    const guideRes  = await fetch(`${T1_BASE}/guide/create`, { method: 'POST', headers, body: JSON.stringify(guideBody) });
    const guideData = await guideRes.json();
    console.log('T1 guía:', JSON.stringify(guideData));

    if (!guideRes.ok) {
      return res.status(guideRes.status).json({ error: 'Error al generar guía T1', details: guideData });
    }

    // Normalizar respuesta
    const g = guideData.data || guideData;
    const trackingNumber =
      g.numero_guia || g.tracking || g.guia || g.trackingNumber || g.tracking_number || g.numeroGuia || '';
    const labelUrl =
      g.etiqueta || g.label || g.pdf || g.labelUrl || g.label_url || g.url_etiqueta || g.urlEtiqueta || '';
    const trackUrl = trackingNumber ? `https://t1envios.com/rastreo?guia=${trackingNumber}` : '';

    const shipment = {
      trackingNumber,
      labelUrl,
      trackUrl,
      carrier:   chosenCarrier,
      service:   chosenService,
      price:     null,
      createdAt: new Date().toISOString(),
      provider:  't1',
      _raw:      g,
    };

    orders[idx] = { ...order, shipment, status: 'shipped' };
    await redis.set('krosha:orders', JSON.stringify(orders));

    // Enviar correo de notificación de envío (no bloquea si falla)
    if (trackingNumber && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const carrierTrackUrls = {
          DHL:   `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${trackingNumber}`,
          FEDEX: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
        };
        const finalTrackUrl = trackUrl || carrierTrackUrls[chosenCarrier.toUpperCase()] || '';
        const [firstName2] = (order.name || 'amiga').split(' ');
        const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FDF0F5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF0F5;padding:40px 20px;">
<tr><td><table width="100%" style="max-width:580px;margin:0 auto;background:#FFFBFD;border-radius:24px;overflow:hidden;border:1.5px solid #F0C8DC;">
<tr><td style="background:#C06090;padding:32px;text-align:center;">
  <div style="font-size:32px;margin-bottom:8px;">🎀</div>
  <div style="font-family:Georgia,serif;font-size:26px;font-style:italic;color:#fff;font-weight:bold;">KroshaPatterns</div>
</td></tr>
<tr><td style="padding:32px;">
  <h2 style="font-family:Georgia,serif;font-size:22px;color:#3A1E2E;margin:0 0 16px;">¡Tu pedido va en camino, ${firstName2}! 🚚</h2>
  <div style="background:#FFF0F5;border-radius:12px;padding:14px 18px;margin-bottom:16px;border:1px solid #F0C8DC;">
    <span style="font-size:12px;text-transform:uppercase;color:#B48EA8;font-weight:bold;">Número de pedido</span>
    <div style="font-size:18px;font-weight:bold;color:#C06090;margin-top:4px;">#${order.ref || order.id}</div>
  </div>
  <div style="background:#D0E8FF;border-radius:16px;padding:20px;margin-bottom:20px;border:1.5px solid #93C5FD;text-align:center;">
    <div style="font-size:13px;font-weight:700;color:#1a5fa6;text-transform:uppercase;margin-bottom:6px;">📦 Información de rastreo</div>
    <div style="font-size:15px;color:#3A1E2E;font-weight:700;margin-bottom:4px;">${chosenCarrier} — ${chosenService}</div>
    <div style="font-size:22px;font-weight:800;color:#1a5fa6;margin-bottom:${finalTrackUrl ? '16px' : '0'};">${trackingNumber}</div>
    ${finalTrackUrl ? `<a href="${finalTrackUrl}" target="_blank" style="display:inline-block;background:#1a5fa6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-size:14px;font-weight:700;">🔍 Rastrear mi pedido</a>` : ''}
  </div>
  <p style="font-size:13px;color:#7A4D65;line-height:1.7;text-align:center;">¿Tienes dudas sobre tu envío? ¡Escríbeme! 🎀</p>
  <div style="text-align:center;">
    <a href="mailto:kroshapatterns@gmail.com" style="display:inline-block;background:#3A1E2E;color:#fff;text-decoration:none;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;">✉ kroshapatterns@gmail.com</a>
  </div>
</td></tr>
<tr><td style="background:#F5D0E0;padding:16px;text-align:center;">
  <p style="font-size:12px;color:#8B3565;margin:0;">© 2026 KroshaPatterns · kroshapatterns.com</p>
</td></tr>
</table></td></tr></table></body></html>`;

        const emailTo = [];
        if (order.email) emailTo.push(order.email);
        const subject = `🚚 Tu pedido #${order.ref || order.id} va en camino — ${chosenCarrier} ${trackingNumber}`;
        if (emailTo.length) {
          await resend.emails.send({
            from: 'KroshaPatterns <hola@kroshapatterns.com>',
            to: emailTo,
            bcc: ['kroshapatterns@gmail.com'],
            subject,
            html: emailHtml,
          });
        } else {
          // Solo notificar a la admin si no hay email del cliente
          await resend.emails.send({
            from: 'KroshaPatterns <hola@kroshapatterns.com>',
            to: ['kroshapatterns@gmail.com'],
            subject: `[Admin] ${subject}`,
            html: emailHtml,
          });
        }
      } catch (emailErr) {
        console.error('[t1-guide] email error:', emailErr.message);
      }
    }

    return res.status(200).json({ ok: true, shipment });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
