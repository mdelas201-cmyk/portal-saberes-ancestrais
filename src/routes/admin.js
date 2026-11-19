const express = require('express');
const router = express.Router();
const auth = require('../auth');
const { listBookings } = require('../data/store');
const cards = require('../data/cards');
const { enviarImagem, criarUploadAssinado } = require('../data/storage');

// Limite simples de tentativas de login por IP (em memória).
// Em ambiente serverless é um freio parcial: cada instância tem seu próprio contador.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();

function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    attempts.set(ip, { start: now, count: 1 });
  } else {
    entry.count += 1;
  }
}

router.post('/login', async (req, res) => {
  if (!auth.isConfigured()) {
    return res.status(503).json({
      message:
        'Login do administrador não configurado. Defina ADMIN_USER, ADMIN_PASSWORD e SESSION_SECRET.',
    });
  }

  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res
      .status(429)
      .json({ message: 'Muitas tentativas. Aguarde alguns minutos.' });
  }

  const { usuario, senha } = req.body || {};
  if (!auth.checkCredentials(usuario, senha)) {
    registerFailure(ip);
    await new Promise((resolve) => setTimeout(resolve, 600));
    return res.status(401).json({ message: 'Usuário ou senha incorretos.' });
  }

  attempts.delete(ip);
  auth.setSessionCookie(
    req,
    res,
    auth.createToken({ t: 'admin', u: process.env.ADMIN_USER })
  );
  res.json({ message: 'Login realizado.' });
});

router.post('/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ message: 'Sessão encerrada.' });
});

router.get('/me', auth.requireAdmin, (req, res) => {
  res.json({ usuario: req.admin.u });
});

router.get('/bookings', auth.requireAdmin, async (req, res) => {
  try {
    const bookings = await listBookings();
    res.json(bookings);
  } catch (err) {
    console.error('Erro ao listar agendamentos:', err);
    res.status(500).json({ message: 'Não foi possível carregar os agendamentos.' });
  }
});

// ===== Cards editáveis (Gastronomia, Oficinas, Entidades) =====

function texto(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// Valida e limpa os campos de um card. Devolve { erro } ou { dados }.
function limparCard(body) {
  const b = body || {};
  const titulo = texto(b.titulo, 120);
  if (!titulo) return { erro: 'Informe o título do card.' };

  const imagens = Array.isArray(b.imagens) ? b.imagens : [];
  if (imagens.length > 8) return { erro: 'Use no máximo 8 fotos por card.' };
  const urls = [];
  for (const u of imagens) {
    const url = texto(u, 500);
    if (!url) continue;
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
      return { erro: 'Link de imagem inválido (use um endereço http ou https).' };
    }
    urls.push(url);
  }

  const videoUrl = texto(b.video_url, 1000);
  const audioUrl = texto(b.audio_url, 1000);
  for (const [nome, url] of [['vídeo', videoUrl], ['áudio', audioUrl]]) {
    if (url && !/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
      return { erro: `Link de ${nome} inválido.` };
    }
  }

  return {
    dados: {
      titulo,
      subtitulo: texto(b.subtitulo, 120),
      icone: texto(b.icone, 8),
      descricao: texto(b.descricao, 600),
      lenda: texto(b.lenda, 2000),
      video_url: videoUrl,
      audio_url: audioUrl,
      imagens: urls,
    },
  };
}

function falha(res, err, msg) {
  console.error(msg, err);
  res.status(500).json({ message: msg });
}

router.post('/media/sign', auth.requireAdmin, async (req, res) => {
  try {
    const { contentType, size } = req.body || {};
    const dados = await criarUploadAssinado(contentType, size);
    res.status(201).json(dados);
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ message: err.message });
    }
    if (err.status === 503) {
      return res.status(503).json({ message: err.message });
    }
    falha(res, err, 'Não foi possível preparar o envio da mídia.');
  }
});

router.post('/upload', auth.requireAdmin, async (req, res) => {
  try {
    const url = await enviarImagem((req.body || {}).dataUrl);
    res.status(201).json({ url });
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ message: err.message });
    }
    if (err.status === 503) {
      return res.status(503).json({ message: err.message });
    }
    falha(res, err, 'Não foi possível enviar a imagem agora.');
  }
});

// Primeira edição de uma categoria: grava os cards padrão do site no banco
// para que o gestor possa editá-los. Só funciona se a categoria ainda estiver vazia.
router.post('/cards/seed', auth.requireAdmin, async (req, res) => {
  const { categoria, itens } = req.body || {};
  if (!cards.CATEGORIAS.includes(categoria) || !Array.isArray(itens)) {
    return res.status(400).json({ message: 'Dados inválidos.' });
  }
  if (itens.length === 0 || itens.length > 30) {
    return res.status(400).json({ message: 'Lista de cards inválida.' });
  }
  const limpos = [];
  for (const item of itens) {
    const r = limparCard(item);
    if (r.erro) return res.status(400).json({ message: r.erro });
    limpos.push(r.dados);
  }
  try {
    if ((await cards.countCards(categoria)) > 0) {
      return res.json(await cards.listCards(categoria));
    }
    res.status(201).json(await cards.createCards(categoria, limpos));
  } catch (err) {
    falha(res, err, 'Não foi possível preparar os cards para edição.');
  }
});

router.post('/cards', auth.requireAdmin, async (req, res) => {
  const categoria = (req.body || {}).categoria;
  if (!cards.CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ message: 'Categoria inválida.' });
  }
  const r = limparCard(req.body);
  if (r.erro) return res.status(400).json({ message: r.erro });
  try {
    const [novo] = await cards.createCards(categoria, [r.dados]);
    res.status(201).json(novo);
  } catch (err) {
    falha(res, err, 'Não foi possível criar o card.');
  }
});

router.put('/cards/:id', auth.requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Card inválido.' });
  }
  const r = limparCard(req.body);
  if (r.erro) return res.status(400).json({ message: r.erro });
  try {
    const atualizado = await cards.updateCard(id, r.dados);
    if (!atualizado) return res.status(404).json({ message: 'Card não encontrado.' });
    res.json(atualizado);
  } catch (err) {
    falha(res, err, 'Não foi possível salvar o card.');
  }
});

router.delete('/cards/:id', auth.requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: 'Card inválido.' });
  }
  try {
    const card = await cards.getCard(id);
    if (!card) return res.status(404).json({ message: 'Card não encontrado.' });
    if ((await cards.countCards(card.categoria)) <= 1) {
      return res
        .status(409)
        .json({ message: 'Mantenha ao menos um card na categoria.' });
    }
    await cards.deleteCard(id);
    res.json({ message: 'Card excluído.' });
  } catch (err) {
    falha(res, err, 'Não foi possível excluir o card.');
  }
});

module.exports = router;
