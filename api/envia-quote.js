// Envia.com — cotización de envío en tiempo real
// API key guardada como variable de entorno en Vercel

const ENVIA_BASE = 'https://api.envia.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cp_destino, peso = 0.5, largo = 20, ancho = 15, alto = 10 } = req.body || {};

  if (!cp_destino || !/^\d{5}$/.test(cp_destino)) {
    return res.status(400).json({ error: 'Código postal inválido (5 dígitos requeridos)' });
  }

  const token = process.env.ENVIA_API_KEY;
  if (!token) return res.status(500).json({ error: 'API key no configurada' });

  try {
    const body = {
      origin: {
        name: 'KroshaPatterns',
        company: 'KroshaPatterns',
        email: 'jenny@kroshapatterns.com',
        phone: '5500000000',
        street: 'Calle Origen',
        number: '1',
        district: 'Centro',
        city: 'Ciudad de México',
        state: 'DF',
        country: 'MX',
        postalCode: '06600', // CP de origen — ajustar con tu dirección
      },
      destination: {
        name: 'Cliente',
        company: '',
        email: 'cliente@email.com',
        phone: '5500000000',
        street: 'Calle Destino',
        number: '1',
        district: 'Centro',
        city: 'Ciudad',
        state: 'MX',
        country: 'MX',
        postalCode: cp_destino,
      },
      packages: [{
        content: 'Kit crochet',
        amount: 1,
        type: 'box',
        dimensions: { length: largo, width: ancho, height: alto },
        weight: peso,
        insurance: 0,
        declaredValue: 0,
      }],
      shipment: { carrier: 'all', type: 1 },
      settings: { currency: 'MXN' },
    };

    const response = await fetch(`${ENVIA_BASE}/ship/rate/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Error al cotizar', raw: data });
    }

    // Normalizar respuesta — devolver solo lo necesario para el checkout
    const rates = (data.data || []).map(r => ({
      carrier: r.carrier,
      service: r.service,
      serviceDescription: r.serviceDescription || r.service,
      days: r.deliveryEstimate || r.days || '?',
      price: r.totalPrice || r.price,
      currency: 'MXN',
    })).sort((a, b) => a.price - b.price);

    return res.status(200).json({ ok: true, rates });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
