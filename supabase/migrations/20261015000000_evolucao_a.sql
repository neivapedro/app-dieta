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
