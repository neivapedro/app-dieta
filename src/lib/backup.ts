import type { PlanoDieta } from './dieta';
import { chaveExercicio } from './forca';
import { fotoBackupValida, separarFotosImportar, type FotoBackup, type Pose, type Sessao } from './fotos';
import type { Aplicacao, Ciclo, Medida, Perfil, RegistroDecisao, RegistroDiario, RegistroForca, TreinoDia } from './tipos';

/**
 * Arquivo de backup. Versão 2 inclui treinos, metas e força; a 3, o registro de
 * decisões. As versões 1 e 2 continuam aceitas. As fotos de antes e depois
 * (opcionais, em base64) só existem no aparelho: o backup é a cópia delas.
 */
export interface Backup {
  versao: 1 | 2 | 3;
  exportado_em: string;
  perfil: Perfil | null;
  ciclo: Ciclo | null;
  aplicacoes: Aplicacao[];
  diario: RegistroDiario[];
  medidas: Medida[];
  dieta?: PlanoDieta | null;
  treinos?: TreinoDia[];
  registro_decisoes?: RegistroDecisao[];
  forca?: RegistroForca[];
  fotos?: FotoBackup[];
}

export interface DadosAtuais {
  aplicacoes: Aplicacao[];
  medidas: Medida[];
  diario: RegistroDiario[];
  treinos: TreinoDia[];
  registro_decisoes?: RegistroDecisao[];
  forca?: RegistroForca[];
  /** Fotos já guardadas neste aparelho (sessão + pose) */
  fotos?: { sessao: Sessao; pose: Pose; data?: string }[];
}

export function montarBackup(d: Omit<Backup, 'versao' | 'exportado_em'>, agora: string): Backup {
  return { versao: 3, exportado_em: agora, ...d };
}

export function lerBackup(texto: string): Backup {
  let b: Backup;
  try {
    b = JSON.parse(texto) as Backup;
  } catch {
    throw new Error('Arquivo de backup não reconhecido.');
  }
  const listaOk = (v: unknown) => v === undefined || Array.isArray(v);
  if (
    (b?.versao !== 1 && b?.versao !== 2 && b?.versao !== 3) ||
    !Array.isArray(b.aplicacoes) ||
    typeof b.exportado_em !== 'string' ||
    !listaOk(b.medidas) ||
    !listaOk(b.diario) ||
    !listaOk((b as { treinos?: unknown }).treinos) ||
    !listaOk((b as { registro_decisoes?: unknown }).registro_decisoes) ||
    !listaOk((b as { forca?: unknown }).forca) ||
    !listaOk((b as { fotos?: unknown }).fotos)
  )
    throw new Error('Arquivo de backup não reconhecido.');
  return b;
}

export interface PlanoImportacao {
  /** Só as datas que ainda não existem: importar duas vezes não duplica */
  aplicacoes: Aplicacao[];
  medidas: Medida[];
  /** Diário e treino têm uma linha por data: substituem o dia */
  diario: RegistroDiario[];
  treinos: TreinoDia[];
  /** Registro de decisões: só as linhas (id) que ainda não existem */
  registro_decisoes: RegistroDecisao[];
  /** Força: só os pares data + exercício que ainda não existem */
  forca: RegistroForca[];
  /** Fotos: só as dos lugares (sessão + pose) ainda vazios neste aparelho */
  fotos: FotoBackup[];
  /** fotos_conflito: fotos do arquivo que inverteriam a ordem Antes/Depois com as do aparelho */
  ignoradas: { aplicacoes: number; medidas: number; fotos: number; fotos_conflito: number };
}

/** Mesma data, campo e valores: é a mesma linha (importar duas vezes não duplica). */
const assinatura = (r: RegistroDecisao) => [r.data, r.tipo, r.campo, r.de, r.para].join('|');

function registrosNovos(doBackup: RegistroDecisao[], atuais: RegistroDecisao[]): RegistroDecisao[] {
  const vistas = new Set(atuais.map(assinatura));
  return doBackup.filter((r) => (vistas.has(assinatura(r)) ? false : (vistas.add(assinatura(r)), true)));
}

export function planejarImportacao(b: Backup, atuais: DadosAtuais): PlanoImportacao {
  const datasAplic = new Set(atuais.aplicacoes.map((a) => a.data));
  const datasMed = new Set(atuais.medidas.map((m) => m.data));
  const unicas = <T extends { data: string }>(lista: T[], existentes: Set<string>) => {
    const vistas = new Set(existentes);
    return lista.filter((x) => (vistas.has(x.data) ? false : (vistas.add(x.data), true)));
  };
  const aplicacoes = unicas(b.aplicacoes, datasAplic);
  const medidas = unicas(b.medidas ?? [], datasMed);
  const chaveForca = (f: RegistroForca) => `${f.data}|${chaveExercicio(f.exercicio)}`;
  const vistasForca = new Set((atuais.forca ?? []).map(chaveForca));
  const forca = (b.forca ?? []).filter((f) => (vistasForca.has(chaveForca(f)) ? false : (vistasForca.add(chaveForca(f)), true)));
  const { fotos, conflito: fotosConflito } = separarFotosImportar(b.fotos, atuais.fotos ?? []);
  return {
    aplicacoes,
    medidas,
    diario: b.diario ?? [],
    treinos: b.treinos ?? [],
    registro_decisoes: registrosNovos(b.registro_decisoes ?? [], atuais.registro_decisoes ?? []),
    forca,
    fotos,
    ignoradas: {
      aplicacoes: b.aplicacoes.length - aplicacoes.length,
      medidas: (b.medidas ?? []).length - medidas.length,
      // Só as fotos válidas que já têm lugar ocupado (as estragadas são ignoradas em silêncio)
      fotos: (b.fotos ?? []).filter(fotoBackupValida).length - fotos.length - fotosConflito,
      fotos_conflito: fotosConflito,
    },
  };
}
