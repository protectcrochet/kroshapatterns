// api/t1-quote.js — Cotización de envío con T1 Envíos
// Credenciales vía variables de entorno en Vercel (nunca en el código)

async function getT1Token() {
  // Opción 1: API key directa (t1-xxxx) — sin paso OAuth
  if (process.env.T1_API_KEY) return process.env.T1_API_KEY;

  // Opción 2: flujo Keycloak username/password
  const authUrl = process.env.T1_AUTH_URL || 'https://id.t1.com/realms/T1/protocol/openid-connect/token';
  const body = new URLSearchParams({
    grant_type:    'password',
    client_id:     process.env.T1_CLIENT_ID     || 't1envios',
    client_secret: process.env.T1_CLIENT_SECRET || '',
    username:      process.env.T1_USERNAME       || '',
    password:      process.env.T1_PASSWORD       || '',
  });
  const r = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error('T1 auth error: ' + err);
  }
  const data = await r.json();
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cp_destino, peso = 1, largo = 25, ancho = 25, alto = 37 } = req.body || {};

  if (!cp_destino || !/^\d{5}$/.test(cp_destino)) {
    return res.status(400).json({ error: 'Código postal inválido (5 dígitos)' });
  }

  const storeId = process.env.T1_STORE_ID || '';

  const T1_BASE   = process.env.T1_BASE_URL  || 'https://api.t1envios.com';
  const cpOrigen  = process.env.T1_CP_ORIGEN || process.env.ENVIA_ORIGIN_POSTAL || '76030';

  try {
    const token = await getT1Token();

    const quoteBody = {
      cp_origen:  cpOrigen,
      cp_destino: cp_destino,
      peso:       Number(peso)  || 1,
      largo:      Number(largo) || 25,
      ancho:      Number(ancho) || 25,
      alto:       Number(alto)  || 37,
    };
    if (storeId) quoteBody.tienda_id = storeId;

    const quotePaths = [
      '/api/v1/cotizacion', '/api/v2/cotizacion',
      '/cotizacion', '/api/cotizacion',
      '/v1/cotizacion', '/v2/cotizacion',
      '/api/v1/rates', '/api/v1/quote',
      '/shipping/v1/cotizacion',
    ];
    let quoteRes, quoteData;
    for (const qpath of quotePaths) {
      quoteRes = await fetch(`${T1_BASE}${qpath}`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(quoteBody),
      });
      quoteData = await quoteRes.json().catch(() => null);
      if (quoteRes.ok) break;
    }

    if (!quoteRes.ok) {
      return res.status(quoteRes.status).json({ error: quoteData.message || 'Error al cotizar', raw: quoteData });
    }

    // Normalizar lista de servicios
    const services = Array.isArray(quoteData) ? quoteData
      : Array.isArray(quoteData.data)      ? quoteData.data
      : Array.isArray(quoteData.servicios) ? quoteData.servicios
      : Array.isArray(quoteData.services)  ? quoteData.services
      : [];

    return res.status(200).json({ ok: true, rates: services, raw: quoteData });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
