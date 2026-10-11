import { diferencaDias, formatarData } from './datas';
import { cm, kg, pp, sinal } from './formato';
import type { Composicao } from './gordura';

// Fotos de antes e depois: lógica pura (sem IndexedDB nem canvas), para testar.
// As fotos ficam só no aparelho (src/dados/fotos.ts); nada disso vai para a nuvem.

export type Sessao = 'antes' | 'depois';
export type Pose = 'frente' | 'lado' | 'costas';

export const SESSOES: Sessao[] = ['antes', 'depois'];
export const POSES: Pose[] = ['frente', 'lado', 'costas'];
export const ROTULO_SESSAO: Record<Sessao, string> = { antes: 'Antes', depois: 'Depois' };
export const ROTULO_POSE: Record<Pose, string> = { frente: 'Frente', lado: 'Lado', costas: 'Costas' };

/** Até quantos dias de distância a medição ainda vale para a foto */
export const DIAS_MEDICAO_FOTO = 7;

/** Dados de uma foto sem a imagem (o que a tela e o PDF precisam saber). */
export interface FotoInfo {
  sessao: Sessao;
  pose: Pose;
  /** Data da foto (AAAA-MM-DD) */
  data: string;
}

/** Foto no arquivo de backup: a imagem em base64 (JPEG já comprimido). */
export interface FotoBackup extends FotoInfo {
  tipo: string;
  largura: number;
  altura: number;
  salva_em: string;
  base64: string;
}

export const chaveSlot = (f: { sessao: Sessao; pose: Pose }) => `${f.sessao}|${f.pose}`;

/**
 * Medição mais próxima da data da foto, até 7 dias antes ou depois. Medição
 * atípica fica de fora (como nas tendências). Empate: a de antes da foto.
 */
export function medicaoProxima(composicoes: Composicao[], data: string, maxDias = DIAS_MEDICAO_FOTO): Composicao | null {
  let melhor: { c: Composicao; d: number } | null = null;
  for (const c of composicoes) {
    if (c.atipica) continue;
    const d = diferencaDias(data, c.data);
    const dist = Math.abs(d);
    if (dist > maxDias) continue;
    if (!melhor || dist < Math.abs(melhor.d) || (dist === Math.abs(melhor.d) && d < melhor.d)) melhor = { c, d };
  }
  return melhor?.c ?? null;
}

/** Data de referência da sessão: a da foto de frente; sem ela, a da primeira pose que tiver foto. */
export function dataDaSessao(fotos: FotoInfo[], sessao: Sessao): string | null {
  for (const pose of POSES) {
    const f = fotos.find((x) => x.sessao === sessao && x.pose === pose);
    if (f) return f.data;
  }
  return null;
}

/**
 * Depois antes do Antes (ou Antes depois do Depois) inverteria a variação: devolve
 * o motivo do erro. Confere com todas as fotos da outra sessão (a variação é
 * montada pose a pose): o Depois não pode ser anterior a nenhuma foto do Antes,
 * e o Antes não pode ser posterior a nenhuma foto do Depois.
 */
export function conflitoDataSessao(fotos: FotoInfo[], sessao: Sessao, data: string): string | null {
  const br = (d: string) => d.split('-').reverse().join('/');
  if (sessao === 'depois') {
    const antes = fotos.filter((f) => f.sessao === 'antes').map((f) => f.data).sort().at(-1);
    if (antes && data < antes) return `A data do Depois não pode ser anterior à do Antes (${br(antes)}).`;
  } else {
    const depois = fotos.filter((f) => f.sessao === 'depois').map((f) => f.data).sort()[0];
    if (depois && data > depois) return `A data do Antes não pode ser posterior à do Depois (${br(depois)}).`;
  }
  return null;
}

export interface NumeroFoto {
  rotulo: string;
  valor: string;
  /** Variação em relação ao Antes (só no Depois) */
  variacao?: string;
  /** Valor bruto da variação, para colorir (queda é boa em todos) */
  delta?: number | null;
  chave: 'peso_kg' | 'cintura_cm' | 'bf' | 'quadril_cm';
}

/**
 * Números de uma medição para mostrar ao lado da foto: peso, cintura, % de
 * gordura e, no feminino, quadril. Com `ref` (a medição do Antes), a variação.
 */
export function numerosDaMedicao(c: Composicao | null, feminino: boolean, ref?: Composicao | null): NumeroFoto[] {
  if (!c) return [];
  const itens: { rotulo: string; chave: NumeroFoto['chave']; fmt: (n: number | null) => string; suf: string }[] = [
    { rotulo: 'Peso', chave: 'peso_kg', fmt: kg, suf: ' kg' },
    { rotulo: 'Cintura', chave: 'cintura_cm', fmt: cm, suf: ' cm' },
    { rotulo: '% de gordura', chave: 'bf', fmt: pp, suf: ' p.p.' },
    ...(feminino ? [{ rotulo: 'Quadril', chave: 'quadril_cm' as const, fmt: cm, suf: ' cm' }] : []),
  ];
  return itens.map(({ rotulo, chave, fmt, suf }) => {
    const v = c[chave];
    const n: NumeroFoto = { rotulo, valor: fmt(v), chave };
    if (ref) {
      const a = ref[chave];
      const delta = a !== null && v !== null ? v - a : null;
      n.delta = delta;
      n.variacao = delta === null ? '–' : sinal(delta, 1, suf);
    }
    return n;
  });
}

