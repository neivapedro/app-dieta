/** Falha de conexão (sem sinal, servidor fora do ar ou pausado), não um erro de dados. */
export function ehErroDeRede(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const nome = (e as { name?: string })?.name ?? '';
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return /Retryable/i.test(nome) || /failed to fetch|load failed|networkerror|network request failed|fetch failed|timed? ?out|aborted|ERR_INTERNET|ERR_NETWORK/i.test(msg);
}

/** Mensagem curta em português para mostrar na tela. */
export function traduzirErro(e: unknown): string {
  if (ehErroDeRede(e)) return 'Sem conexão com o servidor. O que você marcou fica guardado e é enviado quando a internet voltar.';
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return 'Sessão expirada. Entre novamente.';
  if (/duplicate key|already exists/i.test(msg)) return 'Esse registro já existe.';
  if (/row-level security/i.test(msg)) return 'Sem permissão para gravar esse dado. Entre novamente.';
  if (/Importing a module script failed|dynamically imported module|error loading/i.test(msg)) return 'Parte do app não carregou. Recarregue a página.';
  return msg;
}
