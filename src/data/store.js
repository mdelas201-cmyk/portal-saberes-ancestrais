// Armazenamento de agendamentos. Escolhe o backend pelas variáveis de ambiente:
// 1. Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY): Postgres, persiste na Vercel. Preferido.
// 2. Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN): persiste na Vercel.
// 3. Memória: só para desenvolvimento; perde os dados ao reiniciar.

const supabase = require('./supabase');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const REDIS_KEY = 'bookings';

const memory = [];

function usingRedis() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

function backend() {
  if (supabase.enabled()) return 'supabase';
  if (usingRedis()) return 'redis';
  return 'memory';
}

// ---------- Supabase ----------

// Converte uma linha da tabela para o formato usado pelo app
function fromRow(row) {
  return {
    id: row.id,
    dataRegistro: row.created_at,
    nome: row.nome,
    contato: row.contato,
    data: row.data_desejada,
    pessoas: row.pessoas,
    experiencia: row.experiencia,
    restricoes: row.restricoes,
  };
}

async function saveSupabase(b) {
  const rows = await supabase.request('bookings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      nome: b.nome,
      contato: b.contato,
      data_desejada: b.data,
      pessoas: b.pessoas,
      experiencia: b.experiencia,
      restricoes: b.restricoes,
    }),
  });
  return fromRow(rows[0]);
}

async function listSupabase() {
  const rows = await supabase.request(
    'bookings?select=*&order=created_at.desc&limit=1000'
  );
  return rows.map(fromRow);
}

// ---------- Upstash Redis ----------

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis respondeu ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

// ---------- Interface pública ----------

async function saveBooking(data) {
  if (supabase.enabled()) return saveSupabase(data);

  const booking = { dataRegistro: new Date().toISOString(), ...data };

  if (usingRedis()) {
    const total = await redis(['RPUSH', REDIS_KEY, JSON.stringify(booking)]);
    return { id: total, ...booking };
  }

  const saved = { id: memory.length + 1, ...booking };
  memory.push(saved);
  return saved;
}

// Retorna todos os agendamentos, do mais recente para o mais antigo.
async function listBookings() {
  if (supabase.enabled()) return listSupabase();

  if (usingRedis()) {
    const rows = await redis(['LRANGE', REDIS_KEY, 0, -1]);
    return rows
      .map((row, index) => ({ id: index + 1, ...JSON.parse(row) }))
      .reverse();
  }

  return [...memory].reverse();
}

module.exports = { saveBooking, listBookings, backend };
