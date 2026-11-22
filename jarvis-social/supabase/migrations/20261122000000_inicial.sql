-- Jarvis Social: estado persistente (PostgreSQL / Supabase).
-- Instantes em timestamptz (UTC); o fuso IANA de origem fica ao lado.
-- O acesso é SÓ pela API (chave de serviço no servidor). RLS ligada e sem
-- políticas para anon/authenticated: ninguém lê tabela direto do navegador.

create extension if not exists pgcrypto;

create table organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fuso text not null default 'America/Sao_Paulo',
  fila_pausada boolean not null default false,
  politica jsonb not null default '{"horarios":["10:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}',
  politica_atraso text not null default 'aguardar' check (politica_atraso in ('aguardar','publicar','reagendar')),
  tolerancia_atraso_min int not null default 60,
  exige_aprovacao boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now()
);

create table membros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  usuario_id uuid not null,
  papel text not null check (papel in ('dono','admin','editor','aprovador','leitor')),
  criado_em timestamptz not null default now(),
  unique (org_id, usuario_id)
);
create index on membros (usuario_id);

create table conexoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  rede text not null default 'instagram',
  ig_user_id text not null,
  usuario_rede text,
  tipo_conta text,
  estado text not null check (estado in ('ativa','reconectar','revogada')),
  token_cifrado text,            -- AES-GCM com JS_CHAVE_CIFRA; nunca em claro
  token_expira_em timestamptz,
  permissoes jsonb,
  simulado boolean not null default false,
  conectado_por uuid,
  atualizado_em timestamptz not null default now(),
  unique (org_id, ig_user_id)
);

create table estados_oauth (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  usuario_id uuid not null,
  expira_em timestamptz not null,
  usado boolean not null default false
);

create table midias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('video','capa')),
  nome text, mime text not null, tamanho bigint not null, sha256 text,
  caminho text not null unique,
  estado text not null check (estado in ('aguardando_upload','pronta')),
  miniatura text, duracao_seg numeric, largura int, altura int,
  criado_por uuid, criado_em timestamptz not null default now(), finalizado_em timestamptz
);
create index on midias (org_id, criado_em desc);
create index on midias (org_id, sha256);

create table posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  conta_id uuid references conexoes(id),
  video_id uuid references midias(id),
  capa_id uuid references midias(id),
  legenda text not null default '',
  agendado_utc timestamptz,
  fuso text not null default 'America/Sao_Paulo',
  origem_horario text check (origem_horario in ('manual','frequencia')),
  estado text not null check (estado in ('draft','awaiting_approval','scheduled','paused','preparing','processing','publishing','published','retry_wait','failed','cancelled','needs_reconciliation')),
  versao int not null default 1,
  chave_idempotencia text not null,
  hash_pedido text not null,
  container_id text, container_criado_em timestamptz, publicacao_pedida_em timestamptz,
  media_id text, permalink text, publicado_em timestamptz,
  tentativas int not null default 0, proxima_tentativa_em timestamptz, ultimo_erro text,
  fonte jsonb, simulado boolean not null default false,
  criado_por uuid, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (org_id, chave_idempotencia)
);
create index on posts (org_id, agendado_utc);
create index on posts (org_id, estado);

create table eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  de text, para text, versao int, motivo text, ator text,
  criado_em timestamptz not null default now()
);
create index on eventos (post_id, criado_em);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  versao_post int not null,
  estado text not null check (estado in ('pendente','executando','concluido','obsoleto')),
  executar_em timestamptz not null,
  lease_ate timestamptz, dono text, tentativas int not null default 0,
  criado_em timestamptz not null default now(), concluido_em timestamptz
);
create index jobs_fila on jobs (executar_em) where estado in ('pendente','executando');

create table batimentos (
  id uuid primary key default gen_random_uuid(),
  dono text, inicio timestamptz, fim timestamptz, jobs int, resultado jsonb
);

-- Reivindicação atômica: dois workers nunca pegam o mesmo job (SKIP LOCKED);
-- lease vencido (worker morreu) devolve o job à fila; fila pausada não sai.
create or replace function reivindicar_jobs(p_agora timestamptz, p_dono text, p_lease_seg int, p_limite int)
returns setof jobs language sql as $$
  update jobs j set estado = 'executando', dono = p_dono, tentativas = j.tentativas + 1,
         lease_ate = p_agora + make_interval(secs => p_lease_seg)
  where j.id in (
    select id from jobs x
    where ((x.estado = 'pendente' and x.executar_em <= p_agora)
        or (x.estado = 'executando' and x.lease_ate < p_agora))
      and not exists (select 1 from organizacoes o where o.id = x.org_id and o.fila_pausada)
    order by x.executar_em
    limit p_limite
    for update skip locked
  )
  returning j.*;
$$;

alter table organizacoes enable row level security;
alter table membros enable row level security;
alter table conexoes enable row level security;
alter table estados_oauth enable row level security;
alter table midias enable row level security;
alter table posts enable row level security;
alter table eventos enable row level security;
alter table jobs enable row level security;
alter table batimentos enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke execute on function reivindicar_jobs(timestamptz, text, int, int) from public, anon, authenticated;
  end if;
  -- Bucket privado das mídias (só existe no Supabase).
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('midias', 'midias', false, 52428800, array['video/mp4','video/quicktime','image/jpeg','image/png'])
    on conflict (id) do nothing;
  end if;
end $$;
