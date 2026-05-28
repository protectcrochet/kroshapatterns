// api/upload-token.js
// Generates a client-side upload token for direct browser → Vercel Blob uploads
// Bypasses the 4.5MB serverless body limit for large files (PDFs, etc.)

import { handleUpload } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: [
          'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
          'application/pdf',
        ],
        maximumSizeInBytes: 50 * 1024 * 1024,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('Direct upload completed:', blob.url);
      },
    });
    return res.status(200).json(body);
  } catch (err) {
    console.error('Upload token error:', err);
    return res.status(400).json({ error: err.message });
  }
}
