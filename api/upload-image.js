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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN no configurado en Vercel. Ve a Storage → Blob → Connect to Project.' });
  }

  try {
    const { put } = await import('@vercel/blob');
    const { fileData, fileName, mimeType } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'fileData y fileName son requeridos' });
    }

    const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    let buffer = Buffer.from(base64, 'base64');
    let finalMime = mimeType || 'image/jpeg';
    let finalName = fileName;

    const isHeic = finalMime === 'image/heic' || finalMime === 'image/heif' ||
      /\.(heic|heif)$/i.test(fileName);
    if (isHeic) {
      const sharp = (await import('sharp')).default;
      buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
      finalMime = 'image/jpeg';
      finalName = fileName.replace(/\.(heic|heif)$/i, '.jpg');
    }

    const safeName = `krosha-${Date.now()}-${finalName.replace(/[^a-zA-Z0-9._-]/g, '')}`;

    const blob = await put(safeName, buffer, {
      access: 'public',
      contentType: finalMime,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
