// api/upload-image.js
// Vercel Serverless Function — Image upload to Vercel Blob
// Receives: { fileData: "<base64>", fileName: "photo.jpg", mimeType: "image/jpeg" }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = req.headers['x-admin-key'];
  if (process.env.ADMIN_KEY && adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { put } = await import('@vercel/blob');
    const { fileData, fileName, mimeType } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'fileData y fileName son requeridos' });
    }

    // Strip data URL prefix if present (data:image/jpeg;base64,...)
    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(base64, 'base64');

    // Sanitize filename
    const safeName = `krosha-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '')}`;

    const blob = await put(safeName, buffer, {
      access: 'public',
      contentType: mimeType || 'image/jpeg',
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
