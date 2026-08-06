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

  // Explorar la raíz del API con GET para encontrar documentación/paths disponibles
  const exploreUrls = [
    'https://api.t1envios.com/',
    'https://api.t1envios.com/docs',
    'https://api.t1envios.com/swagger',
    'https://api.t1envios.com/swagger-ui',
    'https://api.t1envios.com/swagger-ui.html',
    'https://api.t1envios.com/api-docs',
    'https://api.t1envios.com/api',
    'https://api.t1envios.com/health',
    'https://api.t1envios.com/status',
    'https://services.t1envios.com/',
    'https://services.t1envios.com/docs',
    'https://services.t1envios.com/api',
    'https://gateway.t1envios.com/',
    'https://gateway.t1envios.com/api',
  ];
  const exploration = {};
  for (const url of exploreUrls) {
    try {
      const r = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,
        },
      });
      const text = await r.text().catch(() => '');
      exploration[url] = { status: r.status, snippet: text.slice(0, 500) };
    } catch (e) {
      exploration[url] = { error: e.message };
    }
  }

  // Todos los bases y paths a probar (POST)
  const bases = [
    'https://api.t1envios.com',
    'https://services.t1envios.com',
    'https://gateway.t1envios.com',
  ];

  const paths = [
    // Versión v1
    '/api/v1/rates',
    '/api/v1/cotizacion',
    '/api/v1/cotizaciones',
    '/api/v1/quote',
    '/api/v1/shipping/rates',
    '/api/v1/shipping/quote',
    '/api/v1/shipping/quotation',
    '/api/v1/shipment/rate',
    '/api/v1/shipments/rates',
    '/api/v1/envios',
    '/api/v1/envio/cotizar',
    '/api/v1/guias/cotizar',
    '/api/v1/parcels/rates',
    '/api/v1/parcel/quote',
    '/api/v1/precio',
    // Versión v2
    '/api/v2/rates',
    '/api/v2/cotizacion',
    '/api/v2/cotizaciones',
    '/api/v2/quote',
    '/api/v2/shipping/rates',
    // Versión v3
    '/api/v3/rates',
    '/api/v3/cotizacion',
    '/api/v3/shipping/rates',
    // Versión v4 (podría ser la nueva para API keys)
    '/api/v4/rates',
    '/api/v4/cotizacion',
    '/api/v4/shipping/rates',
    // Sin versión
    '/cotizacion',
    '/cotizaciones',
    '/cotizar',
    '/rates',
    '/quote',
    '/shipping/rates',
    '/shipping/quote',
    '/api/cotizacion',
    '/api/cotizaciones',
    '/api/rates',
    '/api/quote',
    '/api/shipping/rates',
    '/v1/rates',
    '/v1/cotizacion',
    '/v2/rates',
    '/v2/cotizacion',
  ];

  // Variantes de auth para el nuevo formato t1-...
  const authVariants = [
    (k) => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' }),
    (k) => ({ 'x-api-key': k, 'Content-Type': 'application/json' }),
    (k) => ({ 'Authorization': `ApiKey ${k}`, 'Content-Type': 'application/json' }),
    (k) => ({ 'Authorization': `Token ${k}`, 'Content-Type': 'application/json' }),
  ];

  const results = {};

  // Solo probar las 2 variantes de auth más probables para no exceder timeout
  for (const base of bases) {
    for (const path of paths) {
      for (const [idx, authFn] of authVariants.slice(0, 2).entries()) {
        const label = `${base}${path} [${idx === 0 ? 'Bearer' : 'x-api-key'}]`;
        try {
          const r = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: authFn(apiKey),
            body: JSON.stringify(payload),
          });
          const text = await r.text().catch(() => '');
          let data = {};
          try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
          results[label] = { status: r.status, ok: r.ok, data };
          if (r.ok) {
            return res.status(200).json({ success: true, method: label, rates: data, exploration, allAttempts: results });
          }
        } catch (e) {
          results[label] = { error: e.message };
        }
      }
    }
  }

  // Filtrar los que no son 404 (400, 401, 403, 422 son más informativos)
  const interesting = Object.fromEntries(
    Object.entries(results).filter(([, v]) => v.status && v.status !== 404)
  );

  return res.status(200).json({
    success: false,
    message: 'Ningún formato funcionó',
    exploration,
    interesting,
    totalTried: Object.keys(results).length,
  });
}
