// api/t1-test.js — Prueba aislada del API key de T1 Envios (no afecta checkout)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kroshapatterns.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { apiKey, cp_destino, cp_origen, peso, largo, ancho, alto } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: 'Falta apiKey' });
  if (!cp_destino || !/^\d{5}$/.test(String(cp_destino))) {
    return res.status(400).json({ error: 'CP destino inválido (5 dígitos)' });
  }

  const payload = {
    cp_origen: cp_origen || '06600',
    cp_destino: String(cp_destino),
    peso: Number(peso) || 0.5,
    largo: Number(largo) || 20,
    ancho: Number(ancho) || 15,
    alto: Number(alto) || 10,
  };

  const results = {};

  // Primero: explorar la raíz del API para encontrar documentación o endpoints disponibles
  const exploreUrls = [
    'https://api.t1envios.com/',
    'https://api.t1envios.com/docs',
    'https://api.t1envios.com/swagger',
    'https://api.t1envios.com/api',
    'https://api.t1envios.com/health',
    'https://services.t1envios.com/',
    'https://services.t1envios.com/api',
  ];
  const exploration = {};
  for (const url of exploreUrls) {
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const text = await r.text().catch(() => '');
      exploration[url] = { status: r.status, snippet: text.slice(0, 300) };
    } catch (e) {
      exploration[url] = { error: e.message };
    }
  }

  // Probar varios endpoints y formatos que usa T1 Envios
  const bases = [
    'https://api.t1envios.com',
    'https://api.plataformat1.com',
    'https://services.t1envios.com',
  ];
  const paths = [
    '/cotizacion',
    '/rates',
    '/shipping/rates',
    '/api/cotizacion',
    '/api/rates',
    '/api/v3/rates',
    '/v1/cotizacion',
    '/v2/cotizacion',
  ];
  const headers_variants = [
    (k) => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    (k) => ({ 'x-api-key': k, 'Content-Type': 'application/json' }),
    (k) => ({ 'Authorization': `Token ${k}`, 'Content-Type': 'application/json' }),
    (k) => ({ 'api-key': k, 'Content-Type': 'application/json' }),
  ];

  const attempts = [];
  for (const base of bases) {
    for (const path of paths) {
      attempts.push({
        label: `${base}${path} Bearer`,
        url: `${base}${path}`,
        headers: headers_variants[0](apiKey),
      });
      attempts.push({
        label: `${base}${path} x-api-key`,
        url: `${base}${path}`,
        headers: headers_variants[1](apiKey),
      });
    }
  }

  for (const attempt of attempts) {
    try {
      const r = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      results[attempt.label] = { status: r.status, ok: r.ok, data };
      if (r.ok) {
        return res.status(200).json({ success: true, method: attempt.label, rates: data, allAttempts: results });
      }
    } catch (e) {
      results[attempt.label] = { error: e.message };
    }
  }

  // Filtrar solo los que no son 404 para facilitar diagnóstico
  const nonNotFound = Object.entries(results).filter(([,v]) => v.status && v.status !== 404);
  return res.status(200).json({
    success: false,
    message: 'Ningún formato funcionó — se necesita documentación de T1 con el endpoint correcto',
    exploration,
    interesting: Object.fromEntries(nonNotFound),
    allAttempts: results,
  });
}
