// api/orders.js — Pedidos en Redis (GET admin, POST interno, DELETE admin)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (req.method === 'GET') {
    const expected = process.env.ADMIN_KEY || 'Answin1+';
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const raw = await redis.get('krosha:orders');
    const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return res.status(200).json(orders);
  }

  if (req.method === 'POST') {
    const expected = process.env.ADMIN_KEY || 'Answin1+';
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const order = req.body;
    if (!order || typeof order !== 'object') return res.status(400).json({ error: 'Datos inválidos' });
    const raw = await redis.get('krosha:orders');
    const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    // Avoid duplicates by orderRef
    if (!orders.find(o => o.ref === order.ref)) {
      orders.unshift(order);
      // Keep last 500 orders
      if (orders.length > 500) orders.length = 500;
      await redis.set('krosha:orders', JSON.stringify(orders));
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const expected = process.env.ADMIN_KEY || 'Answin1+';
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta id' });
    const raw = await redis.get('krosha:orders');
    const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    const filtered = orders.filter(o => String(o.id) !== String(id) && String(o.ref) !== String(id));
    if (filtered.length === orders.length) return res.status(404).json({ error: 'Pedido no encontrado' });
    await redis.set('krosha:orders', JSON.stringify(filtered));
    return res.status(200).json({ ok: true, deleted: orders.length - filtered.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
