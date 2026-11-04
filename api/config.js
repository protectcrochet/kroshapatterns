// api/config.js — Configuración global de la tienda (GET público, POST protegido)
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
    const raw = await redis.get('krosha:config');
    const config = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    // Default: shipSubsidy OFF
    return res.status(200).json({ shipSubsidy: false, ...config });
  }

  if (req.method === 'POST') {
    const expected = process.env.ADMIN_KEY;
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Datos inválidos' });
    const raw = await redis.get('krosha:config');
    const current = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    const updated = { ...current, ...body };
    await redis.set('krosha:config', JSON.stringify(updated));
    return res.status(200).json({ ok: true, config: updated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
