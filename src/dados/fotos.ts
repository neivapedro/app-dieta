import { converterFotoAntiga, deBase64, ordenarFotos, paraBase64, proximaOrdem, type FotoBackup, type FotoInfo, type Pose, type Rotulo, type Sessao } from '../lib/fotos';

// Fotos de antes e depois: guardadas SÓ NESTE APARELHO, no IndexedDB, separadas
// por usuário. Nunca vão para a nuvem nem passam pela fila. Sair da conta não
// apaga as fotos (são do aparelho), mas cada conta só vê as suas. Cada sessão
// (Antes e Depois) tem quantas fotos a pessoa quiser.
//
// Versão 1 do banco: uma foto por sessão + pose (chave usuario|sessao|pose).
// Versão 2: uma linha por foto (chave usuario|id), com rótulo e ordem. A
// atualização converte as antigas (rótulo = a pose, id estável) sem perder nada;
// a leitura também converte, por garantia.

export interface FotoGuardada extends FotoInfo {
  /** usuario|id */
  chave: string;
  usuario: string;
  /** JPEG já comprimido (ArrayBuffer: o Safari antigo falhava com Blob no IndexedDB) */
  dados: ArrayBuffer;
  /** Miniatura (~320 px) para a galeria: muitas fotos grandes abertas pesam no iPhone. Não vai no backup. */
  miniatura?: ArrayBuffer;
  tipo: string;
  largura: number;
  altura: number;
  salva_em: string;
}

const BANCO = 'app-dieta-fotos';
const LOJA = 'fotos';

let conexao: Promise<IDBDatabase> | null = null;

/** Registro como pode estar no banco (versão 1: sem id, rótulo e ordem; com a pose). */
type RegistroBruto = Omit<FotoGuardada, 'id' | 'rotulo' | 'ordem'> & { id?: string; rotulo?: Rotulo; ordem?: number; pose?: Pose };

/** Registro do banco no formato novo (os da versão 1 viram o rótulo da pose, com id estável). */
export function converterRegistro(r: RegistroBruto): FotoGuardada {
  const n = converterFotoAntiga(r);
  return { ...n, chave: `${r.usuario}|${n.id}` };
}

function abrir(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  conexao = new Promise<IDBDatabase>((ok, falha) => {
    if (typeof indexedDB === 'undefined') return falha(new Error('Este navegador não permite guardar fotos no aparelho.'));
    const req = indexedDB.open(BANCO, 2);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        db.createObjectStore(LOJA, { keyPath: 'chave' }).createIndex('usuario', 'usuario');
        return;
      }
      // Da versão 1: cada foto (sessão + pose) vira uma linha com id, rótulo e ordem
      if (ev.oldVersion < 2) {
        const loja = req.transaction!.objectStore(LOJA);
        loja.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const antigo = cursor.value as RegistroBruto;
          const novo = converterRegistro(antigo);
          if (novo.chave !== antigo.chave || antigo.pose !== undefined) {
            // A chave muda: apaga a linha antiga e grava a nova na mesma transação
            cursor.delete();
            loja.put(novo);
          }
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Outra aba atualizou o banco: fecha esta conexão e abre de novo na próxima vez
      db.onversionchange = () => {
        db.close();
        conexao = null;
      };
      ok(db);
    };
    req.onerror = () => falha(new Error('Não deu para abrir as fotos guardadas neste aparelho (navegação privada?).'));
    req.onblocked = () => falha(new Error('Feche as outras abas do app e tente de novo.'));
  });
  conexao.catch(() => (conexao = null));
  return conexao;
}

function operacao<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, falha) => {
        const tx = db.transaction(LOJA, modo);
        const req = fn(tx.objectStore(LOJA));
        let resultado: T;
        if (req) req.onsuccess = () => (resultado = req.result);
        tx.oncomplete = () => ok(resultado);
        tx.onerror = () => falha(traduzir(tx.error));
        tx.onabort = () => falha(traduzir(tx.error));
      }),
  );
}

function traduzir(e: DOMException | null): Error {
  if (e?.name === 'QuotaExceededError') return new Error('Sem espaço no aparelho para guardar a foto.');
  return new Error(`Não deu para guardar no aparelho: ${e?.message ?? 'erro desconhecido'}`);
}

// ---------- Avisos de mudança (a tela das Medidas, o Balanço e a Análise se atualizam) ----------

const ouvintes = new Set<() => void>();
export function aoMudarFotos(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}
function avisar() {
  for (const cb of ouvintes) cb();
}

let pediuPersistencia = false;
/** Pede ao navegador para não apagar as fotos quando faltar espaço (sem quebrar onde não existe). */
async function pedirPersistencia() {
  if (pediuPersistencia) return;
  pediuPersistencia = true;
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return;
    await navigator.storage?.persist?.();
  } catch {
    /* sem suporte: segue normal */
  }
}

// ---------- Funções ----------

export async function listarFotos(usuario: string): Promise<FotoGuardada[]> {
  const lista = await operacao<RegistroBruto[]>('readonly', (l) => l.index('usuario').getAll(usuario));
  return ordenarFotos((lista ?? []).map(converterRegistro));
}

