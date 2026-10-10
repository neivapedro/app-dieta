import type { PlanoDieta } from './dieta';
import { chaveExercicio } from './forca';
import type { Aplicacao, Ciclo, Medida, Perfil, RegistroDiario, RegistroForca, TreinoDia } from './tipos';

/** Arquivo de backup. Versão 2 inclui treinos, metas e força; a versão 1 continua aceita. */
export interface Backup {
  versao: 1 | 2;
  exportado_em: string;
  perfil: Perfil | null;
  ciclo: Ciclo | null;
  aplicacoes: Aplicacao[];
  diario: RegistroDiario[];
  medidas: Medida[];
  dieta?: PlanoDieta | null;
  treinos?: TreinoDia[];
  forca?: RegistroForca[];
}

export interface DadosAtuais {
  aplicacoes: Aplicacao[];
  medidas: Medida[];
  diario: RegistroDiario[];
  treinos: TreinoDia[];
  forca?: RegistroForca[];
}

export function montarBackup(d: Omit<Backup, 'versao' | 'exportado_em'>, agora: string): Backup {
  return { versao: 2, exportado_em: agora, ...d };
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
    (b?.versao !== 1 && b?.versao !== 2) ||
    !Array.isArray(b.aplicacoes) ||
    typeof b.exportado_em !== 'string' ||
    !listaOk(b.medidas) ||
    !listaOk(b.diario) ||
    !listaOk((b as { treinos?: unknown }).treinos) ||
    !listaOk((b as { forca?: unknown }).forca)
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
  /** Força: só os pares data + exercício que ainda não existem */
  forca: RegistroForca[];
  ignoradas: { aplicacoes: number; medidas: number };
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
  return {
    aplicacoes,
    medidas,
    diario: b.diario ?? [],
    treinos: b.treinos ?? [],
    forca,
    ignoradas: { aplicacoes: b.aplicacoes.length - aplicacoes.length, medidas: (b.medidas ?? []).length - medidas.length },
  };
}
