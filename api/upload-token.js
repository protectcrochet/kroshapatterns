// api/upload-token.js
// Generates a client upload token so the browser can upload directly to Vercel Blob
// Bypasses the 4.5MB serverless body limit for large files (PDFs, images)

import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;

    if (body?.type === 'blob.generate-client-token') {
      const { pathname, callbackUrl } = body.payload || {};

      const clientToken = await generateClientTokenFromReadWriteToken({
        pathname: pathname || `krosha-${Date.now()}`,
        onUploadCompleted: {
          callbackUrl: callbackUrl || 'https://kroshapatterns.com/api/upload-token',
          tokenPayload: null,
        },
        allowedContentTypes: [
          'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
          'application/pdf',
        ],
        maximumSizeInBytes: 50 * 1024 * 1024,
        addRandomSuffix: false,
      });

      return res.status(200).json({ clientToken });
    }

    // Upload completed callback
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Upload token error:', err);
    return res.status(500).json({ error: err.message });
  }
}
