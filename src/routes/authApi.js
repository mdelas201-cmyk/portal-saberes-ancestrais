// Login e cadastro para o site (turistas e gestor), em /api/auth.
const express = require('express');
const router = express.Router();
const auth = require('../auth');
const community = require('../data/community');

// Limite simples de tentativas por IP (em memória; em serverless é um freio parcial).
const MAX_ATTEMPTS = 15;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function blocked(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.start > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.start > WINDOW_MS) {
    attempts.set(ip, { start: Date.now(), count: 1 });
  } else {
    entry.count += 1;
  }
}

function fail(res, status, message) {
  return res.status(status).json({ error: message, message });
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.papel };
}

const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@,()<>"]+@[^\s@,()<>"]+\.[^\s@,()<>"]+$/;

router.post('/register', async (req, res) => {
  if (!auth.secretOk()) {
    return fail(res, 503, 'Servidor sem SESSION_SECRET configurado.');
  }
  if (blocked(req.ip)) {
    return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
  }

  const { username, email, senha } = req.body || {};
  const user = String(username || '').trim().toLowerCase();
  const mail = String(email || '').trim().toLowerCase();
  const password = String(senha || '');

  if (!USERNAME_RE.test(user)) {
    return fail(res, 400, 'Usuário: 3 a 30 caracteres (letras, números, ponto, hífen ou _).');
  }
  if (mail.length > 120 || !EMAIL_RE.test(mail)) {
    return fail(res, 400, 'Informe um e-mail válido.');
  }
  if (password.length < 8 || password.length > 100) {
    return fail(res, 400, 'A senha deve ter de 8 a 100 caracteres.');
  }
  if (auth.isAdminUsername(user)) {
    return fail(res, 400, 'Esse nome de usuário não está disponível.');
  }

  registerFailure(req.ip); // cada cadastro conta no limite, para frear criação em massa
  try {
    const created = await community.createUser({
      username: user,
      email: mail,
      senhaHash: await auth.hashPassword(password),
    });
    const token = auth.createToken({ t: 'user', u: created.username, id: created.id });
    res.status(201).json({ token, user: publicUser(created) });
  } catch (err) {
    if (err.code === 'DUPLICADO') {
      return fail(res, 409, 'Usuário ou e-mail já cadastrado.');
    }
    console.error('Erro no cadastro:', err);
    fail(res, 500, 'Não foi possível criar a conta agora.');
  }
});

router.post('/login', async (req, res) => {
  if (!auth.secretOk()) {
    return fail(res, 503, 'Servidor sem SESSION_SECRET configurado.');
  }
  if (blocked(req.ip)) {
    return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
  }

  const { identifier, senha } = req.body || {};
  const wrong = 'Usuário ou senha incorretos.';

  try {
    // Gestor: mesmas credenciais do painel (ADMIN_USER / ADMIN_PASSWORD)
    if (auth.isConfigured() && auth.isAdminUsername(identifier)) {
      if (!auth.checkCredentials(identifier, senha)) {
        registerFailure(req.ip);
        await new Promise((r) => setTimeout(r, 600));
        return fail(res, 401, wrong);
      }
      const token = auth.createToken({ t: 'admin', u: process.env.ADMIN_USER });
      auth.setSessionCookie(req, res, token);
      attempts.delete(req.ip);
      return res.json({
        token,
        user: { id: null, username: process.env.ADMIN_USER, role: 'Gestor' },
      });
    }

    // Turista cadastrado
    const found = await community.findUser(identifier);
    // Mesmo sem usuário, calcula um hash para não revelar (pelo tempo) se a conta existe
    const ok = found
      ? await auth.verifyPassword(senha, found.senhaHash)
      : (await auth.verifyPassword(senha, 'scrypt$00$00'), false);
    if (!ok) {
      registerFailure(req.ip);
      await new Promise((r) => setTimeout(r, 600));
      return fail(res, 401, wrong);
    }

    attempts.delete(req.ip);
    const token = auth.createToken({ t: 'user', u: found.username, id: found.id });
    res.json({ token, user: publicUser(found) });
  } catch (err) {
    console.error('Erro no login:', err);
    fail(res, 500, 'Não foi possível entrar agora.');
  }
});

router.get('/me', auth.requireUser, (req, res) => {
  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.papel },
  });
});

module.exports = router;
