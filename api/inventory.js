// api/inventory.js — Inventario de estambres en Redis (GET público, POST protegido)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (req.method === 'GET') {
    const raw = await redis.get('krosha:inventory');
    const inventory = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return res.status(200).json(inventory);
  }

  if (req.method === 'POST') {
    const expected = process.env.ADMIN_KEY || 'Answin1+';
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const inventory = req.body;
    if (!inventory || typeof inventory !== 'object') return res.status(400).json({ error: 'Datos inválidos' });
    await redis.set('krosha:inventory', JSON.stringify(inventory));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
