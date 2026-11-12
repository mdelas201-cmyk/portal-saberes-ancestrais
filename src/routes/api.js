const express = require('express');
const router = express.Router();
const { entities, saberes, vivencias, bookings } = require('../data/mockData');

router.get('/entities', (req, res) => {
    const { category } = req.query;
    if (category && category !== 'todos') {
        const filtered = entities.filter(e => e.cat === category);
        return res.json(filtered);
    }
    res.json(entities);
});

router.get('/saberes', (req, res) => {
    res.json(saberes);
});

router.get('/vivencias', (req, res) => {
    res.json(vivencias);
});

router.post('/bookings', (req, res) => {
    const novoAgendamento = {
        id: bookings.length + 1,
        dataRegistro: new Date().toISOString(),
        ...req.body
    };
    bookings.push(novoAgendamento);
    console.log('Novo agendamento recebido:', novoAgendamento);
    
    res.status(201).json({
        message: 'Agendamento pré-registrado com sucesso!',
        agendamento: novoAgendamento
    });
});

module.exports = router;
