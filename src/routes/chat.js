// Chat geral (turistas cadastrados e gestão), em /api/comentarios.
// Qualquer pessoa lê; só quem está logado escreve; o gestor ou o autor podem excluir.
const express = require('express');
const router = express.Router();
const auth = require('../auth');
const community = require('../data/community');

const lastPost = new Map(); // intervalo mínimo entre mensagens do mesmo usuário
const MIN_INTERVAL_MS = 2000;

function fail(res, status, message) {
  return res.status(status).json({ error: message, message });
}

router.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await community.listComments(200));
  } catch (err) {
    console.error('Erro ao listar mensagens:', err);
    fail(res, 500, 'Não foi possível carregar as mensagens.');
  }
});

router.post('/', auth.requireUser, async (req, res) => {
  const mensagem = String((req.body || {}).mensagem || '').trim();
  if (!mensagem) return fail(res, 400, 'Escreva uma mensagem.');
  if (mensagem.length > 600) {
    return fail(res, 400, 'A mensagem pode ter no máximo 600 caracteres.');
  }

  const key = `${req.user.papel}:${req.user.username}`;
  const now = Date.now();
  if (now - (lastPost.get(key) || 0) < MIN_INTERVAL_MS) {
    return fail(res, 429, 'Aguarde alguns segundos para enviar de novo.');
  }
  lastPost.set(key, now);

  try {
    const created = await community.createComment({
      autorId: req.user.id,
      autor: req.user.username,
      papel: req.user.papel,
      mensagem,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    fail(res, 500, 'Não foi possível enviar a mensagem.');
  }
});

router.delete('/:id', auth.requireUser, async (req, res) => {
  try {
    const comment = await community.getComment(req.params.id);
    if (!comment) return fail(res, 404, 'Mensagem não encontrada.');

    const ehGestor = req.user.papel === 'Gestor';
    const ehAutor =
      req.user.id !== null &&
      comment.autorId !== null &&
      String(comment.autorId) === String(req.user.id);
    if (!ehGestor && !ehAutor) {
      return fail(res, 403, 'Você não pode excluir esta mensagem.');
    }

    await community.deleteComment(comment.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir mensagem:', err);
    fail(res, 500, 'Não foi possível excluir a mensagem.');
  }
});

module.exports = router;
