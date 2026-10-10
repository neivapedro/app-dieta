export type Sexo = 'Masculino' | 'Feminino';

export interface Perfil {
  nome: string;
  sexo: Sexo;
  altura_cm: number | null;
  /** YYYY-MM-DD; usada na idade das fórmulas de TMB */
  data_nascimento?: string | null;
  lembretes_ativos: boolean;
  /** Horário local do lembrete, formato HH:MM */
  hora_lembrete: string;
  fuso_horario: string;
  /** Endereço secreto do calendário assinado (só na nuvem) */
  token_calendario?: string | null;
  /** Aba Treino liberada para esta conta (definido no banco) */
  modulo_treino?: boolean;
  metas_projeto?: MetasProjeto | null;
  /** Ajuste de calibração do % de gordura em p.p. (null = padrão: +2 no masculino, 0 no feminino) */
  ajuste_gordura?: number | null;
  /** Exame usado para calibrar o ajuste (DXA, bioimpedância de qualidade): data e % de gordura */
  exame_gordura_data?: string | null;
  exame_gordura_bf?: number | null;
  /** Exercícios-âncora da força (aba Treino); null = padrão (supino, agachamento ou leg press, remada, desenvolvimento) */
  exercicios_forca?: string[] | null;
}

/** Metas para o fim do projeto (massa magra/gorda saem de peso + % gordura) */
export interface MetasProjeto {
  pescoco_cm: number | null;
  cintura_cm: number | null;
  quadril_cm: number | null;
  peso_kg: number | null;
  bf: number | null;
}

export interface TreinoDia {
  id: string;
  data: string;
  treino: boolean;
  cardio: boolean;
  corrida_km: number | null;
  corrida_seg: number | null;
  /** Cardio feito no dia; null/ausente = inferido (distância preenchida = corrida, senão a regra do dia) */
  cardio_tipo?: 'corrida' | 'bike' | null;
  /** Esforço percebido da sessão (escala CR-10, 0 a 10), separado para musculação e cardio */
  esforco_treino?: number | null;
  esforco_cardio?: number | null;
}

/** Força: a primeira série válida de um exercício-âncora, 1x por semana */
export interface RegistroForca {
  id: string;
  data: string;
  exercicio: string;
  carga_kg: number;
  reps: number;
  /** Repetições na reserva (0 = falha); opcional */
  rir: number | null;
}

export interface Fase {
  nome: string;
  /** Quantidade de aplicações (semanas) da fase */
  semanas: number;
  dose_mg: number;
  objetivo: string;
}

export interface Ciclo {
  id: string;
  nome: string;
  /** Data da 1ª aplicação (YYYY-MM-DD) */
  data_inicio: string;
  quantidade_total_mg: number;
  concentracao_mg_ml: number;
  intervalo_dias: number;
  /** Menor marcação usada na seringa U-100 (UI) */
  passo_ui: number;
  fases: Fase[];
}

export interface Aplicacao {
  id: string;
  ciclo_id: string;
  data: string;
  dose_mg: number;
  local: string | null;
  observacoes: string | null;
}

export interface RegistroDiario {
  id: string;
  data: string;
  peso_kg: number | null;
  /** 0 = nenhuma · 1 = leve · 2 = moderada · 3 = forte */
  nausea: number | null;
  observacoes: string | null;
  /** Sintomas do remédio (opcionais; null = não registrado) */
  vomito?: boolean | null;
  diarreia?: boolean | null;
  intestino_preso?: boolean | null;
  /** Segui o plano da dieta hoje? */
  dieta_seguida?: 'sim' | 'parcial' | 'nao' | null;
  /** Horas de sono total da noite anterior (do relógio, não o tempo na cama) */
  sono_h?: number | null;
  /** Água e outras bebidas do dia, em litros */
  agua_l?: number | null;
  cor_urina?: CorUrina | null;
}

export type CorUrina = 'clara' | 'amarela' | 'escura';

export interface Medida {
  id: string;
  data: string;
  altura_cm: number;
  pescoco_cm: number;
  cintura_cm: number;
  quadril_cm: number | null;
  peso_kg: number;
  /** Medição atípica (doente, inchado, viagem): fica no histórico, fora de tendências e projeções */
  atipica?: boolean;
}

export const LOCAIS_APLICACAO = [
  'Abdome direito',
  'Abdome esquerdo',
  'Coxa direita',
  'Coxa esquerda',
  'Braço direito',
  'Braço esquerdo',
] as const;

export const NIVEIS_NAUSEA = ['Nenhuma', 'Leve', 'Moderada', 'Forte'] as const;
