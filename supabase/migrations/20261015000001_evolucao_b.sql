-- Evolução (frente B): medidas e composição corporal.
-- Idempotente: pode rodar mais de uma vez. O app funciona sem este SQL, mas
-- estes campos só são gravados depois dele.

-- 1) Ajuste de calibração do % de gordura, por perfil (p.p. somados à US Navy).
--    null = padrão (+2 no masculino, como na planilha; 0 no feminino).
--    Calibração por exame (DXA, bioimpedância de qualidade): data e % do exame.
alter table public.perfis add column if not exists ajuste_gordura numeric(4, 1) check (ajuste_gordura between -15 and 15);
alter table public.perfis add column if not exists exame_gordura_data date;
alter table public.perfis add column if not exists exame_gordura_bf numeric(4, 1) check (exame_gordura_bf between 2 and 75);

-- 2) Medição atípica (doente, inchado, viagem): fica no histórico, fora de
--    tendências e projeções.
alter table public.medidas add column if not exists atipica boolean not null default false;

-- 3) Diário: sono, água e cor da urina (opcionais).
--    sono_h = horas de sono total (do relógio, não o tempo na cama).
alter table public.diario add column if not exists sono_h numeric(3, 1) check (sono_h is null or sono_h between 0 and 24);
alter table public.diario add column if not exists agua_l numeric(3, 1) check (agua_l is null or agua_l between 0 and 15);
alter table public.diario add column if not exists cor_urina text check (cor_urina is null or cor_urina in ('clara', 'amarela', 'escura'));

-- 4) Treino: tipo do cardio feito no dia (corrida em qualquer dia) e esforço
--    percebido da sessão (escala CR-10), separado para musculação e cardio.
--    Sem cardio_tipo, o app infere: distância preenchida = corrida, senão a regra
--    do dia (quarta e domingo = corrida).
--    A aba Treino é opcional: num banco sem treino_dias este bloco é pulado (rode
--    este arquivo de novo depois do SQL do Treino para criar estes campos).
do $$
begin
  if to_regclass('public.treino_dias') is not null then
    execute $q$alter table public.treino_dias add column if not exists cardio_tipo text check (cardio_tipo is null or cardio_tipo in ('corrida', 'bike'))$q$;
    execute $q$alter table public.treino_dias add column if not exists esforco_treino smallint check (esforco_treino is null or esforco_treino between 0 and 10)$q$;
    execute $q$alter table public.treino_dias add column if not exists esforco_cardio smallint check (esforco_cardio is null or esforco_cardio between 0 and 10)$q$;
  end if;
end $$;

-- 5) Força nos exercícios-âncora: 1x por semana, a primeira série válida
--    (carga, repetições e repetições na reserva). A lista de exercícios fica no perfil.
alter table public.perfis add column if not exists exercicios_forca jsonb;

create table if not exists public.treino_forca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  exercicio text not null check (length(exercicio) between 1 and 60),
  carga_kg numeric(5, 1) not null check (carga_kg > 0 and carga_kg <= 600),
  reps smallint not null check (reps between 1 and 50),
  rir smallint check (rir is null or rir between 0 and 10)
);
create index if not exists treino_forca_user_data on public.treino_forca (user_id, data);

alter table public.treino_forca enable row level security;
drop policy if exists "dono" on public.treino_forca;
create policy "dono" on public.treino_forca for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
