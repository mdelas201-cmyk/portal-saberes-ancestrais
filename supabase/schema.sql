-- Execute no Supabase: SQL Editor > New query > cole este arquivo > Run.
-- Pode ser executado de novo sem problemas: só cria o que ainda não existe.

-- ===== Agendamentos =====
create table if not exists public.bookings (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  nome           text   not null check (char_length(nome) between 1 and 120),
  contato        text   not null check (char_length(contato) between 1 and 120),
  data_desejada  date   not null,
  pessoas        int    not null default 1 check (pessoas between 1 and 100),
  experiencia    text   not null default '' check (char_length(experiencia) <= 80),
  restricoes     text   not null default '' check (char_length(restricoes) <= 500)
);

create index if not exists bookings_created_at_idx
  on public.bookings (created_at desc);

-- ===== Contas de turistas =====
create table if not exists public.usuarios (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  username    text not null unique check (username ~ '^[a-z0-9_.-]{3,30}$'),
  email       text not null unique check (char_length(email) <= 120),
  senha_hash  text not null,
  papel       text not null default 'Turista'
);

-- ===== Mensagens do chat =====
create table if not exists public.comentarios (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  autor_id    bigint references public.usuarios (id) on delete set null,
  autor       text not null,
  papel       text not null default 'Turista',
  mensagem    text not null check (char_length(mensagem) between 1 and 600)
);

create index if not exists comentarios_created_at_idx
  on public.comentarios (created_at desc);

-- ===== Cards editáveis pelo gestor =====
create table if not exists public.cards (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  categoria   text not null check (categoria in ('gastronomia','oficinas','entidades')),
  titulo      text not null check (char_length(titulo) between 1 and 120),
  subtitulo   text not null default '' check (char_length(subtitulo) <= 120),
  icone       text not null default '' check (char_length(icone) <= 8),
  descricao   text not null default '' check (char_length(descricao) <= 600),
  lenda       text not null default '' check (char_length(lenda) <= 2000),
  imagens     jsonb not null default '[]'::jsonb
);

create index if not exists cards_categoria_idx on public.cards (categoria, id);

-- ===== Fotos (Storage) =====
-- Bucket público para leitura; só o servidor (chave secreta) consegue gravar.
insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', true)
on conflict (id) do nothing;


-- ===== Mídias dos cards (áudio e vídeo) =====
-- ALTER TABLE também atualiza instalações que já possuem a tabela cards.
alter table public.cards add column if not exists video_url text not null default '';
alter table public.cards add column if not exists audio_url text not null default '';

-- Bucket público para reprodução; o servidor autoriza uploads com URL assinada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'midias',
  'midias',
  true,
  104857600,
  array['video/mp4','video/webm','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ===== Segurança =====
-- Com RLS ativado e SEM nenhuma policy, a chave pública (anon) não lê nem grava nada.
-- Só o servidor do portal acessa as tabelas, usando a chave secreta (que ignora o RLS).
alter table public.bookings    enable row level security;
alter table public.usuarios    enable row level security;
alter table public.comentarios enable row level security;
alter table public.cards       enable row level security;
