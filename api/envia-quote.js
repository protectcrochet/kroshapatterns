// Envia.com — cotización de envío en tiempo real (nacional + internacional)
// API key guardada como variable de entorno en Vercel

const ENVIA_BASE = 'https://api.envia.com';

const CARRIERS_MX   = ['fedex','dhl','estafeta','redpack','paquetexpress','ups','sendex','99minutos','ampm'];
const CARRIERS_INTL = ['fedex','dhl','ups'];

function getMXState(zip) {
  const n = parseInt(zip, 10);
  if (n >= 1000  && n <= 16999) return 'CMX';
  if (n >= 20000 && n <= 20999) return 'AGS';
  if (n >= 21000 && n <= 22999) return 'BC';
  if (n >= 23000 && n <= 23999) return 'BCS';
  if (n >= 24000 && n <= 24999) return 'CAMP';
  if (n >= 25000 && n <= 27999) return 'COAH';
  if (n >= 28000 && n <= 28999) return 'COL';
  if (n >= 29000 && n <= 30999) return 'CHIS';
  if (n >= 31000 && n <= 33999) return 'CHIH';
  if (n >= 34000 && n <= 35999) return 'DGO';
  if (n >= 36000 && n <= 38999) return 'GTO';
  if (n >= 39000 && n <= 40999) return 'GRO';
  if (n >= 41000 && n <= 43999) return 'HGO';
  if (n >= 44000 && n <= 49999) return 'JAL';
  if (n >= 50000 && n <= 57999) return 'MEX';
  if (n >= 58000 && n <= 61999) return 'MICH';
  if (n >= 62000 && n <= 62999) return 'MOR';
  if (n >= 63000 && n <= 63999) return 'NAY';
  if (n >= 64000 && n <= 67999) return 'NL';
  if (n >= 68000 && n <= 71999) return 'OAX';
  if (n >= 72000 && n <= 75999) return 'PUE';
  if (n >= 76000 && n <= 76999) return 'QRO';
  if (n >= 77000 && n <= 77999) return 'QROO';
  if (n >= 78000 && n <= 79999) return 'SLP';
  if (n >= 80000 && n <= 82999) return 'SIN';
  if (n >= 83000 && n <= 85999) return 'SON';
  if (n >= 86000 && n <= 86999) return 'TAB';
  if (n >= 87000 && n <= 89999) return 'TAMPS';
  if (n >= 90000 && n <= 90999) return 'TLAX';
  if (n >= 91000 && n <= 96999) return 'VER';
  if (n >= 97000 && n <= 97999) return 'YUC';
  if (n >= 98000 && n <= 99999) return 'ZAC';
  return 'CDMX';
}

