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

  const pinList = (process.env.SCAN_PINS || process.env.SCAN_PIN || process.env.ADMIN_KEY || '')
    .split(',').map(p => p.trim()).filter(Boolean);
  const pin = req.headers['x-scan-pin'] || (req.body && req.body.pin) || '';
  if (!pinList.length || !pinList.includes(pin)) return res.status(401).json({ error: 'PIN incorrecto' });

  const getInv = async () => {
    const raw = await redis.get('krosha:inventory');
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  };
  const getBarcodes = async () => {
    const raw = await redis.get('krosha:barcodes');
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  };

  function maskPin(p) {
    if (!p || p.length < 2) return '?';
    return '*'.repeat(p.length - 2) + p.slice(-2);
  }

  async function logMovement(entry) {
    const raw = await redis.get('krosha:movements');
    const log = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    log.unshift(entry);
    if (log.length > 1000) log.length = 1000;
    await redis.set('krosha:movements', JSON.stringify(log));
  }

  if (req.method === 'GET') {
    const [inventory, barcodes] = await Promise.all([getInv(), getBarcodes()]);
    return res.status(200).json({ inventory, barcodes });
  }

  if (req.method === 'POST') {
    const { action, barcode, colorName, qty } = req.body || {};

    if (action === 'history') {
      const { limit = 200, offset = 0 } = req.body || {};
      const raw = await redis.get('krosha:movements');
      const log = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      return res.status(200).json({ movements: log.slice(offset, offset + limit), total: log.length });
    }

    if (action === 'map') {
      if (!barcode || !colorName) return res.status(400).json({ error: 'Faltan datos' });
      const barcodes = await getBarcodes();
      barcodes[barcode] = colorName;
      await redis.set('krosha:barcodes', JSON.stringify(barcodes));
      return res.status(200).json({ ok: true });
    }

    if (action === 'bulk-map') {
      const { mappings } = req.body || {};
      if (!Array.isArray(mappings)) return res.status(400).json({ error: 'Faltan datos' });
      const barcodes = await getBarcodes();
      for (const m of mappings) {
        if (m.barcode && m.colorName) barcodes[m.barcode] = m.colorName;
      }
      await redis.set('krosha:barcodes', JSON.stringify(barcodes));
      return res.status(200).json({ ok: true, count: mappings.length });
    }

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
      await logMovement({ ts: Date.now(), color, op: 'scan', delta: -1, prev, newQty, pin: maskPin(pin) });
      return res.status(200).json({ ok: true, color, prev, newQty });
    }

    if (action === 'adjust') {
      if (!colorName) return res.status(400).json({ error: 'Falta color' });
      const inventory = await getInv();
      const prev = inventory[colorName] ?? 0;
      const newQty = typeof qty === 'number' && qty >= 0 ? qty : Math.max(0, prev - 1);
      inventory[colorName] = newQty;
      await redis.set('krosha:inventory', JSON.stringify(inventory));
      await logMovement({ ts: Date.now(), color: colorName, op: 'adjust', delta: newQty - prev, prev, newQty, pin: maskPin(pin) });
      return res.status(200).json({ ok: true, color: colorName, prev, newQty });
    }

    if (action === 'undo') {
      if (!colorName || typeof qty !== 'number') return res.status(400).json({ error: 'Faltan datos' });
      const inventory = await getInv();
      const prev = inventory[colorName] ?? 0;
      inventory[colorName] = qty;
      await redis.set('krosha:inventory', JSON.stringify(inventory));
      await logMovement({ ts: Date.now(), color: colorName, op: 'undo', delta: qty - prev, prev, newQty: qty, pin: maskPin(pin) });
      return res.status(200).json({ ok: true, color: colorName, newQty: qty });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
