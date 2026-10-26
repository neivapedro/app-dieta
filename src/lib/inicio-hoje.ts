// Checklist do dia no Início: o que já foi anotado hoje e o que falta.
// Só descreve registros; não grava nada e nunca sugere dose.
import { resumoSintomas } from './bemestar';
import { num } from './formato';
import { NIVEIS_NAUSEA, type RegistroDiario, type TreinoDia } from './tipos';

export type ChaveTarefa = 'dose' | 'medicao' | 'treino' | 'cardio' | 'peso' | 'nausea' | 'agua' | 'sono' | 'plano';

export interface Tarefa {
  chave: ChaveTarefa;
  rotulo: string;
  /** Valor anotado ou o que falta (ex.: "1,5 de 3,0 L") */
  detalhe: string;
  feito: boolean;
}

export interface EntradaTarefas {
  reg?: RegistroDiario | null;
  /** Peso da medição de hoje (vale como o peso do dia) */
  pesoMedicao?: number | null;
  /** Dose: devida hoje ou atrasada; feita = aplicação registrada hoje */
  dose?: { devida: boolean; feitaHoje: boolean; texto: string } | null;
  /** Medição de segunda: só às segundas, para quem já mede */
  medicao?: { feita: boolean } | null;
  /** Conta com Treino e placar em andamento: treino e cardio entram no checklist */
  comTreino: boolean;
  treinoDia?: TreinoDia | null;
  comDieta: boolean;
  metaAgua: number;
}

const anotado = (v: unknown) => v !== null && v !== undefined;

/** Tarefas do dia, na ordem do cartão. Treino e cardio só para quem tem a aba Treino. */
export function tarefasDoDia(e: EntradaTarefas): Tarefa[] {
  const r = e.reg ?? null;
  const t: Tarefa[] = [];
  if (e.dose && (e.dose.devida || e.dose.feitaHoje))
    t.push({ chave: 'dose', rotulo: 'Aplicação', detalhe: e.dose.feitaHoje ? 'registrada hoje' : e.dose.texto, feito: e.dose.feitaHoje });
  if (e.medicao) t.push({ chave: 'medicao', rotulo: 'Medição de segunda', detalhe: e.medicao.feita ? 'feita' : 'em jejum', feito: e.medicao.feita });
  if (e.comTreino) {
    const tr = e.treinoDia;
    t.push({ chave: 'treino', rotulo: 'Treino', detalhe: tr?.treino ? 'feito' : 'musculação', feito: !!tr?.treino });
    t.push({ chave: 'cardio', rotulo: 'Cardio', detalhe: tr?.cardio ? 'feito' : 'bike ou corrida', feito: !!tr?.cardio });
  }
  const peso = e.pesoMedicao ?? r?.peso_kg ?? null;
  t.push({ chave: 'peso', rotulo: 'Peso', detalhe: peso !== null ? `${num(peso, 1)} kg` : '–', feito: peso !== null });
  const sint = resumoSintomas(r);
  t.push({
    chave: 'nausea',
    rotulo: 'Náusea e sintomas',
    detalhe: anotado(r?.nausea) ? `${NIVEIS_NAUSEA[r!.nausea!].toLowerCase()}${sint !== '–' ? ` · ${sint}` : ''}` : sint !== '–' ? sint : '–',
    feito: anotado(r?.nausea),
  });
  t.push({
    chave: 'agua',
    rotulo: 'Água',
    detalhe: `${anotado(r?.agua_l) ? num(r!.agua_l!, 1) : '–'} de ${num(e.metaAgua, 1)} L`,
    feito: anotado(r?.agua_l),
  });
  t.push({ chave: 'sono', rotulo: 'Sono', detalhe: anotado(r?.sono_h) ? `${num(r!.sono_h!, 1)} h` : '–', feito: anotado(r?.sono_h) });
  if (e.comDieta) {
    const v = r?.dieta_seguida;
    t.push({ chave: 'plano', rotulo: 'Segui o plano', detalhe: v === 'sim' ? 'sim' : v === 'parcial' ? 'em parte' : v === 'nao' ? 'não' : '–', feito: !!v });
  }
  return t;
}

/** "3 de 6" e a fração para o anel. */
export function progressoTarefas(t: Tarefa[]): { feitas: number; total: number; fracao: number } {
  const feitas = t.filter((x) => x.feito).length;
  return { feitas, total: t.length, fracao: t.length ? feitas / t.length : 0 };
}
