import { diferencaDias, formatarData } from './datas';
import { cm, kg, pp, sinal } from './formato';
import type { Composicao } from './gordura';
import { LADO_GRADE_PDF, LADO_PDF } from './imagem';

// Fotos de antes e depois: lógica pura (sem IndexedDB nem canvas), para testar.
// As fotos ficam só no aparelho (src/dados/fotos.ts); nada disso vai para a nuvem.

export type Sessao = 'antes' | 'depois';
export type Pose = 'frente' | 'lado' | 'costas';
/** Rótulo da foto: uma das poses ou "Outra" (sem rótulo) */
export type Rotulo = Pose | 'outra';

export const SESSOES: Sessao[] = ['antes', 'depois'];
export const POSES: Pose[] = ['frente', 'lado', 'costas'];
export const ROTULOS: Rotulo[] = [...POSES, 'outra'];
export const ROTULO_SESSAO: Record<Sessao, string> = { antes: 'Antes', depois: 'Depois' };
export const ROTULO_POSE: Record<Pose, string> = { frente: 'Frente', lado: 'Lado', costas: 'Costas' };
export const ROTULO_FOTO: Record<Rotulo, string> = { ...ROTULO_POSE, outra: 'Outra' };

/** Até quantos dias de distância a medição ainda vale para a foto */
export const DIAS_MEDICAO_FOTO = 7;

/**
 * Dados de uma foto sem a imagem (o que a tela e o PDF precisam saber). Cada
 * sessão (Antes e Depois) tem quantas fotos a pessoa quiser.
 */
export interface FotoInfo {
  /** Único na conta (as fotos antigas, de antes da galeria, ganham um id estável: idLegado) */
  id: string;
  sessao: Sessao;
  /** Frente, Lado, Costas ou Outra (sem rótulo); Frente, Lado e Costas formam os pares do PDF */
  rotulo: Rotulo;
  /** Data da foto (AAAA-MM-DD) */
  data: string;
  /** Ordem de adição (desempata as fotos do mesmo dia) */
  ordem: number;
}

/** Foto no arquivo de backup: a imagem em base64 (JPEG já comprimido). */
export interface FotoBackup extends FotoInfo {
  /** Só para versões antigas do app lerem o arquivo (uma foto por pose) */
  pose?: Pose;
  tipo: string;
  largura: number;
  altura: number;
  salva_em: string;
  base64: string;
}

/**
 * Id das fotos do formato antigo (uma por sessão + pose, sem id): estável, para
 * a foto migrada no aparelho e a mesma foto num backup antigo serem uma só.
 */
export const idLegado = (sessao: Sessao, pose: Pose, data: string) => `antiga-${sessao}-${pose}-${data}`;

const ehSessao = (v: unknown): v is Sessao => SESSOES.includes(v as Sessao);
const ehPose = (v: unknown): v is Pose => POSES.includes(v as Pose);
const ehRotulo = (v: unknown): v is Rotulo => ROTULOS.includes(v as Rotulo);
const ID_OK = /^[A-Za-z0-9_.:-]{1,100}$/;
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Foto no formato novo a partir do que estiver guardado: as do formato antigo
 * (sessão + pose fixa, sem id) viram o rótulo da pose, com id estável e a
 * ordem frente, lado, costas. As do formato novo passam como estão.
 */
export function converterFotoAntiga<T extends { sessao: Sessao; data: string; pose?: Pose; id?: string; rotulo?: Rotulo; ordem?: number }>(
  f: T,
): Omit<T, 'pose'> & FotoInfo {
  const { pose, ...resto } = f;
  const rotulo: Rotulo = ehRotulo(f.rotulo) ? f.rotulo : ehPose(pose) ? pose : 'outra';
  const id = typeof f.id === 'string' && ID_OK.test(f.id) ? f.id : idLegado(f.sessao, ehPose(pose) ? pose : 'frente', f.data);
  const ordem = typeof f.ordem === 'number' && Number.isFinite(f.ordem) ? f.ordem : ehPose(pose) ? POSES.indexOf(pose) : 0;
  return { ...resto, id, rotulo, ordem } as Omit<T, 'pose'> & FotoInfo;
}

