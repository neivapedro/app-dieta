-- Evolução (frente A): dose e frasco
-- Todas as alterações são idempotentes (pode rodar de novo sem erro). O app
-- continua funcionando sem elas: só os campos novos deixam de ser gravados.

-- Seringa configurável: capacidade (30, 50 ou 100 UI) e intervalo entre as
-- marcas impressas (1 ou 0,5 UI). O passo de leitura (passo_ui) é 1/4 da marca:
-- com marcas de 0,5 UI vira 0,125, por isso a coluna ganha mais casas.
alter table public.ciclos alter column passo_ui type numeric(6,4);
alter table public.ciclos add column if not exists seringa_capacidade_ui numeric(5,1) check (seringa_capacidade_ui in (30, 50, 100));
alter table public.ciclos add column if not exists seringa_marca_ui numeric(4,2) check (seringa_marca_ui in (0.5, 1));

-- Data em que o frasco foi aberto/reconstituído (opcional, só informativa)
alter table public.ciclos add column if not exists frasco_aberto_em date;

-- Decisões do fim de cada fase: [{ id, data, apos_aplicacao, dose_mg, fase_indice,
-- escolha: subir | repetir | confirmar_fase | anotacao, dose_nova_mg, semanas, bloco_inicio, texto }]
-- O app nunca sobe a dose sozinho: só segue o que foi decidido aqui.
alter table public.ciclos add column if not exists decisoes jsonb default '[]'::jsonb;

-- Concentração do frasco gravada em cada aplicação no momento do registro
-- (aplicações antigas ficam vazias e usam a do ciclo)
alter table public.aplicacoes add column if not exists concentracao_mg_ml numeric(8,3) check (concentracao_mg_ml > 0);

-- Registro de decisões: cada mudança relevante (déficit, fator, g/kg, fases,
-- metas, dose) vira uma linha { data, tipo, campo, de, para, motivo }. O app
-- grava sozinho ao salvar; no mesmo dia, o mesmo campo fica numa linha só.
-- Sem esta tabela o app continua funcionando (só não guarda o registro).
create table if not exists public.registro_decisoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('dieta', 'plano', 'metas', 'dose', 'nota')),
  campo text not null,
  de text,
  para text,
  motivo text,
  -- Decisão de fim de fase (ciclos.decisoes[].id) que gerou a linha
  ref text,
  criado_em timestamptz not null default now()
);
create index if not exists registro_decisoes_user_data on public.registro_decisoes (user_id, data);

alter table public.registro_decisoes enable row level security;
drop policy if exists "dono" on public.registro_decisoes;
create policy "dono" on public.registro_decisoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
