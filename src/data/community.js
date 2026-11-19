// Contas de turistas e mensagens do chat.
// Com Supabase configurado, grava nas tabelas "usuarios" e "comentarios".
// Sem Supabase, usa memória (só para desenvolvimento: perde tudo ao reiniciar).

const supabase = require('./supabase');

const memUsers = [];
const memComments = [];
let nextUserId = 1;
let nextCommentId = 1;

// Valores só entram em filtros do Supabase depois de validados (letras, números e . _ @ + -).
const SAFE_IDENTIFIER = /^[a-z0-9_.@+-]{3,120}$/;

function userFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    senhaHash: r.senha_hash,
    papel: r.papel || 'Turista',
  };
}

function commentFromRow(r) {
  return {
    id: r.id,
    autorId: r.autor_id,
    autor: r.autor,
    papel: r.papel,
    mensagem: r.mensagem,
    criadoEm: r.created_at,
  };
}

// Lança um erro com code "DUPLICADO" se o usuário ou e-mail já existir.
async function createUser({ username, email, senhaHash }) {
  if (supabase.enabled()) {
    try {
      const rows = await supabase.request('usuarios', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ username, email, senha_hash: senhaHash }),
      });
      return userFromRow(rows[0]);
    } catch (err) {
      if (err.code === '23505' || err.status === 409) {
        const dup = new Error('Usuário ou e-mail já cadastrado.');
        dup.code = 'DUPLICADO';
        throw dup;
      }
      throw err;
    }
  }

  if (memUsers.some((u) => u.username === username || u.email === email)) {
    const dup = new Error('Usuário ou e-mail já cadastrado.');
    dup.code = 'DUPLICADO';
    throw dup;
  }
  const user = { id: nextUserId++, username, email, senhaHash, papel: 'Turista' };
  memUsers.push(user);
  return user;
}

async function findUser(identifier) {
  const id = String(identifier || '').trim().toLowerCase();
  if (!SAFE_IDENTIFIER.test(id)) return null;

  if (supabase.enabled()) {
    const e = encodeURIComponent(id);
    const rows = await supabase.request(
      `usuarios?select=id,username,email,senha_hash,papel&or=(username.eq.${e},email.eq.${e})&limit=1`
    );
    return userFromRow(rows && rows[0]);
  }

  return memUsers.find((u) => u.username === id || u.email === id) || null;
}

async function listComments(limit = 200) {
  if (supabase.enabled()) {
    const rows = await supabase.request(
      `comentarios?select=id,created_at,autor_id,autor,papel,mensagem&order=created_at.desc&limit=${Number(limit)}`
    );
    return rows.map(commentFromRow).reverse();
  }
  return memComments.slice(-limit);
}

async function createComment({ autorId, autor, papel, mensagem }) {
  if (supabase.enabled()) {
    const rows = await supabase.request('comentarios', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ autor_id: autorId, autor, papel, mensagem }),
    });
    return commentFromRow(rows[0]);
  }
  const c = {
    id: nextCommentId++,
    autorId,
    autor,
    papel,
    mensagem,
    criadoEm: new Date().toISOString(),
  };
  memComments.push(c);
  return c;
}

async function getComment(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return null;
  if (supabase.enabled()) {
    const rows = await supabase.request(
      `comentarios?select=id,created_at,autor_id,autor,papel,mensagem&id=eq.${n}&limit=1`
    );
    return rows && rows[0] ? commentFromRow(rows[0]) : null;
  }
  return memComments.find((c) => c.id === n) || null;
}

async function deleteComment(id) {
  const n = Number(id);
  if (supabase.enabled()) {
    await supabase.request(`comentarios?id=eq.${n}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    return;
  }
  const i = memComments.findIndex((c) => c.id === n);
  if (i >= 0) memComments.splice(i, 1);
}

module.exports = {
  createUser,
  findUser,
  listComments,
  createComment,
  getComment,
  deleteComment,
};
