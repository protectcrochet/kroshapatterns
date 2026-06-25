// api/hero.js — Datos del Hero en Redis (GET público, POST protegido)
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
    const raw = await redis.get('krosha:hero');
    const hero = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    return res.status(200).json(hero);
  }

  if (req.method === 'POST') {
    const expected = process.env.ADMIN_KEY || 'krosha-internal-2024';
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const hero = req.body;
    if (!hero || typeof hero !== 'object') return res.status(400).json({ error: 'Datos inválidos' });
    await redis.set('krosha:hero', JSON.stringify(hero));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
