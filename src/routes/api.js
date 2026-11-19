const express = require('express');
const router = express.Router();
const { entities, gastronomia, oficinas } = require('../data/mockData');
const { saveBooking } = require('../data/store');
const cards = require('../data/cards');

// Se o gestor já editou a categoria, devolve os cards do banco; senão, os padrões.
async function responder(res, categoria, padrao) {
  res.set('Cache-Control', 'no-store');
  try {
    const doBanco = await cards.listCards(categoria);
    return res.json(doBanco.length > 0 ? doBanco : padrao);
  } catch (err) {
    console.error('Erro ao listar cards:', err);
    return res.json(padrao);
  }
}

router.get('/entities', (req, res) => {
  const { category } = req.query;
  const padrao =
    category && category !== 'todos'
      ? entities.filter((e) => e.cat === category)
      : entities;
  return responder(res, 'entidades', padrao);
});

router.get('/gastronomia', (req, res) => responder(res, 'gastronomia', gastronomia));

router.get('/oficinas', (req, res) => responder(res, 'oficinas', oficinas));

router.post('/bookings', async (req, res) => {
  const { nome, contato, data, pessoas, experiencia, restricoes } = req.body || {};

  if (!nome || !contato || !data) {
    return res
      .status(400)
      .json({ message: 'Informe nome, contato e data desejada.' });
  }

  try {
    const agendamento = await saveBooking({
      nome: String(nome).trim().slice(0, 120),
      contato: String(contato).trim().slice(0, 120),
      data: String(data).slice(0, 10),
      pessoas: Math.min(Math.max(Number(pessoas) || 1, 1), 100),
      experiencia: String(experiencia || '').slice(0, 80),
      restricoes: String(restricoes || '').slice(0, 500),
    });

    res.status(201).json({
      message: 'Agendamento pré-registrado com sucesso!',
      agendamento,
    });
  } catch (err) {
    console.error('Erro ao salvar agendamento:', err);
    res
      .status(500)
      .json({ message: 'Não foi possível registrar o agendamento agora.' });
  }
});

module.exports = router;
