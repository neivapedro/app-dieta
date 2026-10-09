-- Aba "Dieta": gasto calórico, metas de macros e plano alimentar.
-- Um plano por conta; o banco de alimentos fica no próprio app (não precisa de tabela).

alter table public.perfis add column if not exists data_nascimento date;

create table if not exists public.dieta_planos (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  -- { fator_atividade, atividades: [{ nome, kcal, vezes_semana }], ajuste_kcal, ptn_gkg, gord_gkg }
  config jsonb not null,
  -- [{ id, nome, horario, itens: [{ alimento_id, quantidade, unidade }] }]
  refeicoes jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.dieta_planos enable row level security;
drop policy if exists "dono" on public.dieta_planos;
create policy "dono" on public.dieta_planos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
