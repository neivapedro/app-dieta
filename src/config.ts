// Projeto Supabase compartilhado com o Diário de Carga (mesmo login nos dois apps).
// Estes valores são públicos por natureza: a chave publicável e a chave VAPID
// pública podem ficar no código. Os dados são protegidos pelas regras (RLS) de
// cada tabela, que só deixam cada conta ver o que é dela.
// Variáveis VITE_* (arquivo .env.local) têm prioridade, para testes locais.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://dqxpiyjdwwrcwkcuuyys.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_C3h222kH6rRIV1K7p2TNIA_TWNTU3h3';
/** Chave pública de notificações (a privada fica só nos segredos do Supabase) */
export const VAPID_PUBLICA: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? 'BP0ONir-WP30mDUG7_gsYN_EAw0J-p_WSyBVZ4l51bBukAqn-_rGmlvoke_ruLmNX350OsXPn7l4cuEhpB1K2Qk';
export const SITE_URL = 'https://neivapedro.github.io/app-dieta/';
