-- Agenda a função "enviar-lembretes" para rodar a cada hora (minuto 5).
-- A função decide, para cada usuário, se já chegou o horário do lembrete no
-- fuso dele e se a dose do dia (ou atrasada) ainda não foi registrada.
--
-- Antes de aplicar, guarde no Vault a URL do projeto e o mesmo CRON_SECRET
-- configurado nos segredos da Edge Function:
--   select vault.create_secret('https://<seu-projeto>.supabase.co', 'projeto_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'enviar-lembretes-retatrutida',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'projeto_url') || '/functions/v1/enviar-lembretes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
