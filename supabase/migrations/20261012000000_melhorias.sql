-- Melhorias pós-revisão:
-- 1) Lembretes conferidos a cada 15 minutos (antes era 1x por hora, no minuto 5).
--    A função já registra o envio do dia, então não há aviso duplicado.
-- 2) Diário: sintomas do remédio (sim/não) e "segui o plano da dieta?".

select cron.schedule(
  'enviar-lembretes-retatrutida',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_dieta_projeto_url') || '/functions/v1/enviar-lembretes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app_dieta_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

alter table public.diario add column if not exists vomito boolean;
alter table public.diario add column if not exists diarreia boolean;
alter table public.diario add column if not exists intestino_preso boolean;
alter table public.diario add column if not exists dieta_seguida text check (dieta_seguida in ('sim', 'parcial', 'nao'));
