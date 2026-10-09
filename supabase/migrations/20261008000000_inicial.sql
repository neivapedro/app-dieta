-- App Dieta · Ciclo de retatrutida + medidas
-- Cada tabela tem user_id e Row Level Security: um usuário só lê e grava as
-- próprias linhas. Outra conta, em outro celular, nunca enxerga estes dados.

create extension if not exists pgcrypto;

create table public.perfis (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  nome text not null default '',
  sexo text not null default 'Masculino' check (sexo in ('Masculino', 'Feminino')),
  altura_cm numeric(5,1),
  lembretes_ativos boolean not null default true,
  hora_lembrete time not null default '08:00',
  fuso_horario text not null default 'America/Sao_Paulo',
  atualizado_em timestamptz not null default now()
);

create table public.ciclos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null,
  data_inicio date not null,
  quantidade_total_mg numeric(8,3) not null check (quantidade_total_mg > 0),
  concentracao_mg_ml numeric(8,3) not null check (concentracao_mg_ml > 0),
  intervalo_dias int not null default 7 check (intervalo_dias > 0),
  passo_ui numeric(4,2) not null default 0.25,
  -- [{ nome, semanas, dose_mg, objetivo }]
  fases jsonb not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.ciclos (user_id, ativo);

create table public.aplicacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ciclo_id uuid not null references public.ciclos on delete cascade,
  data date not null,
  dose_mg numeric(8,3) not null check (dose_mg > 0),
  local text,
  observacoes text,
  criado_em timestamptz not null default now()
);
create index on public.aplicacoes (user_id, ciclo_id, data);

create table public.diario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  peso_kg numeric(5,1),
  nausea smallint check (nausea between 0 and 3),
  observacoes text,
  unique (user_id, data)
);

create table public.medidas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  altura_cm numeric(5,1) not null,
  pescoco_cm numeric(5,1) not null,
  cintura_cm numeric(5,1) not null,
  quadril_cm numeric(5,1),
  peso_kg numeric(5,1) not null
);
create index on public.medidas (user_id, data);

create table public.inscricoes_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

-- Controle interno da função de lembretes (evita notificar duas vezes no mesmo dia)
create table public.lembretes_enviados (
  ciclo_id uuid not null references public.ciclos on delete cascade,
  dia date not null,
  enviado_em timestamptz not null default now(),
  primary key (ciclo_id, dia)
);

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['perfis', 'ciclos', 'aplicacoes', 'diario', 'medidas', 'inscricoes_push'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Só a função de lembretes (service role) acessa este controle
alter table public.lembretes_enviados enable row level security;

-- Uma aplicação só pode apontar para um ciclo do próprio usuário
create or replace function public.validar_ciclo_aplicacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ciclos where id = new.ciclo_id and user_id = new.user_id) then
    raise exception 'Ciclo inválido';
  end if;
  return new;
end $$;

create trigger aplicacoes_ciclo_do_dono
  before insert or update on public.aplicacoes
  for each row execute function public.validar_ciclo_aplicacao();
