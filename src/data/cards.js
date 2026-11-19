// Cards editáveis pelo gestor (Gastronomia, Oficinas, Entidades Lendárias).
// Supabase (tabela "cards") quando configurado; senão memória (some ao reiniciar).

const supabase = require('./supabase');

const CATEGORIAS = ['gastronomia', 'oficinas', 'entidades'];

const memoria = [];
let proximoId = 1;

function normalizar(row) {
  const imagens = Array.isArray(row.imagens) ? row.imagens.filter(Boolean) : [];
  return {
    id: row.id,
    categoria: row.categoria,
    titulo: row.titulo,
    subtitulo: row.subtitulo || '',
    icone: row.icone || '',
    descricao: row.descricao || '',
    lenda: row.lenda || '',
    video: row.video_url || '',
    audio: row.audio_url || '',
    imagens,
    imagem: imagens[0] || '',
    fromDb: true,
  };
}

function backend() {
  return supabase.enabled() ? 'supabase' : 'memory';
}

async function listCards(categoria) {
  if (supabase.enabled()) {
    const rows = await supabase.request(
      `cards?categoria=eq.${encodeURIComponent(categoria)}&order=id.asc&select=*`
    );
    return (rows || []).map(normalizar);
  }
  return memoria.filter((c) => c.categoria === categoria).map(normalizar);
}

async function getCard(id) {
  if (supabase.enabled()) {
    const rows = await supabase.request(
      `cards?id=eq.${Number(id)}&select=*&limit=1`
    );
    return rows && rows[0] ? normalizar(rows[0]) : null;
  }
  const c = memoria.find((m) => m.id === Number(id));
  return c ? normalizar(c) : null;
}

async function createCards(categoria, itens) {
  const linhas = itens.map((i) => ({ ...i, categoria }));
  if (supabase.enabled()) {
    const rows = await supabase.request('cards', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(linhas),
    });
    return (rows || []).map(normalizar);
  }
  return linhas.map((l) => {
    const novo = { ...l, id: proximoId++ };
    memoria.push(novo);
    return normalizar(novo);
  });
}

async function updateCard(id, campos) {
  if (supabase.enabled()) {
    const rows = await supabase.request(`cards?id=eq.${Number(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...campos, updated_at: new Date().toISOString() }),
    });
    return rows && rows[0] ? normalizar(rows[0]) : null;
  }
  const c = memoria.find((m) => m.id === Number(id));
  if (!c) return null;
  Object.assign(c, campos);
  return normalizar(c);
}

async function deleteCard(id) {
  if (supabase.enabled()) {
    await supabase.request(`cards?id=eq.${Number(id)}`, { method: 'DELETE' });
    return;
  }
  const idx = memoria.findIndex((m) => m.id === Number(id));
  if (idx >= 0) memoria.splice(idx, 1);
}

async function countCards(categoria) {
  return (await listCards(categoria)).length;
}

module.exports = {
  CATEGORIAS,
  backend,
  listCards,
  getCard,
  createCards,
  updateCard,
  deleteCard,
  countCards,
};
