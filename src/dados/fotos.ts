import { chaveSlot, deBase64, paraBase64, type FotoBackup, type FotoInfo, type Pose, type Sessao } from '../lib/fotos';

// Fotos de antes e depois: guardadas SÓ NESTE APARELHO, no IndexedDB, separadas
// por usuário. Nunca vão para a nuvem nem passam pela fila. Sair da conta não
// apaga as fotos (são do aparelho), mas cada conta só vê as suas.

export interface FotoGuardada extends FotoInfo {
  /** usuario|sessao|pose: uma foto por pose em cada sessão */
  chave: string;
  usuario: string;
  /** JPEG já comprimido (ArrayBuffer: o Safari antigo falhava com Blob no IndexedDB) */
  dados: ArrayBuffer;
  tipo: string;
  largura: number;
  altura: number;
  salva_em: string;
}

const BANCO = 'app-dieta-fotos';
const LOJA = 'fotos';

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  conexao = new Promise<IDBDatabase>((ok, falha) => {
    if (typeof indexedDB === 'undefined') return falha(new Error('Este navegador não permite guardar fotos no aparelho.'));
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'chave' }).createIndex('usuario', 'usuario');
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
  const lista = await operacao<FotoGuardada[]>('readonly', (l) => l.index('usuario').getAll(usuario));
  return lista ?? [];
}

export async function salvarFoto(
  usuario: string,
  f: { sessao: Sessao; pose: Pose; data: string; blob: Blob; largura: number; altura: number },
): Promise<void> {
  const dados = await f.blob.arrayBuffer();
  const registro: FotoGuardada = {
    chave: `${usuario}|${chaveSlot(f)}`,
    usuario,
    sessao: f.sessao,
    pose: f.pose,
    data: f.data,
    dados,
    tipo: f.blob.type || 'image/jpeg',
    largura: f.largura,
    altura: f.altura,
    salva_em: new Date().toISOString(),
  };
  await operacao('readwrite', (l) => l.put(registro));
  avisar();
  void pedirPersistencia();
}

/** Muda só a data de uma foto já guardada. */
export async function mudarDataFoto(usuario: string, sessao: Sessao, pose: Pose, data: string): Promise<void> {
  const chave = `${usuario}|${chaveSlot({ sessao, pose })}`;
  const atual = await operacao<FotoGuardada | undefined>('readonly', (l) => l.get(chave));
  if (!atual) return;
  await operacao('readwrite', (l) => l.put({ ...atual, data }));
  avisar();
}

export async function apagarFoto(usuario: string, sessao: Sessao, pose: Pose): Promise<void> {
  await operacao('readwrite', (l) => l.delete(`${usuario}|${chaveSlot({ sessao, pose })}`));
  avisar();
}

/** Fotos da conta em base64, para o arquivo de backup. */
export async function exportarFotos(usuario: string): Promise<FotoBackup[]> {
  return (await listarFotos(usuario)).map(fotoParaBackup);
}

/** Uma foto já lida do aparelho → item do arquivo de backup (síncrono: o Compartilhar do iPhone pede o toque recente). */
export function fotoParaBackup(f: FotoGuardada): FotoBackup {
  return {
    sessao: f.sessao,
    pose: f.pose,
    data: f.data,
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
  // Confere de novo: uma foto tirada depois de abrir o backup não é trocada
  const ocupados = new Set((await listarFotos(usuario)).map(chaveSlot));
  const registros: FotoGuardada[] = fotos.filter((f) => !ocupados.has(chaveSlot(f))).map((f) => {
    const bytes = deBase64(f.base64);
    return {
      chave: `${usuario}|${chaveSlot(f)}`,
      usuario,
      sessao: f.sessao,
      pose: f.pose,
      data: f.data,
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
