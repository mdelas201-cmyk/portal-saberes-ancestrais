// Acesso simples ao Supabase (PostgREST) por HTTP, sem dependências.
// Usa a chave secreta (service_role / sb_secret_...), que só existe no servidor.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function enabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function request(pathAndQuery, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      // Chaves antigas (service_role) são JWT e vão também em Authorization.
      // Chaves novas (sb_secret_...) não são JWT e vão apenas em apikey.
      ...(SUPABASE_KEY.startsWith('eyJ')
        ? { Authorization: `Bearer ${SUPABASE_KEY}` }
        : {}),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text().catch(() => '');
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = new Error(
      `Supabase respondeu ${res.status}: ${text.slice(0, 200)}`
    );
    err.status = res.status;
    err.code = body && body.code;
    throw err;
  }
  return body;
}

module.exports = { enabled, request };
