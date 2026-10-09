-- Aba "Treino": check diário de treino e cardio, corridas e metas do projeto.
-- O módulo só aparece para contas com perfis.modulo_treino = true.

alter table public.perfis add column if not exists modulo_treino boolean not null default false;
-- Metas do fim do projeto: { pescoco_cm, cintura_cm, quadril_cm, peso_kg, bf }
alter table public.perfis add column if not exists metas_projeto jsonb;

create table if not exists public.treino_dias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  treino boolean not null default false,
  cardio boolean not null default false,
  -- Corrida (quartas e domingos): distância e tempo opcionais, para o pace
  corrida_km numeric(5,2),
  corrida_seg integer check (corrida_seg is null or corrida_seg > 0),
  unique (user_id, data)
);

alter table public.treino_dias enable row level security;
drop policy if exists "dono" on public.treino_dias;
create policy "dono" on public.treino_dias for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
