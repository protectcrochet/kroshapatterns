// Envia.com — cotización de envío en tiempo real (nacional + internacional)
// API key guardada como variable de entorno en Vercel

const ENVIA_BASE = 'https://api.envia.com';

// Carriers domésticos (México) + internacionales
const CARRIERS_MX   = ['fedex','dhl','estafeta','redpack','paquetexpress','ups','sendex'];
const CARRIERS_INTL = ['fedex','dhl','ups']; // Solo estos hacen envíos globales

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    cp_destino,
    pais_destino = 'MX',
    peso  = 0.5,
    largo = 20,
    ancho = 15,
    alto  = 10,
  } = req.body || {};

  const isMX = pais_destino === 'MX';

  // Validación: México requiere 5 dígitos; internacional acepta 3+ caracteres
  if (!cp_destino) {
    return res.status(400).json({ error: 'Código postal requerido' });
  }
  if (isMX && !/^\d{5}$/.test(cp_destino)) {
    return res.status(400).json({ error: 'Código postal inválido (5 dígitos para México)' });
  }
  if (!isMX && cp_destino.trim().length < 3) {
    return res.status(400).json({ error: 'Código postal inválido' });
  }

  const token = process.env.ENVIA_API_KEY;
  if (!token) return res.status(500).json({ error: 'API key no configurada' });

  const CARRIERS = isMX ? CARRIERS_MX : CARRIERS_INTL;

  const makeBody = (carrier) => ({
    origin: {
      name: 'KroshaPatterns', company: 'KroshaPatterns',
      email: 'jenny@kroshapatterns.com', phone: '4421000000',
      street: 'Calle Origen 1', number: '1', district: 'Centro',
      city: 'Querétaro', state: 'QRO', country: 'MX', postalCode: '76030',
    },
    destination: {
      name: 'Cliente', company: '', email: 'cliente@email.com', phone: '5550000000',
      street: 'Calle Destino 1', number: '1', district: 'Centro',
      city: 'Ciudad', state: isMX ? 'MX' : '', country: pais_destino, postalCode: cp_destino,
    },
    packages: [{
      content: 'Kit crochet', amount: 1, type: 'box',
      dimensions: { length: largo, width: ancho, height: alto },
      weight: peso, insurance: 0, declaredValue: 0,
    }],
    shipment: { carrier, type: 1 },
    settings: { currency: 'MXN' },
  });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // Cotizar todos los carriers compatibles en paralelo
    const results = await Promise.allSettled(
      CARRIERS.map(carrier =>
        fetch(`${ENVIA_BASE}/ship/rate/`, {
          method: 'POST', headers,
          body: JSON.stringify(makeBody(carrier)),
        }).then(r => r.json())
      )
    );

    // Combinar y normalizar resultados
    const rates = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const val = result.value;
        const items = val.data || (Array.isArray(val) ? val : null);
        if (items && items.length) {
          items.forEach(r => {
            rates.push({
              carrier: r.carrier || CARRIERS[i],
              service: r.service,
              serviceDescription: r.serviceDescription || r.service,
              days: r.deliveryEstimate || r.days || '?',
              price: r.totalPrice || r.price,
              currency: 'MXN',
            });
          });
        }
      }
    });

    rates.sort((a, b) => a.price - b.price);
    return res.status(200).json({ ok: true, rates, internacional: !isMX });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
