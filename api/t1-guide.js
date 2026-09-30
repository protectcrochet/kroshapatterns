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

  const { orderRef } = req.body || {};
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

    const chosen        = allServices[0];
    const tokenQuote    = chosen.token || chosen.token_quote || chosen.tokenQuote || '';
    const chosenCarrier = chosen.mensajeria || 'T1';

    if (!tokenQuote) {
      return res.status(400).json({ error: 'T1 no devolvió token_quote en la cotización', raw: chosen });
    }

    // Paso 2 — generar guía con cotización
    const [firstName, ...lastParts] = (order.name || 'Cliente').split(' ');
    const lastName = lastParts.join(' ') || '.';

    const guideBody = {
      contenido:               order.products || 'Kit crochet KroshaPatterns',
      pedido_comercio:         String(order.ref || order.id || ''),
      nombre_origen:           process.env.ENVIA_ORIGIN_NAME   || 'KroshaPatterns',
      apellidos_origen:        '',
      email_origen:            process.env.ENVIA_ORIGIN_EMAIL  || 'kroshapatterns@gmail.com',
      calle_origen:            process.env.ENVIA_ORIGIN_STREET || 'Calle Origen 1',
      numero_origen:           process.env.ENVIA_ORIGIN_NUMBER || '1',
      colonia_origen:          process.env.ENVIA_ORIGIN_COLONIA|| 'Centro',
      telefono_origen:         process.env.ENVIA_ORIGIN_PHONE  || '4421000000',
      estado_origen:           process.env.ENVIA_ORIGIN_STATE  || 'QRO',
      municipio_origen:        process.env.ENVIA_ORIGIN_CITY   || 'Querétaro',
      referencias_origen:      '',
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
      referencias_destino:     addr.references || '',
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
      service:   chosen.tipo_servicio || chosen.servicio || String(chosen.id || ''),
      price:     chosen.precio || chosen.price || chosen.total,
      createdAt: new Date().toISOString(),
      provider:  't1',
      _raw:      g,
    };

    orders[idx] = { ...order, shipment, status: 'shipped' };
    await redis.set('krosha:orders', JSON.stringify(orders));

    return res.status(200).json({ ok: true, shipment });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
