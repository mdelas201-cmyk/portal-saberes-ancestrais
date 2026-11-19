// Autenticação, sem dependências externas.
// Sessões sem estado: tokens assinados com HMAC (funciona em serverless/Vercel).
//   - Gestor (ADMIN_USER/ADMIN_PASSWORD): token t="admin", também enviado em cookie HttpOnly
//     para o painel /admin.html.
//   - Turista cadastrado: token t="user", enviado no cabeçalho Authorization: Bearer.
// O tipo (t) vai dentro do token assinado, então um turista não consegue se passar por gestor.

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = 'admin_session';
const SESSION_SECONDS = 8 * 60 * 60; // 8 horas

function secretOk() {
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret && secret.length >= 16);
}

// Login do gestor configurado?
function isConfigured() {
  const { ADMIN_USER, ADMIN_PASSWORD } = process.env;
  return Boolean(ADMIN_USER && ADMIN_PASSWORD && secretOk());
}

function sign(data) {
  return crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(data)
    .digest('base64url');
}

// Comparação em tempo constante (via hash, para aceitar tamanhos diferentes)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// O usuário do gestor não diferencia maiúsculas de minúsculas; a senha diferencia.
function isAdminUsername(user) {
  if (!process.env.ADMIN_USER) return false;
  return safeEqual(
    String(user || '').trim().toLowerCase(),
    process.env.ADMIN_USER.trim().toLowerCase()
  );
}

function checkCredentials(user, password) {
  const userOk = isAdminUsername(user);
  const passOk = safeEqual(password || '', process.env.ADMIN_PASSWORD || '');
  return userOk && passOk;
}

// payload: { t: 'admin' | 'user', u: nome, id?: número }
function createToken(payload) {
  if (!secretOk()) throw new Error('SESSION_SECRET não configurado.');
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + SESSION_SECONDS * 1000 })
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  if (!secretOk() || !token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    try {
      cookies[part.slice(0, index).trim()] = decodeURIComponent(
        part.slice(index + 1).trim()
      );
    } catch {
      /* cookie malformado: ignora */
    }
  });
  return cookies;
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_SECONDS}`,
  ];
  if (req.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  );
}

// Sessão do gestor (cookie). Só aceita tokens do tipo "admin".
function getSession(req) {
  if (!isConfigured()) return null;
  const data = verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  return data && data.t === 'admin' ? data : null;
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ message: 'Não autenticado.' });
  }
  req.admin = session;
  next();
}

// Sessão de quem usa o chat (Bearer). Aceita turista ou gestor.
function getUserSession(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const data = verifyToken(match[1].trim());
  if (!data || (data.t !== 'user' && data.t !== 'admin')) return null;
  if (data.t === 'admin' && !isConfigured()) return null;
  return {
    id: data.t === 'user' ? data.id : null,
    username: data.u,
    papel: data.t === 'admin' ? 'Gestor' : 'Turista',
  };
}

function requireUser(req, res, next) {
  const user = getUserSession(req);
  if (!user) {
    const msg = 'Faça login para continuar.';
    return res.status(401).json({ error: msg, message: msg });
  }
  req.user = user;
  next();
}

// ---------- Senhas de turistas (scrypt, com sal aleatório) ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  secretOk,
  isConfigured,
  isAdminUsername,
  checkCredentials,
  createToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  getSession,
  requireAdmin,
  getUserSession,
  requireUser,
  hashPassword,
  verifyPassword,
};
