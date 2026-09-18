// api/customkit.js — Configuración del Kit Personalizado
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
    const raw = await redis.get('krosha:customkit');
    const config = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : defaultConfig();
    return res.status(200).json(config);
  }

  if (req.method === 'POST') {
    const expected = process.env.ADMIN_KEY || 'Answin1+';
    if (req.headers['x-admin-key'] !== expected) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const config = req.body;
    if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Datos inválidos' });
    await redis.set('krosha:customkit', JSON.stringify(config));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function defaultConfig() {
  return {
    enabled: false,
    pricePerSkein: 150,
    sections: {
      piel:    { label: 'Color de Piel',  colors: [], defaultQty: 2 },
      cabello: { label: 'Cabello',         colors: [], defaultQty: 3 },
      vestido: { label: 'Vestido',         colors: [], defaultQty: 4 },
      forro:   { label: 'Forro',           colors: [], defaultQty: 2 },
      rosas:   { label: 'Rosas',           colors: [], defaultQty: 1, maxCombos: 4 },
    },
  };
}