/** Id novo de foto (randomUUID não existe fora de https nos navegadores antigos). */
export function novoIdFoto(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

let ultimaOrdem = 0;

/** Guarda uma foto nova na sessão (vai para o fim da ordem de adição). */
export async function salvarFoto(
  usuario: string,
  f: { sessao: Sessao; rotulo: Rotulo; data: string; blob: Blob; largura: number; altura: number; miniatura?: Blob | null },
): Promise<FotoGuardada> {
  const dados = await f.blob.arrayBuffer();
  const miniatura = f.miniatura ? await f.miniatura.arrayBuffer() : undefined;
  // Ordem de adição pelo relógio (sempre crescente): não precisa ler as outras fotos
  const ordem = (ultimaOrdem = Math.max(Date.now(), ultimaOrdem + 1));
  const id = novoIdFoto();
  const registro: FotoGuardada = {
    chave: `${usuario}|${id}`,
    usuario,
    id,
    sessao: f.sessao,
    rotulo: f.rotulo,
    data: f.data,
    ordem,
    dados,
    ...(miniatura ? { miniatura } : {}),
    tipo: f.blob.type || 'image/jpeg',
    largura: f.largura,
    altura: f.altura,
    salva_em: new Date().toISOString(),
  };
  await operacao('readwrite', (l) => l.put(registro));
  avisar();
  void pedirPersistencia();
  return registro;
}

/** Muda a data e/ou o rótulo de uma foto já guardada. */
export async function atualizarFoto(usuario: string, id: string, mudanca: { data?: string; rotulo?: Rotulo }): Promise<void> {
  await mudarRegistro(usuario, id, mudanca);
  avisar();
}

/** Lê e regrava a foto na mesma transação (uma foto apagada no meio não volta). */
function mudarRegistro(usuario: string, id: string, mudanca: Partial<FotoGuardada>): Promise<void> {
  return operacao<void>('readwrite', (l) => {
    const req = l.get(`${usuario}|${id}`);
    req.onsuccess = () => {
      const atual = req.result as RegistroBruto | undefined;
      if (atual) l.put({ ...converterRegistro(atual), ...mudanca });
    };
  });
}

/** Guarda a miniatura de uma foto que não tinha (migrada ou importada), sem avisar as telas. */
export async function guardarMiniatura(usuario: string, id: string, miniatura: Blob): Promise<void> {
  await mudarRegistro(usuario, id, { miniatura: await miniatura.arrayBuffer() });
}

/** Bytes que a foto ocupa no aparelho (imagem + miniatura). */
export const bytesDaFoto = (f: FotoGuardada) => f.dados.byteLength + (f.miniatura?.byteLength ?? 0);

export async function apagarFoto(usuario: string, id: string): Promise<void> {
  await operacao('readwrite', (l) => l.delete(`${usuario}|${id}`));
  avisar();
}

/** Fotos da conta em base64, para o arquivo de backup. */
export async function exportarFotos(usuario: string): Promise<FotoBackup[]> {
  return (await listarFotos(usuario)).map(fotoParaBackup);
}

/** Uma foto já lida do aparelho → item do arquivo de backup (síncrono: o Compartilhar do iPhone pede o toque recente). */
export function fotoParaBackup(f: FotoGuardada): FotoBackup {
  return {
    id: f.id,
    sessao: f.sessao,
    rotulo: f.rotulo,
    // Versões antigas do app leem a pose (uma foto por pose)
    ...(f.rotulo !== 'outra' ? { pose: f.rotulo } : {}),
    data: f.data,
    ordem: f.ordem,
    tipo: f.tipo,
    largura: f.largura,
    altura: f.altura,
    salva_em: f.salva_em,
    base64: paraBase64(new Uint8Array(f.dados)),
  };
}

/** Restaura fotos do backup neste aparelho (a lista já vem sem as que existem: fotosParaImportar). */
export async function importarFotos(usuario: string, fotos: FotoBackup[]): Promise<number> {
  if (!fotos.length) return 0;
  // Confere de novo pelo id: uma foto que entrou depois de abrir o backup não é duplicada
  const atuais = await listarFotos(usuario);
  const ids = new Set(atuais.map((f) => f.id));
  let ordem = proximaOrdem(atuais);
  const registros: FotoGuardada[] = fotos
    .filter((f) => !ids.has(f.id))
    .map((f) => {
      const bytes = deBase64(f.base64);
      return {
        chave: `${usuario}|${f.id}`,
        usuario,
        id: f.id,
        sessao: f.sessao,
        rotulo: f.rotulo,
        data: f.data,
        ordem: ordem++,
        dados: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        tipo: f.tipo || 'image/jpeg',
        largura: f.largura || 0,
        altura: f.altura || 0,
        salva_em: f.salva_em || new Date().toISOString(),
      };
    });
  if (!registros.length) return 0;
  await operacao('readwrite', (l) => {
    for (const r of registros) l.put(r);
  });
  avisar();
  void pedirPersistencia();
  return registros.length;
}

export function blobDaFoto(f: FotoGuardada): Blob {
  return new Blob([f.dados], { type: f.tipo });
}

/** Miniatura da galeria (sem ela, a própria foto). */
export function blobDaMiniatura(f: FotoGuardada): Blob {
  return f.miniatura ? new Blob([f.miniatura], { type: 'image/jpeg' }) : blobDaFoto(f);
}
