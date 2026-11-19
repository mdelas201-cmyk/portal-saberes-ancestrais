// Envio de imagens para o Supabase Storage (bucket público "imagens").
// Só o servidor, com a chave secreta, consegue gravar; qualquer pessoa pode ver as fotos.

const crypto = require('crypto');

const BUCKET = 'imagens';
const MAX_BYTES = 1.5 * 1024 * 1024;
const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function base() {
  return (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function enabled() {
  return Boolean(base() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Recebe "data:image/jpeg;base64,...." e devolve a URL pública da imagem.
async function enviarImagem(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    String(dataUrl || '')
  );
  if (!m) {
    const e = new Error('Formato de imagem inválido. Use JPG, PNG ou WebP.');
    e.status = 400;
    throw e;
  }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    const e = new Error('Imagem muito grande (máximo 1,5 MB).');
    e.status = 413;
    throw e;
  }
  if (!enabled()) {
    const e = new Error(
      'Envio de fotos exige o Supabase configurado. Você pode colar o link de uma imagem.'
    );
    e.status = 503;
    throw e;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${TIPOS[m[1]]}`;
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${nome}`, {
    method: 'POST',
    headers: {
      apikey: key,
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': m[1],
      'Cache-Control': 'public, max-age=31536000',
    },
    body: buffer,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const e = new Error(`Storage respondeu ${res.status}: ${txt.slice(0, 200)}`);
    e.status = 502;
    throw e;
  }
  return `${base()}/storage/v1/object/public/${BUCKET}/${nome}`;
}

module.exports = { enviarImagem, enabled, MAX_BYTES };

// Bucket público para áudio e vídeo. O navegador envia o arquivo diretamente
// ao Supabase usando uma URL temporária assinada; assim o arquivo não passa
// pelo limite de tamanho das funções da Vercel.
const MEDIA_BUCKET = 'midias';
const MEDIA_MAX_BYTES = 100 * 1024 * 1024;
const MEDIA_TYPES = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

async function criarUploadAssinado(contentType, size) {
  if (!enabled()) {
    const e = new Error('O envio de áudio e vídeo exige o Supabase configurado.');
    e.status = 503;
    throw e;
  }
  const tipo = String(contentType || '').toLowerCase();
  const bytes = Number(size);
  if (!MEDIA_TYPES[tipo]) {
    const e = new Error('Formato não permitido. Use MP4/WebM para vídeo ou MP3/M4A/OGG/WAV para áudio.');
    e.status = 400;
    throw e;
  }
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > MEDIA_MAX_BYTES) {
    const e = new Error('Arquivo inválido ou maior que 100 MB.');
    e.status = 413;
    throw e;
  }

  const nome = `cards/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${MEDIA_TYPES[tipo]}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${base()}/storage/v1/object/upload/sign/${MEDIA_BUCKET}/${nome}`, {
    method: 'POST',
    headers: {
      apikey: key,
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ upsert: false }),
  });
  const raw = await res.text().catch(() => '');
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!res.ok) {
    const e = new Error(`Não foi possível preparar o envio no Supabase (${res.status}): ${raw.slice(0, 180)}`);
    e.status = 502;
    throw e;
  }
  const signed = body.signedURL || body.signedUrl;
  if (!signed || !body.token) {
    const e = new Error('O Supabase não retornou uma autorização de envio válida.');
    e.status = 502;
    throw e;
  }
  const uploadUrl = /^https?:\/\//i.test(signed)
    ? signed
    : `${base()}/storage/v1${signed.startsWith('/') ? signed : `/${signed}`}`;
  return {
    uploadUrl,
    publicUrl: `${base()}/storage/v1/object/public/${MEDIA_BUCKET}/${nome}`,
    contentType: tipo,
    maxBytes: MEDIA_MAX_BYTES,
  };
}

module.exports.criarUploadAssinado = criarUploadAssinado;
module.exports.MEDIA_MAX_BYTES = MEDIA_MAX_BYTES;

