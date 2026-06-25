// api/auth.js — Registro, login y pedidos de clientes
import { createHash } from 'crypto';

function hashPwd(pwd){ return createHash('sha256').update(pwd+'krosha_salt_2024').digest('hex'); }
function makeToken(email){ return Buffer.from(`${email}:${Date.now()}:${Math.random()}`).toString('base64url'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });

  // GET — historial de pedidos del usuario autenticado
  if (req.method === 'GET') {
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    const email = await redis.get(`krosha:session:${token}`);
    if (!email) return res.status(401).json({ error: 'Sesión expirada' });
    const raw = await redis.get('krosha:orders');
    const orders = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return res.status(200).json(orders.filter(o => o.email === email));
  }

  if (req.method === 'POST') {
    const { action, email, password, name, token, cart } = req.body || {};

    // ── REGISTER ──
    if (action === 'register') {
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
      const existing = await redis.get(`krosha:user:${email.toLowerCase()}`);
      if (existing) return res.status(400).json({ error: 'Este email ya tiene una cuenta' });
      const user = { email: email.toLowerCase(), name: name || '', passwordHash: hashPwd(password), createdAt: new Date().toISOString() };
      await redis.set(`krosha:user:${email.toLowerCase()}`, JSON.stringify(user));
      const tok = makeToken(email);
      await redis.set(`krosha:session:${tok}`, email.toLowerCase(), { ex: 30 * 24 * 3600 });
      return res.status(200).json({ ok: true, token: tok, email: user.email, name: user.name });
    }

    // ── LOGIN ──
    if (action === 'login') {
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
      const raw = await redis.get(`krosha:user:${email.toLowerCase()}`);
      if (!raw) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
      const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (user.passwordHash !== hashPwd(password)) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
      const tok = makeToken(email);
      await redis.set(`krosha:session:${tok}`, email.toLowerCase(), { ex: 30 * 24 * 3600 });
      return res.status(200).json({ ok: true, token: tok, email: user.email, name: user.name });
    }

    // ── VALIDATE session ──
    if (action === 'validate') {
      if (!token) return res.status(401).json({ error: 'Sin token' });
      const em = await redis.get(`krosha:session:${token}`);
      if (!em) return res.status(401).json({ error: 'Sesión expirada' });
      const raw = await redis.get(`krosha:user:${em}`);
      const user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      return res.status(200).json({ ok: true, email: em, name: user.name || '' });
    }

    // ── LOGOUT ──
    if (action === 'logout') {
      if (token) await redis.del(`krosha:session:${token}`);
      return res.status(200).json({ ok: true });
    }

    // ── SYNC CART ──
    if (action === 'sync-cart') {
      if (!token) return res.status(401).json({ error: 'Sin token' });
      const em = await redis.get(`krosha:session:${token}`);
      if (!em) return res.status(401).json({ error: 'Sesión expirada' });
      if (Array.isArray(cart)) {
        await redis.set(`krosha:cart:${em}`, JSON.stringify(cart), { ex: 90 * 24 * 3600 });
      }
      const saved = await redis.get(`krosha:cart:${em}`);
      return res.status(200).json({ ok: true, cart: saved ? (typeof saved === 'string' ? JSON.parse(saved) : saved) : [] });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
