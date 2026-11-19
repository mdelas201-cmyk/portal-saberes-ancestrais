# Portal Saberes Ancestrais Macuxi

Portal de turismo de base comunitária da **Comunidade Indígena Raposa I** (povo Macuxi, Normandia, Roraima). Apresenta a história do território, gastronomia, oficinas e entidades da cosmologia Macuxi, com galeria de fotos, pré-agendamento de visitas, contas de turistas, chat da comunidade e área do gestor.

## Tecnologias

- Node.js 18+ e Express 5 (API)
- HTML, Tailwind CSS (CDN) e JavaScript puro (front-end)
- Supabase (Postgres) para agendamentos, contas e chat (Upstash Redis é alternativa só para agendamentos)

## Como rodar localmente

```bash
npm install
cp .env.example .env     # preencha as variáveis
node --env-file=.env --watch index.js
```

Acesse http://localhost:3000. A porta pode ser alterada com a variável `PORT`.

Sem Supabase configurado, agendamentos, contas e mensagens ficam em memória e se perdem ao reiniciar (bom para testar).

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Login do gestor (painel e chat como "Gestor") |
| `SESSION_SECRET` | Texto aleatório (16+ caracteres) que assina as sessões. Obrigatório para qualquer login. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Banco de dados. A chave é a **secreta** (`sb_secret_...` ou `service_role`). Nunca no front-end nem no GitHub. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Opcional: guarda só os agendamentos no Redis, se o Supabase não estiver configurado |

Gere um `SESSION_SECRET` com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Banco de dados (Supabase)

1. Crie um projeto em supabase.com.
2. Abra **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas `bookings`, `usuarios` e `comentarios` com o RLS ativado e sem policies: a chave pública não acessa nada, só o servidor. O arquivo pode ser executado de novo sem problemas (útil ao atualizar o projeto).
3. Em **Project Settings → API Keys**, copie a chave secreta para `SUPABASE_SERVICE_ROLE_KEY`. A **Project URL** fica em **Data API**.

## Funcionalidades

- **Visitantes** navegam pelas abas, veem as fotos e leem o chat.
- **Agendar:** formulário de pré-agendamento, gravado no banco.
- **Turistas** criam conta (usuário, e-mail e senha de 8+ caracteres) e escrevem no chat. Podem excluir as próprias mensagens. As senhas são guardadas com hash (scrypt), nunca em texto.
- **Gestor** entra pelo botão **Login** com `ADMIN_USER`/`ADMIN_PASSWORD`: escreve no chat como "Gestor", exclui qualquer mensagem e acessa `/admin.html`, com a lista de agendamentos. A página `/login.html` também continua funcionando como entrada direta do painel.

## Estrutura

```
index.js                App Express (escuta a porta local ou é exportado para a Vercel)
public/index.html       Site (abas, galeria, chat, modal de login)
public/login.js         Login, cadastro e sessão do site
public/login.html       Login direto do painel do gestor
public/admin.html       Painel com os agendamentos
src/auth.js             Tokens assinados, senhas e verificação de permissões
src/routes/api.js       Conteúdo e agendamentos
src/routes/authApi.js   /api/auth: cadastro e login
src/routes/chat.js      /api/comentarios: chat
src/routes/admin.js     /api/admin: painel do gestor
src/data/               Dados (mockData), Supabase, agendamentos (store) e contas/chat (community)
supabase/schema.sql     Tabelas para criar no Supabase
```

## API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/entities?category=...` | público | Entidades (filtro: ritual, paisagem, espirito). Devolve os cards editados pelo gestor, se houver |
| GET | `/api/gastronomia`, `/api/oficinas` | público | Conteúdo (cards editados pelo gestor, se houver; senão os padrões) |
| POST | `/api/bookings` | público | Pré-agendamento (`nome`, `contato`, `data` obrigatórios) |
| POST | `/api/auth/register` | público | Cria conta de turista (`username`, `email`, `senha`) |
| POST | `/api/auth/login` | público | Entra (`identifier` = usuário ou e-mail, `senha`). Serve turistas e gestor. |
| GET | `/api/auth/me` | logado | Dados da sessão |
| GET | `/api/comentarios` | público | Mensagens do chat |
| POST | `/api/comentarios` | logado | Envia mensagem (até 600 caracteres) |
| DELETE | `/api/comentarios/:id` | autor ou gestor | Exclui mensagem |
| POST | `/api/admin/login`, `/api/admin/logout` | gestor | Sessão do painel |
| GET | `/api/admin/me`, `/api/admin/bookings` | gestor | Painel e agendamentos |
| POST | `/api/admin/cards` | gestor | Cria card (`categoria`: gastronomia, oficinas ou entidades; `titulo`, `subtitulo`, `icone`, `descricao`, `lenda`, `imagens`) |
| PUT / DELETE | `/api/admin/cards/:id` | gestor | Edita / exclui card (a categoria mantém ao menos 1 card) |
| POST | `/api/admin/cards/seed` | gestor | Grava os cards padrão no banco na primeira edição de uma categoria |
| POST | `/api/admin/upload` | gestor | Envia uma foto (`dataUrl`) ao Supabase Storage e devolve a URL |

## Edição de cards pelo gestor

Logado como gestor, o site mostra **＋ Adicionar card** no topo de Gastronomia, Oficinas e Entidades,
e **✏️ Editar** em cada card (e dentro do card aberto). É possível mudar título, subtítulo, ícone,
textos e fotos (enviar do computador ou colar um link; a primeira foto é a capa) e excluir cards.

- Na primeira edição de uma categoria, os cards padrão são copiados para o banco (tabela `cards`).
- As fotos enviadas vão para o bucket público `imagens` do Supabase Storage.
- Exige rodar `supabase/schema.sql` de novo (cria a tabela `cards` e o bucket). Sem Supabase, os cards
  editados ficam só em memória e o envio de fotos fica desativado (dá para usar links).

## Deploy na Vercel

1. Envie **todos** os arquivos do projeto para o GitHub (mantendo as pastas `public`, `src` e `supabase`). Não envie `.env` nem `node_modules`.
2. Em vercel.com, importe o repositório. Não precisa alterar nenhuma configuração de build.
3. Em **Settings → Environment Variables**, cadastre `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
4. Faça o deploy (ou **Redeploy**: as variáveis só valem em deploys novos).
5. No Supabase, rode `supabase/schema.sql` se ainda não rodou.

## Observações

- O limite de tentativas de login é por instância do servidor; na Vercel funciona como um freio parcial. Para proteção forte contra força bruta, use um serviço de limite de requisições.
- As sessões duram 8 horas.
- Os conteúdos culturais devem ser revisados e validados pela própria comunidade antes de qualquer publicação oficial.


## Áudio e vídeo nos cards

O editor de cards permite enviar um vídeo e um áudio por conteúdo. Os arquivos são enviados diretamente ao Supabase Storage pelo navegador usando uma URL temporária assinada, gerada pelo servidor após validar a sessão de administrador. A chave `SUPABASE_SERVICE_ROLE_KEY` permanece somente no servidor.

Antes de publicar esta versão em um projeto Supabase já existente, execute `supabase/migration_midias.sql` no SQL Editor. A migração adiciona `video_url` e `audio_url` à tabela `cards` e cria/atualiza o bucket público `midias`.

Formatos aceitos: vídeo MP4 ou WebM; áudio MP3, M4A, AAC, OGG, WAV ou WebM. Limite configurado: 100 MB por arquivo. Os cards só exibem as abas de vídeo e áudio quando há um endereço de mídia cadastrado.