/** Uma pose no PDF: Antes × Depois lado a lado. */
export interface LadoFotoPdf {
  data: string;
  /** Linhas de texto: "Peso 95,0 kg", ... */
  linhas: string[];
}
export interface SecaoFotoPdf {
  pose: Pose;
  titulo: string;
  antes: LadoFotoPdf | null;
  depois: LadoFotoPdf | null;
  /** Variação Depois − Antes pelas medições de cada foto */
  variacao: string[];
}

function ladoPdf(f: FotoInfo | undefined, composicoes: Composicao[], feminino: boolean): { lado: LadoFotoPdf | null; c: Composicao | null } {
  if (!f) return { lado: null, c: null };
  const c = medicaoProxima(composicoes, f.data);
  const linhas = c
    ? [
        ...(c.data !== f.data ? [`Medição de ${formatarData(c.data, true)}`] : []),
        ...numerosDaMedicao(c, feminino).map((n) => `${n.rotulo}: ${n.valor}`),
      ]
    : [`Sem medição até ${DIAS_MEDICAO_FOTO} dias da foto.`];
  return { lado: { data: formatarData(f.data, true), linhas }, c };
}

/**
 * Seções da página "Antes e depois" do PDF: uma por pose que tenha alguma foto,
 * cada uma com a data e os números da medição de cada lado e a variação.
 */
export function montarSecoesFotos(fotos: FotoInfo[], composicoes: Composicao[], feminino: boolean): SecaoFotoPdf[] {
  const secoes: SecaoFotoPdf[] = [];
  for (const pose of POSES) {
    const fa = fotos.find((f) => f.sessao === 'antes' && f.pose === pose);
    const fd = fotos.find((f) => f.sessao === 'depois' && f.pose === pose);
    if (!fa && !fd) continue;
    const a = ladoPdf(fa, composicoes, feminino);
    const d = ladoPdf(fd, composicoes, feminino);
    const variacao =
      a.c && d.c && a.c.data !== d.c.data ? numerosDaMedicao(d.c, feminino, a.c).map((n) => `${n.rotulo}: ${n.variacao}`) : [];
    secoes.push({ pose, titulo: ROTULO_POSE[pose], antes: a.lado, depois: d.lado, variacao });
  }
  return secoes;
}

// ---------- Backup ----------

/** Bytes → base64 (em blocos, sem estourar a pilha com fotos grandes). */
export function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  return btoa(bin);
}

export function deBase64(texto: string): Uint8Array {
  const bin = atob(texto);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Tamanho que as fotos ocupam no arquivo de backup (base64 ≈ 4/3 dos bytes). */
export function tamanhoBackupFotos(fotos: { base64: string }[]): number {
  return fotos.reduce((s, f) => s + f.base64.length, 0);
}

/** "1,8 MB" · "320 KB" */
export function textoTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

/** Foto do arquivo de backup com o formato esperado (o resto é ignorado em silêncio). */
export function fotoBackupValida(f: unknown): f is FotoBackup {
  const x = f as Partial<FotoBackup> | null;
  return (
    !!x &&
    typeof x === 'object' &&
    SESSOES.includes(x.sessao as Sessao) &&
    POSES.includes(x.pose as Pose) &&
    typeof x.data === 'string' &&
    DATA_OK.test(x.data) &&
    typeof x.base64 === 'string' &&
    x.base64.length > 0 &&
    /^[A-Za-z0-9+/=]+$/.test(x.base64.slice(0, 200))
  );
}

/**
 * Fotos do backup que entram no aparelho: só as dos lugares (sessão + pose)
 * ainda vazios. Importar de novo não troca nem duplica nenhuma foto.
 */
export function fotosParaImportar(doBackup: unknown[] | undefined, existentes: { sessao: Sessao; pose: Pose; data?: string }[]): FotoBackup[] {
  return separarFotosImportar(doBackup, existentes).fotos;
}

/**
 * Como fotosParaImportar, separando também as que inverteriam a ordem das datas
 * com as fotos do aparelho (e as já aceitas): um Depois anterior ao Antes deste
 * aparelho fica de fora e é contado em `conflito`, para a prévia explicar.
 */
export function separarFotosImportar(
  doBackup: unknown[] | undefined,
  existentes: { sessao: Sessao; pose: Pose; data?: string }[],
): { fotos: FotoBackup[]; conflito: number } {
  const ocupados = new Set(existentes.map(chaveSlot));
  const comData: FotoInfo[] = existentes.filter((f): f is FotoInfo => typeof f.data === 'string');
  const fotos: FotoBackup[] = [];
  let conflito = 0;
  for (const f of (doBackup ?? []).filter(fotoBackupValida)) {
    if (ocupados.has(chaveSlot(f))) continue;
    if (conflitoDataSessao(comData, f.sessao, f.data)) {
      conflito++;
      continue;
    }
    ocupados.add(chaveSlot(f));
    comData.push(f);
    fotos.push(f);
  }
  return { fotos, conflito };
}
