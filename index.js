require('dotenv').config();

const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const authRoutes = require('./src/routes/authApi');
const chatRoutes = require('./src/routes/chat');

const app = express();

// Necessário atrás do proxy da Vercel (IP real do visitante e cookie Secure)
app.set('trust proxy', 1);

// O envio de fotos (/api/admin/upload) aceita corpo maior; o resto fica limitado.
const jsonPequeno = express.json({ limit: '20kb' });
const jsonFoto = express.json({ limit: '2.2mb' });
app.use((req, res, next) =>
  req.path === '/api/admin/upload' ? jsonFoto(req, res, next) : jsonPequeno(req, res, next)
);
app.use(express.static(path.join(__dirname, 'public')));

// As rotas mais específicas vêm antes de /api
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/comentarios', chatRoutes);
app.use('/api', apiRoutes);

// Rotas /api inexistentes respondem em JSON (e não com uma página HTML)
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' });
});

// Erros (por exemplo, JSON inválido no corpo) também respondem em JSON
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Erro interno do servidor.' : 'Requisição inválida.',
  });
});

// Localmente (node index.js) o servidor escuta numa porta.
// Na Vercel o app é apenas exportado e executado como função serverless.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = app;
