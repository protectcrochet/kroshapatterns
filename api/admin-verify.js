export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, pwdHash } = req.body || {};
  if (!email || !pwdHash) return res.status(400).json({ error: 'Missing fields' });
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPwdHash = (process.env.ADMIN_PWD_HASH || '').toLowerCase().trim();
  if (!adminEmail || !adminPwdHash) {
    return res.status(503).json({ error: 'Admin auth not configured on server' });
  }
  if (email === adminEmail && pwdHash === adminPwdHash) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
}
