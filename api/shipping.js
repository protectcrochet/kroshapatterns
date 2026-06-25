// api/shipping.js — Genera guía de envío con envia.com
const ENVIA_BASE = 'https://api.envia.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.ADMIN_KEY || 'krosha2024';
  if (req.headers['x-admin-key'] !== expected) return res.status(401).json({ error: 'No autorizado' });

  const { orderRef, carrier, service } = req.body || {};
  if (!orderRef || !carrier) return res.status(400).json({ error: 'orderRef y carrier requeridos' });

  const token = process.env.ENVIA_API_KEY;
  if (!token) return res.status(500).json({ error: 'ENVIA_API_KEY no configurada en Vercel' });

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

  const origin = {
    name:       process.env.ENVIA_ORIGIN_NAME    || 'KroshaPatterns',
    company:    'KroshaPatterns',
    email:      process.env.ENVIA_ORIGIN_EMAIL   || 'kroshapatterns@gmail.com',
    phone:      process.env.ENVIA_ORIGIN_PHONE   || '4421000000',
    street:     process.env.ENVIA_ORIGIN_STREET  || 'Calle Origen 1',
    number:     process.env.ENVIA_ORIGIN_NUMBER  || '1',
    district:   process.env.ENVIA_ORIGIN_COLONIA || 'Centro',
    city:       process.env.ENVIA_ORIGIN_CITY    || 'Querétaro',
    state:      process.env.ENVIA_ORIGIN_STATE   || 'QRO',
    country:    'MX',
    postalCode: process.env.ENVIA_ORIGIN_POSTAL  || '76030',
  };

  const addr = order.shippingAddress;
  const destination = {
    name:       order.name || 'Cliente',
    company:    '',
    email:      order.email || '',
    phone:      addr.phone || '5550000000',
    street:     addr.street || '',
    number:     addr.number || '1',
    district:   addr.colonia || '',
    city:       addr.city || '',
    state:      addr.state || '',
    country:    addr.country || 'MX',
    postalCode: addr.zip || '',
  };

  const body = {
    origin,
    destination,
    packages: [{
      content:       order.products || 'Kit crochet KroshaPatterns',
      amount:        1,
      type:          'box',
      weight:        1,
      insurance:     0,
      declaredValue: order.total || 500,
      weightUnit:    'KG',
      lengthUnit:    'CM',
      dimensions:    { length: 25, width: 25, height: 37 },
    }],
    shipment: { carrier, service: service || undefined, type: 1 },
    settings: { currency: 'MXN' },
  };

  try {
    const r = await fetch(`${ENVIA_BASE}/ship/generate/`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Error envia.com', details: data });

    const ship = data.data?.[0] || data;
    const shipment = {
      trackingNumber: ship.trackingNumber,
      labelUrl:       ship.label || ship.labelUrl,
      trackUrl:       ship.trackUrl,
      carrier,
      service:        service || carrier,
      price:          ship.totalPrice,
      createdAt:      new Date().toISOString(),
    };

    // Guardar en el pedido en Redis
    orders[idx] = { ...order, shipment, status: 'shipped' };
    await redis.set('krosha:orders', JSON.stringify(orders));

    return res.status(200).json({ ok: true, shipment });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
