// api/p.js — Página OG por producto: /p/:id → meta tags estáticos para redes sociales
export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.redirect(302, '/');

  let p = null;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const raw = await redis.get('krosha:products');
    const products = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    p = products.find(x => String(x.id) === String(id));
  } catch (_) {}

  if (!p) return res.redirect(302, '/');

  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const title  = p.nameEs || p.title || 'KroshaPatterns';
  const desc   = p.descEs || p.desc  || 'Patrones y kits de crochet — KroshaPatterns';
  const image  = (p.images && p.images[0]) || '';
  const siteUrl = 'https://kroshapatterns.com';
  const canonicalUrl = `${siteUrl}/p/${id}`;
  const redirectUrl  = `/krosha-producto?id=${encodeURIComponent(id)}`;

  const typeLabels = { patrones:'Patrón Digital', kits:'Kit Crochet', hilo:'Estambre', estambres:'Kit de Estambres' };
  const typeLabel  = typeLabels[p.type] || 'Producto';
  const priceMxn   = p.price ? `$${p.price} MXN · ` : '';
  const ogDesc     = `${priceMxn}${typeLabel} — ${desc}`.slice(0, 300);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.status(200).send(`<!DOCTYPE html>
<html lang="es" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} | KroshaPatterns</title>

  <!-- Open Graph -->
  <meta property="og:site_name" content="KroshaPatterns">
  <meta property="og:type"      content="product">
  <meta property="og:title"     content="${esc(title)}">
  <meta property="og:description" content="${esc(ogDesc)}">
  <meta property="og:url"       content="${canonicalUrl}">
  ${image ? `<meta property="og:image"     content="${esc(image)}">
  <meta property="og:image:width"  content="800">
  <meta property="og:image:height" content="800">` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(ogDesc)}">
  ${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}

  <!-- Redirect humans al producto completo -->
  <meta http-equiv="refresh" content="0; url=${redirectUrl}">
  <link rel="canonical" href="${canonicalUrl}">
  <style>
    body{font-family:'Nunito',sans-serif;background:#FDF0F5;color:#3A1E2E;
      display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .box{text-align:center;padding:2rem;}
    a{color:#C06090;font-weight:700;text-decoration:none;}
  </style>
</head>
<body>
  <div class="box">
    <p>🎀 Cargando producto…</p>
    <p><a href="${redirectUrl}">Ver producto →</a></p>
  </div>
  <script>window.location.replace('${redirectUrl}');</script>
</body>
</html>`);
}
