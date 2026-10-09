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
}

export interface Medida {
  id: string;
  data: string;
  altura_cm: number;
  pescoco_cm: number;
  cintura_cm: number;
  quadril_cm: number | null;
  peso_kg: number;
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
