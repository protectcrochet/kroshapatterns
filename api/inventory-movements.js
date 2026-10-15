// api/inventory-movements.js — Historial de movimientos de inventario (solo lectura, requiere admin key)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const expected = process.env.ADMIN_KEY || 'Answin1+';
  if (req.headers['x-admin-key'] !== expected) return res.status(401).json({ error: 'No autorizado' });

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (req.method === 'GET') {
    const raw = await redis.get('krosha:movements');
    const movements = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return res.status(200).json({ movements, total: movements.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
