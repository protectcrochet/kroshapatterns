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

  // Probar varios endpoints y formatos que usa T1 Envios
  const attempts = [
    {
      label: 'v2 Bearer',
      url: 'https://api.t1envios.com/api/v2/rates',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    },
    {
      label: 'v1 Bearer',
      url: 'https://api.t1envios.com/api/v1/rates',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    },
    {
      label: 'v2 x-api-key',
      url: 'https://api.t1envios.com/api/v2/rates',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    },
    {
      label: 'v1 Token',
      url: 'https://api.t1envios.com/api/v1/rates',
      headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
    },
  ];

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

  return res.status(200).json({ success: false, message: 'Ningún formato funcionó — revisa el API key o la documentación', allAttempts: results });
}
