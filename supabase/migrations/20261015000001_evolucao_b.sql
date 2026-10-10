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
