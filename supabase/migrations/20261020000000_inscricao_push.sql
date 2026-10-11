-- Inscrição de push por aparelho: quando outra conta entra no mesmo aparelho, o
-- endereço (endpoint) passa para ela. Sem isto, o upsert pelo endpoint esbarra
-- na política "dono" (a linha é da conta anterior) e a conta nova nunca recebe
-- os lembretes. Idempotente: pode rodar mais de uma vez.
create or replace function public.assumir_inscricao_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessão';
  end if;
  insert into inscricoes_push (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

revoke all on function public.assumir_inscricao_push(text, text, text) from public, anon;
grant execute on function public.assumir_inscricao_push(text, text, text) to authenticated;
