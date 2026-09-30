// api/t1-guide.js — Genera guía con T1 Envíos
// Credenciales vía variables de entorno en Vercel

async function getT1Token() {
  const authUrl = process.env.T1_AUTH_URL || 'https://id.t1.com/realms/T1/protocol/openid-connect/token';
  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     process.env.T1_CLIENT_ID     || 't1envios',
    client_secret: process.env.T1_CLIENT_SECRET || '',
    username:      process.env.T1_USERNAME       || '',
    password:      process.env.T1_PASSWORD       || '',
  });
  const r = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error('T1 auth error: ' + err);
  }
  const data = await r.json();
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.ADMIN_KEY || 'Answin1+';
  if (req.headers['x-admin-key'] !== expected) return res.status(401).json({ error: 'No autorizado' });

  const { orderRef, serviceId } = req.body || {};
  if (!orderRef) return res.status(400).json({ error: 'orderRef requerido' });

  const storeId = process.env.T1_STORE_ID;
  if (!storeId) return res.status(500).json({ error: 'T1_STORE_ID no configurada en Vercel' });
  if (!process.env.T1_USERNAME || !process.env.T1_PASSWORD) {
    return res.status(500).json({ error: 'T1_USERNAME / T1_PASSWORD no configuradas en Vercel' });
  }

  const T1_BASE = process.env.T1_BASE_URL || 'https://shipping.devt1.com';

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
    return res.status(400).json({ error: 'El CP destino no es válido (se requieren 5 dígitos)' });
  }

  try {
    const token = await getT1Token();

    // Paso 1 — cotización para obtener servicios disponibles
    const cpOrigen = process.env.T1_CP_ORIGEN || process.env.ENVIA_ORIGIN_POSTAL || '76030';
    const params = new URLSearchParams({
      tienda_id:  storeId,
      cp_origen:  cpOrigen,
      cp_destino: addr.zip,
      peso:       '1',
      largo:      '25',
      ancho:      '25',
      alto:       '37',
    });

    const quoteRes = await fetch(`${T1_BASE}/shipping/v1/cotizacion?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const quoteData = await quoteRes.json();
    console.log('T1 cotización response:', JSON.stringify(quoteData));

    if (!quoteRes.ok) {
      return res.status(quoteRes.status).json({ error: 'Error en cotización T1', details: quoteData });
    }

    // Normalizar lista de servicios (T1 puede responder en data[], servicios[], o array directo)
    const services = Array.isArray(quoteData) ? quoteData
      : Array.isArray(quoteData.data)      ? quoteData.data
      : Array.isArray(quoteData.servicios) ? quoteData.servicios
      : Array.isArray(quoteData.services)  ? quoteData.services
      : [];

    if (!services.length) {
      return res.status(400).json({ error: 'No hay servicios T1 disponibles para ese CP', raw: quoteData });
    }

    // Usar el serviceId solicitado o el primero disponible (normalmente el más económico)
    let chosen = services[0];
    if (serviceId) {
      const found = services.find(s =>
        String(s.id || s.servicio_id || s.service_id) === String(serviceId)
      );
      if (found) chosen = found;
    }

    const chosenServiceId = chosen.id || chosen.servicio_id || chosen.service_id;
    const chosenCarrier   = chosen.paqueteria || chosen.carrier || chosen.proveedor || chosen.name || 'T1';

    // Paso 2 — generar guía
    const guiaBody = {
      tienda_id:   storeId,
      servicio_id: chosenServiceId,
      remitente: {
        nombre:     process.env.ENVIA_ORIGIN_NAME   || 'KroshaPatterns',
        telefono:   process.env.ENVIA_ORIGIN_PHONE  || '4421000000',
        calle:      process.env.ENVIA_ORIGIN_STREET || 'Calle Origen 1',
        numero:     process.env.ENVIA_ORIGIN_NUMBER || '1',
        colonia:    process.env.ENVIA_ORIGIN_COLONIA || 'Centro',
        municipio:  process.env.ENVIA_ORIGIN_CITY   || 'Querétaro',
        estado:     process.env.ENVIA_ORIGIN_STATE  || 'QRO',
        cp:         cpOrigen,
        pais:       'MX',
      },
      destinatario: {
        nombre:      order.name || 'Cliente',
        telefono:    addr.phone || '5550000000',
        calle:       addr.street || '',
        numero:      addr.number || 'S/N',
        colonia:     addr.colonia || '',
        municipio:   addr.city || '',
        estado:      addr.state || '',
        cp:          addr.zip,
        pais:        addr.country || 'MX',
        referencias: addr.references || '',
      },
      paquete: {
        peso:      1,
        largo:     25,
        ancho:     25,
        alto:      37,
        contenido: order.products || 'Kit crochet KroshaPatterns',
      },
    };

    const guiaRes = await fetch(`${T1_BASE}/shipping/v1/guia`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(guiaBody),
    });
    const guiaData = await guiaRes.json();
    console.log('T1 guía raw:', JSON.stringify(guiaData));

    if (!guiaRes.ok) {
      return res.status(guiaRes.status).json({ error: 'Error al generar guía T1', details: guiaData });
    }

    // Normalizar respuesta
    const g = guiaData.data || guiaData;
    const trackingNumber =
      g.tracking || g.numero_guia || g.guia || g.trackingNumber || g.tracking_number || '';
    const labelUrl =
      g.etiqueta || g.label || g.pdf || g.labelUrl || g.label_url || g.url || '';
    const trackUrl = trackingNumber
      ? `https://t1envios.com/rastreo?guia=${trackingNumber}`
      : '';

    const shipment = {
      trackingNumber,
      labelUrl,
      trackUrl,
      carrier:   chosenCarrier,
      service:   String(chosenServiceId),
      price:     chosen.precio || chosen.price || chosen.total,
      createdAt: new Date().toISOString(),
      provider:  't1',
      _raw:      g,
    };

    orders[idx] = { ...order, shipment, status: 'shipped' };
    await redis.set('krosha:orders', JSON.stringify(orders));

    return res.status(200).json({ ok: true, shipment, availableServices: services });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