// Envia.com requires a non-empty state for all destinations.
// For MX: derive from ZIP prefix. For US: derive from ZIP prefix. For others: use country code.
function getDestState(country, zip) {
  if (country === 'MX') return getMXState(zip);
  if (country === 'US') {
    const n = parseInt(zip, 10);
    if (n >= 35004 && n <= 36925) return 'AL';
    if (n >= 99501 && n <= 99950) return 'AK';
    if (n >= 85001 && n <= 86556) return 'AZ';
    if (n >= 71601 && n <= 72959) return 'AR';
    if (n >= 90001 && n <= 96162) return 'CA';
    if (n >= 80001 && n <= 81658) return 'CO';
    if (n >= 6001  && n <= 6999)  return 'CT';
    if (n >= 19701 && n <= 19980) return 'DE';
    if (n >= 32004 && n <= 34997) return 'FL';
    if (n >= 30001 && n <= 31999) return 'GA';
    if (n >= 96701 && n <= 96898) return 'HI';
    if (n >= 83201 && n <= 83876) return 'ID';
    if (n >= 60001 && n <= 62999) return 'IL';
    if (n >= 46001 && n <= 47997) return 'IN';
    if (n >= 50001 && n <= 52809) return 'IA';
    if (n >= 66002 && n <= 67954) return 'KS';
    if (n >= 40003 && n <= 42788) return 'KY';
    if (n >= 70001 && n <= 71497) return 'LA';
    if (n >= 3901  && n <= 4992)  return 'ME';
    if (n >= 20601 && n <= 21930) return 'MD';
    if (n >= 1001  && n <= 2791)  return 'MA';
    if (n >= 48001 && n <= 49971) return 'MI';
    if (n >= 55001 && n <= 56763) return 'MN';
    if (n >= 38601 && n <= 39776) return 'MS';
    if (n >= 63001 && n <= 65899) return 'MO';
    if (n >= 59001 && n <= 59937) return 'MT';
    if (n >= 68001 && n <= 69367) return 'NE';
    if (n >= 88901 && n <= 89883) return 'NV';
    if (n >= 3031  && n <= 3897)  return 'NH';
    if (n >= 7001  && n <= 8989)  return 'NJ';
    if (n >= 87001 && n <= 88441) return 'NM';
    if (n >= 10001 && n <= 14975) return 'NY';
    if (n >= 27006 && n <= 28909) return 'NC';
    if (n >= 58001 && n <= 58856) return 'ND';
    if (n >= 43001 && n <= 45999) return 'OH';
    if (n >= 73001 && n <= 74966) return 'OK';
    if (n >= 97001 && n <= 97920) return 'OR';
    if (n >= 15001 && n <= 19640) return 'PA';
    if (n >= 2801  && n <= 2940)  return 'RI';
    if (n >= 29001 && n <= 29948) return 'SC';
    if (n >= 57001 && n <= 57799) return 'SD';
    if (n >= 37010 && n <= 38589) return 'TN';
    if (n >= 73301 && n <= 79999) return 'TX';
    if (n >= 75001 && n <= 75501) return 'TX';
    if (n >= 84001 && n <= 84784) return 'UT';
    if (n >= 5001  && n <= 5907)  return 'VT';
    if (n >= 20101 && n <= 24658) return 'VA';
    if (n >= 98001 && n <= 99403) return 'WA';
    if (n >= 24701 && n <= 26886) return 'WV';
    if (n >= 53001 && n <= 54990) return 'WI';
    if (n >= 82001 && n <= 83128) return 'WY';
    if (n >= 200   && n <= 205)   return 'DC';
    if (n >= 900   && n <= 988)   return 'PR';
    return 'FL'; // fallback
  }
  // For other countries use the country code — satisfies Envia.com's non-empty requirement
  return country;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    cp_destino,
    pais_destino = 'MX',
    peso  = 1,
    largo = 25,
    ancho = 25,
    alto  = 37,
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
      city: 'Ciudad', state: getDestState(pais_destino, cp_destino), country: pais_destino, postalCode: cp_destino,
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

  // Cuerpo sin carrier especificado → Envia.com devuelve TODAS las paqueterías disponibles de la cuenta
  const body = makeBody(null);
  delete body.shipment.carrier;

  try {
    // Una sola llamada — Envia.com devuelve todos los carriers contratados
    const r = await fetch(`${ENVIA_BASE}/ship/rate/`, {
      method: 'POST', headers,
      body: JSON.stringify(body),
    });
    const data = await r.json();
    console.log('[envia-quote]', pais_destino, cp_destino, 'status:', r.status, 'data:', JSON.stringify(data).slice(0,1000));

    const items = data.data || (Array.isArray(data) ? data : []);

    // Envia.com puede devolver el precio en distintos campos según la versión de API
    function extractPrice(r) {
      return r.totalPrice || r.price || r.amount || r.totalAmount || r.rate || r.total || 0;
    }
    function extractCarrier(r) {
      return r.carrier || r.carrierName || r.provider || '';
    }
    function extractDays(r) {
      return r.deliveryEstimate || r.estimatedDelivery || r.days || r.transitDays || '?';
    }

    const rates = items
      .filter(r => extractPrice(r) > 0)
      .map(r => ({
        carrier: extractCarrier(r),
        service: r.service || r.serviceCode || '',
        serviceDescription: r.serviceDescription || r.serviceName || r.service || '',
        days: extractDays(r),
        price: extractPrice(r),
        currency: r.currency || 'MXN',
        _raw: r,
      }));

    // Si la respuesta sin carrier no trajo nada, intenta por separado con cada carrier
    if (!rates.length) {
      const CARRIERS = isMX ? CARRIERS_MX : CARRIERS_INTL;
      const results = await Promise.allSettled(
        CARRIERS.map(carrier =>
          fetch(`${ENVIA_BASE}/ship/rate/`, {
            method: 'POST', headers,
            body: JSON.stringify(makeBody(carrier)),
          }).then(r => r.json())
        )
      );
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const val = result.value;
          const items2 = val.data || (Array.isArray(val) ? val : []);
          items2.filter(r => extractPrice(r) > 0).forEach(r => {
            rates.push({
              carrier: extractCarrier(r) || CARRIERS[i],
              service: r.service || r.serviceCode || '',
              serviceDescription: r.serviceDescription || r.serviceName || r.service || '',
              days: extractDays(r),
              price: extractPrice(r),
              currency: r.currency || 'MXN',
              _raw: r,
            });
          });
        }
      });
    }

    rates.sort((a, b) => a.price - b.price);
    return res.status(200).json({ ok: true, rates, internacional: !isMX, _debug: data, _state: getDestState(pais_destino, cp_destino) });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
