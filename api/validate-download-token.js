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
    const { kv } = await import('@vercel/kv');
    const data = await kv.get(`dl:${token}`);

    if (!data) {
      return res.status(404).json({ error: 'Enlace no encontrado o expirado' });
    }

    if (Date.now() > data.expiresAt) {
      await kv.del(`dl:${token}`);
      return res.status(410).json({ error: 'Este enlace ha expirado (7 días)' });
    }

    if (data.downloads >= data.maxDownloads) {
      return res.status(429).json({ error: 'Límite de accesos alcanzado. Escríbenos a hola@kroshapatterns.com' });
    }

    // Increment access count
    const updated = { ...data, downloads: data.downloads + 1 };
    await kv.set(`dl:${token}`, updated, {
      exat: Math.floor(data.expiresAt / 1000),
    });

    return res.status(200).json({
      orderRef: data.orderRef,
      items: data.items,
      accessesLeft: data.maxDownloads - updated.downloads,
    });
  } catch (err) {
    console.error('Token validation error:', err);
    return res.status(500).json({ error: 'Error interno. Escríbenos a hola@kroshapatterns.com' });
  }
}
