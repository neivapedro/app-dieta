-- Aba "Dieta": rodar uma vez no SQL Editor do Supabase.
-- Parte 1 cria a estrutura (igual à migração 20261011000000_dieta.sql).
-- Parte 2 (opcional) já deixa o plano da planilha "Dieta - Pedro Neiva" montado
-- numa conta: troque o e-mail. Se a conta já tiver plano, nada é sobrescrito.

-- Parte 1 ---------------------------------------------------------------
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

-- Parte 2 ---------------------------------------------------------------
insert into public.dieta_planos (user_id, config, refeicoes)
select id,
  '{"fator_atividade": 1.2, "atividades": [{"nome": "Musculação", "kcal": 350, "vezes_semana": 7}, {"nome": "Bike", "kcal": 300, "vezes_semana": 5}, {"nome": "Corrida", "kcal": 440, "vezes_semana": 2}], "ajuste_kcal": -300, "ptn_gkg": 2, "gord_gkg": 1}'::jsonb,
  '[{"id": "r1", "nome": "Refeição 1", "horario": "06:00", "itens": [{"alimento_id": "x15", "quantidade": 1, "unidade": "fatia"}, {"alimento_id": "t488", "quantidade": 2, "unidade": "unidade"}, {"alimento_id": "x48", "quantidade": 1, "unidade": "xícara"}, {"alimento_id": "x01", "quantidade": 1, "unidade": "dose"}]}, {"id": "r2", "nome": "Refeição 2", "horario": "12:00", "itens": [{"alimento_id": "t3", "quantidade": 200, "unidade": "g"}, {"alimento_id": "t561", "quantidade": 100, "unidade": "g"}, {"alimento_id": "t377", "quantidade": 200, "unidade": "g"}]}, {"id": "r3", "nome": "Refeição 3", "horario": "15:30", "itens": [{"alimento_id": "t214", "quantidade": 2, "unidade": "unidade"}, {"alimento_id": "t182", "quantidade": 1, "unidade": "unidade"}, {"alimento_id": "x15", "quantidade": 2, "unidade": "fatia"}, {"alimento_id": "t463", "quantidade": 1, "unidade": "fatia"}, {"alimento_id": "t424", "quantidade": 1, "unidade": "fatia"}]}, {"id": "r4", "nome": "Refeição 4", "horario": "19:00", "itens": [{"alimento_id": "t3", "quantidade": 100, "unidade": "g"}, {"alimento_id": "t488", "quantidade": 2, "unidade": "unidade"}]}, {"id": "r5", "nome": "Refeição 5", "horario": null, "itens": [{"alimento_id": "x38", "quantidade": 1, "unidade": "colher de sopa"}, {"alimento_id": "x44", "quantidade": 150, "unidade": "g"}]}, {"id": "r6", "nome": "Refeição 6", "horario": null, "itens": []}, {"id": "r7", "nome": "Pós-treino", "horario": null, "itens": []}]'::jsonb
from auth.users
where email = 'COLE-SEU-EMAIL-AQUI'
on conflict (user_id) do nothing;
