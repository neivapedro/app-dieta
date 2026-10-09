-- Calendário assinado (webcal): cada perfil ganha um endereço secreto próprio.
-- Quem tem o endereço vê só as doses daquela conta; "Gerar novo endereço" no
-- app troca o token e o endereço antigo deixa de funcionar.
alter table public.perfis
  add column if not exists token_calendario text unique
  default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

update public.perfis
  set token_calendario = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  where token_calendario is null;
