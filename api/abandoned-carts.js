// api/abandoned-carts.js — Carritos abandonados en Redis
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
    if (req.headers['x-admin-key'] !== expected) return res.status(401).json({ error: 'No autorizado' });
    const raw = await redis.get('krosha:abandoned_carts');
    const carts = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return res.status(200).json(carts);
  }

  // POST: guardar carrito abandonado (llamado desde checkout cuando el usuario escribe su email)
  if (req.method === 'POST') {
    const { email, name, cart, total, currency } = req.body || {};
    if (!email || !Array.isArray(cart) || !cart.length) return res.status(400).json({ error: 'email y cart requeridos' });
    const raw = await redis.get('krosha:abandoned_carts');
    const carts = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    const idx = carts.findIndex(c => c.email === email);
    const entry = { email, name: name || '', cart, total: total || 0, currency: currency || 'MXN', savedAt: new Date().toISOString() };
    if (idx >= 0) carts[idx] = entry;
    else carts.unshift(entry);
    if (carts.length > 300) carts.length = 300;
    await redis.set('krosha:abandoned_carts', JSON.stringify(carts));
    return res.status(200).json({ ok: true });
  }

  // DELETE: eliminar cuando el pedido se completa
  if (req.method === 'DELETE') {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email requerido' });
    const raw = await redis.get('krosha:abandoned_carts');
    const carts = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    const filtered = carts.filter(c => c.email !== email);
    await redis.set('krosha:abandoned_carts', JSON.stringify(filtered));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
