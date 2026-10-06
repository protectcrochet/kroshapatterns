export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-scan-pin');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const expectedPin = process.env.SCAN_PIN || process.env.ADMIN_KEY || '';
  const pin = req.headers['x-scan-pin'] || (req.body && req.body.pin) || '';
  if (!expectedPin || pin !== expectedPin) return res.status(401).json({ error: 'PIN incorrecto' });

  const getInv = async () => {
    const raw = await redis.get('krosha:inventory');
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  };
  const getBarcodes = async () => {
    const raw = await redis.get('krosha:barcodes');
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  };

  if (req.method === 'GET') {
    const [inventory, barcodes] = await Promise.all([getInv(), getBarcodes()]);
    return res.status(200).json({ inventory, barcodes });
  }

  if (req.method === 'POST') {
    const { action, barcode, colorName, qty } = req.body || {};

    // Guardar mapeo código → color
    if (action === 'map') {
      if (!barcode || !colorName) return res.status(400).json({ error: 'Faltan datos' });
      const barcodes = await getBarcodes();
      barcodes[barcode] = colorName;
      await redis.set('krosha:barcodes', JSON.stringify(barcodes));
      return res.status(200).json({ ok: true });
    }

    // Escanear: buscar color y descontar 1
    if (action === 'scan') {
      if (!barcode) return res.status(400).json({ error: 'Falta código' });
      const barcodes = await getBarcodes();
      const color = barcodes[barcode];
      if (!color) return res.status(200).json({ needsMapping: true, barcode });
      const inventory = await getInv();
      const prev = inventory[color] ?? 0;
      const newQty = Math.max(0, prev - 1);
      inventory[color] = newQty;
      await redis.set('krosha:inventory', JSON.stringify(inventory));
      return res.status(200).json({ ok: true, color, prev, newQty });
    }

    // Ajuste manual: restar N o fijar cantidad exacta
    if (action === 'adjust') {
      if (!colorName) return res.status(400).json({ error: 'Falta color' });
      const inventory = await getInv();
      const prev = inventory[colorName] ?? 0;
      const newQty = typeof qty === 'number' && qty >= 0 ? qty : Math.max(0, prev - 1);
      inventory[colorName] = newQty;
      await redis.set('krosha:inventory', JSON.stringify(inventory));
      return res.status(200).json({ ok: true, color: colorName, prev, newQty });
    }

    // Deshacer: restaurar cantidad anterior
    if (action === 'undo') {
      if (!colorName || typeof qty !== 'number') return res.status(400).json({ error: 'Faltan datos' });
      const inventory = await getInv();
      inventory[colorName] = qty;
      await redis.set('krosha:inventory', JSON.stringify(inventory));
      return res.status(200).json({ ok: true, color: colorName, newQty: qty });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
