-- Lembrete das refeições por push (Perfil → Notificações neste aparelho).
-- Independente do lembrete da dose (lembretes_ativos): cada um tem a própria chave.
-- Idempotente: pode rodar mais de uma vez. O app funciona sem ela (só não grava a opção).

-- Liga/desliga (padrão desligado) e quantos minutos antes do horário avisar
alter table public.perfis add column if not exists lembrete_refeicoes boolean not null default false;
alter table public.perfis add column if not exists lembrete_refeicoes_antes smallint not null default 0
  check (lembrete_refeicoes_antes in (0, 10, 15, 30));

-- Controle de envio: uma linha por refeição avisada em cada dia (no fuso do
-- perfil). A função reserva a linha ANTES de enviar, então duas execuções ao
-- mesmo tempo não mandam o mesmo aviso duas vezes. Linhas com mais de 7 dias
-- são apagadas pela própria função.
create table if not exists public.lembretes_refeicao_enviados (
  user_id uuid not null references auth.users on delete cascade,
  dia date not null,
  refeicao_id text not null,
  enviado_em timestamptz not null default now(),
  primary key (user_id, dia, refeicao_id)
);
create index if not exists lembretes_refeicao_enviados_dia on public.lembretes_refeicao_enviados (dia);

-- Só a função (service role, que ignora o RLS) grava; o dono pode apenas ler as suas
alter table public.lembretes_refeicao_enviados enable row level security;
drop policy if exists "dono" on public.lembretes_refeicao_enviados;
drop policy if exists "dono_le" on public.lembretes_refeicao_enviados;
create policy "dono_le" on public.lembretes_refeicao_enviados for select to authenticated
  using (user_id = (select auth.uid()));
