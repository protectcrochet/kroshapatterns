// T1 Envíos — cotización de envío
// Credenciales guardadas como variables de entorno en Vercel (nunca en el código)

const T1_AUTH_URL = 'https://keycloak.dev.plataformat1.com/auth/realms/claroshop-sapi-sa-cv/protocol/openid-connect/token';
const T1_CLIENT_ID = 't1envios';
const T1_CLIENT_SECRET = 'f64cd365-346d-461d-95b4-91938594b84a';

async function getT1Token() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: T1_CLIENT_ID,
    client_secret: T1_CLIENT_SECRET,
    username: process.env.T1_USERNAME,
    password: process.env.T1_PASSWORD,
  });

  const res = await fetch(T1_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('T1 auth failed: ' + err);
  }

  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cp_destino, peso = 1, largo = 20, ancho = 15, alto = 10 } = req.body || {};

  if (!cp_destino || !/^\d{5}$/.test(cp_destino)) {
    return res.status(400).json({ error: 'Código postal inválido (5 dígitos)' });
  }

  try {
    const token = await getT1Token();

    // Intentar endpoint de cotización
    const quoteRes = await fetch('https://api.t1envios.com/api/v1/rates', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cp_origen: '06600', // CDMX — ajusta con tu CP de origen
        cp_destino,
        peso,
        largo,
        ancho,
        alto,
      }),
    });

    const quoteData = await quoteRes.json();

    if (!quoteRes.ok) {
      return res.status(quoteRes.status).json({ error: quoteData.message || 'Error al cotizar', raw: quoteData });
    }

    return res.status(200).json({ ok: true, rates: quoteData });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
