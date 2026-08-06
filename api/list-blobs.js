// api/list-blobs.js
// Lists all files in Vercel Blob storage (admin only)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { list } = await import('@vercel/blob');
    const prefix = req.query.prefix || '';
    const results = [];
    let cursor;

    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      results.push(...page.blobs);
      cursor = page.cursor;
    } while (cursor);

    return res.status(200).json(results.map(b => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt,
    })));
  } catch (err) {
    console.error('List blobs error:', err);
    return res.status(500).json({ error: err.message });
  }
}
