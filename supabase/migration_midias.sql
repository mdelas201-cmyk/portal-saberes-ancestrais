-- Execute no Supabase: SQL Editor > New query > cole e clique em Run.
-- Migração segura para projetos que já possuem a tabela public.cards.

alter table public.cards
  add column if not exists video_url text not null default '',
  add column if not exists audio_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'midias',
  'midias',
  true,
  104857600,
  array[
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
