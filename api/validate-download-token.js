// api/validate-download-token.js
// Validates a download token and returns the list of downloadable items

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || !/^kp_[0-9a-f]{32}$/.test(token)) {
    return res.status(400).json({ error: 'Token inválido' });
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const data = await redis.get(`dl:${token}`);

    if (!data) {
      return res.status(404).json({ error: 'Enlace no encontrado. Escríbenos a hola@kroshapatterns.com' });
    }

    return res.status(200).json({
      orderRef: data.orderRef,
      items: data.items,
    });
  } catch (err) {
    console.error('Token validation error:', err);
    return res.status(500).json({ error: 'Error interno. Escríbenos a hola@kroshapatterns.com' });
  }
}