/** Ordem das fotos na galeria e no PDF: pela data e, no mesmo dia, pela ordem de adição. */
export function ordenarFotos<T extends { data: string; ordem: number; id: string }>(fotos: T[]): T[] {
  return [...fotos].sort((a, b) => (a.data !== b.data ? (a.data < b.data ? -1 : 1) : a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/** Fotos de uma sessão, já em ordem. */
export function fotosDaSessao<T extends FotoInfo>(fotos: T[], sessao: Sessao): T[] {
  return ordenarFotos(fotos.filter((f) => f.sessao === sessao));
}

/** Próxima ordem de adição (depois de todas as fotos). */
export function proximaOrdem(fotos: { ordem: number }[]): number {
  return fotos.reduce((m, f) => Math.max(m, Number.isFinite(f.ordem) ? f.ordem : 0), -1) + 1;
}

/**
 * Data de referência da sessão para os números: a da foto MAIS RECENTE da
 * sessão (no Antes e no Depois). null sem fotos.
 */
export function dataDaSessao(fotos: { sessao: Sessao; data: string }[], sessao: Sessao): string | null {
  return periodoDaSessao(fotos, sessao)?.ultima ?? null;
}

/** Primeira e última data das fotos da sessão (null sem fotos). */
export function periodoDaSessao(fotos: { sessao: Sessao; data: string }[], sessao: Sessao): { primeira: string; ultima: string } | null {
  const datas = fotos.filter((f) => f.sessao === sessao).map((f) => f.data).sort();
  return datas.length ? { primeira: datas[0], ultima: datas[datas.length - 1] } : null;
}

const br = (d: string) => d.split('-').reverse().join('/');

/**
 * Depois antes do Antes (ou Antes depois do Depois) inverteria a variação: devolve
 * o motivo do erro. Todas as fotos do Antes vêm até a data da primeira foto do
 * Depois: um Depois não pode ser anterior à foto mais recente do Antes, e um
 * Antes não pode ser posterior à foto mais antiga do Depois.
 */
export function conflitoDataSessao(fotos: { sessao: Sessao; data: string }[], sessao: Sessao, data: string): string | null {
  if (sessao === 'depois') {
    const antes = periodoDaSessao(fotos, 'antes')?.ultima;
    if (antes && data < antes)
      return `A data do Depois não pode ser anterior à foto mais recente do Antes (${br(antes)}): as fotos do Antes vêm sempre antes das do Depois.`;
  } else {
    const depois = periodoDaSessao(fotos, 'depois')?.primeira;
    if (depois && data > depois)
      return `A data do Antes não pode ser posterior à foto mais antiga do Depois (${br(depois)}): as fotos do Antes vêm sempre antes das do Depois.`;
  }
  return null;
}

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

/** Um lado (Antes ou Depois) de um par do PDF. */
export interface LadoFotoPdf {
  data: string;
  /** Linhas de texto: "Peso 95,0 kg", ... */
  linhas: string[];
}

/** Par de uma pose no PDF: a PRIMEIRA foto do Antes × a MAIS RECENTE do Depois. */
export interface ParFotos<T> {
  rotulo: Pose;
  antes: T;
  depois: T;
}

/**
 * Separa as fotos para o PDF: um par por pose (Frente, Lado, Costas) que tenha
 * foto nas duas sessões, com a primeira (mais antiga) do Antes e a mais recente
 * do Depois. As demais vão para "Outras fotos" de cada sessão, em ordem.
 */
export function separarParesFotos<T extends FotoInfo>(fotos: T[]): { pares: ParFotos<T>[]; outrasAntes: T[]; outrasDepois: T[] } {
  const antes = fotosDaSessao(fotos, 'antes');
  const depois = fotosDaSessao(fotos, 'depois');
  const usadas = new Set<string>();
  const pares: ParFotos<T>[] = [];
  for (const pose of POSES) {
    const a = antes.find((f) => f.rotulo === pose);
    const d = depois.filter((f) => f.rotulo === pose).at(-1);
    if (!a || !d) continue;
    usadas.add(a.id).add(d.id);
    pares.push({ rotulo: pose, antes: a, depois: d });
  }
  return { pares, outrasAntes: antes.filter((f) => !usadas.has(f.id)), outrasDepois: depois.filter((f) => !usadas.has(f.id)) };
}

export interface ParFotoPdf {
  rotulo: Pose;
  titulo: string;
  idAntes: string;
  idDepois: string;
  antes: LadoFotoPdf;
  depois: LadoFotoPdf;
  /** Variação Depois − Antes pelas medições de cada foto */
  variacao: string[];
}

/** Foto da grade "Outras fotos": a legenda vai embaixo (data e, se tiver, a pose). */
export interface ItemGradePdf {
  id: string;
  legenda: string;
}

export interface FotosPdf {
  pares: ParFotoPdf[];
  outrasAntes: ItemGradePdf[];
  outrasDepois: ItemGradePdf[];
}

function ladoPdf(f: FotoInfo, composicoes: Composicao[], feminino: boolean): { lado: LadoFotoPdf; c: Composicao | null } {
  const c = medicaoProxima(composicoes, f.data);
  const linhas = c
    ? [
        ...(c.data !== f.data ? [`Medição de ${formatarData(c.data, true)}`] : []),
        ...numerosDaMedicao(c, feminino).map((n) => `${n.rotulo}: ${n.valor}`),
      ]
    : [`Sem medição até ${DIAS_MEDICAO_FOTO} dias da foto.`];
  return { lado: { data: formatarData(f.data, true), linhas }, c };
}

const legendaGrade = (f: FotoInfo) => (f.rotulo === 'outra' ? formatarData(f.data, true) : `${formatarData(f.data, true)} · ${ROTULO_FOTO[f.rotulo]}`);

/**
 * Conteúdo das páginas "Antes e depois" do PDF: primeiro os pares por pose
 * (data e números da medição de cada lado, e a variação), depois as outras
 * fotos do Antes e do Depois em grade.
 */
export function montarFotosPdf(fotos: FotoInfo[], composicoes: Composicao[], feminino: boolean): FotosPdf {
  const { pares, outrasAntes, outrasDepois } = separarParesFotos(fotos);
  return {
    pares: pares.map((p) => {
      const a = ladoPdf(p.antes, composicoes, feminino);
      const d = ladoPdf(p.depois, composicoes, feminino);
      const variacao =
        a.c && d.c && a.c.data !== d.c.data ? numerosDaMedicao(d.c, feminino, a.c).map((n) => `${n.rotulo}: ${n.variacao}`) : [];
      return { rotulo: p.rotulo, titulo: ROTULO_POSE[p.rotulo], idAntes: p.antes.id, idDepois: p.depois.id, antes: a.lado, depois: d.lado, variacao };
    }),
    outrasAntes: outrasAntes.map((f) => ({ id: f.id, legenda: legendaGrade(f) })),
    outrasDepois: outrasDepois.map((f) => ({ id: f.id, legenda: legendaGrade(f) })),
  };
}

/** Ids das fotos que entram nos pares do PDF (as outras vão menores, na grade). */
export function idsDosPares(fotos: FotoInfo[]): Set<string> {
  const ids = new Set<string>();
  for (const p of separarParesFotos(fotos).pares) ids.add(p.antes.id).add(p.depois.id);
  return ids;
}

/**
 * Tamanho aproximado do PDF com as fotos: cada foto guardada (~1280 px) é
 * reduzida para o lado do PDF; o JPEG encolhe mais ou menos com a área (e
 * um pouco mais pela qualidade menor e pela redução, que suaviza a imagem). Mais
 * ~30 KB do resto do relatório.
 */
export function estimarTamanhoPdf(fotos: (FotoInfo & { bytes: number; largura: number; altura: number })[]): number {
  const pares = idsDosPares(fotos);
  let total = 30 * 1024;
  for (const f of fotos) {
    const lado = pares.has(f.id) ? LADO_PDF : LADO_GRADE_PDF;
    const maior = Math.max(f.largura, f.altura);
    const escala = maior > 0 ? Math.min(1, lado / maior) : 1;
    total += f.bytes * escala * escala * 0.7;
  }
  return Math.round(total);
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

/**
 * Foto do arquivo de backup com o formato esperado (o resto é ignorado em
 * silêncio). Aceita o formato novo (id + rótulo) e o antigo (sessão + pose).
 */
export function fotoBackupValida(f: unknown): f is FotoBackup {
  const x = f as Partial<FotoBackup> | null;
  return (
    !!x &&
    typeof x === 'object' &&
    ehSessao(x.sessao) &&
    (ehRotulo(x.rotulo) || ehPose(x.pose)) &&
    (x.id === undefined || (typeof x.id === 'string' && ID_OK.test(x.id))) &&
    typeof x.data === 'string' &&
    DATA_OK.test(x.data) &&
    typeof x.base64 === 'string' &&
    x.base64.length > 0 &&
    /^[A-Za-z0-9+/=]+$/.test(x.base64.slice(0, 200))
  );
}

/** Foto válida do backup no formato novo (as antigas ganham id estável e o rótulo da pose). */
export function normalizarFotoBackup(f: FotoBackup): FotoBackup {
  const n = converterFotoAntiga(f);
  return {
    id: n.id,
    sessao: n.sessao,
    rotulo: n.rotulo,
    data: n.data,
    ordem: n.ordem,
    tipo: typeof f.tipo === 'string' && f.tipo ? f.tipo : 'image/jpeg',
    largura: Number(f.largura) || 0,
    altura: Number(f.altura) || 0,
    salva_em: typeof f.salva_em === 'string' && f.salva_em ? f.salva_em : new Date().toISOString(),
    base64: f.base64,
  };
}

/** Fotos já guardadas no aparelho (o que a importação precisa saber delas). */
export type FotoExistente = { id: string; sessao: Sessao; data?: string; ordem?: number };

/**
 * Fotos do backup que entram no aparelho: só as que ainda não existem (pelo
 * id; as antigas, sem id, pelo id estável de sessão + pose + data). Importar
 * de novo não troca nem duplica nenhuma foto.
 */
export function fotosParaImportar(doBackup: unknown[] | undefined, existentes: FotoExistente[]): FotoBackup[] {
  return separarFotosImportar(doBackup, existentes).fotos;
}

/**
 * Como fotosParaImportar, separando também as que inverteriam a ordem das datas
 * com as fotos do aparelho (e as já aceitas): um Depois anterior ao Antes deste
 * aparelho fica de fora e é contado em `conflito`, para a prévia explicar. A
 * ordem de adição das que entram vem depois de todas as do aparelho.
 */
export function separarFotosImportar(doBackup: unknown[] | undefined, existentes: FotoExistente[]): { fotos: FotoBackup[]; conflito: number } {
  const vistos = new Set(existentes.map((f) => f.id));
  const comData: { sessao: Sessao; data: string }[] = existentes.filter((f): f is FotoExistente & { data: string } => typeof f.data === 'string');
  const aceitas: FotoBackup[] = [];
  let conflito = 0;
  for (const f of (doBackup ?? []).filter(fotoBackupValida).map(normalizarFotoBackup)) {
    if (vistos.has(f.id)) continue;
    vistos.add(f.id);
    if (conflitoDataSessao(comData, f.sessao, f.data)) {
      conflito++;
      continue;
    }
    comData.push(f);
    aceitas.push(f);
  }
  // Ordem de adição: depois das do aparelho, mantendo a ordem que tinham no arquivo
  const base = proximaOrdem(existentes.map((e) => ({ ordem: e.ordem ?? -1 })));
  const fotos = [...aceitas].sort((a, b) => a.ordem - b.ordem).map((f, i) => ({ ...f, ordem: base + i }));
  return { fotos, conflito };
}
