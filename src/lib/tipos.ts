export type Sexo = 'Masculino' | 'Feminino';

export interface Perfil {
  nome: string;
  sexo: Sexo;
  altura_cm: number | null;
  lembretes_ativos: boolean;
  /** Horário local do lembrete, formato HH:MM */
  hora_lembrete: string;
  fuso_horario: string;
  /** Endereço secreto do calendário assinado (só na nuvem) */
  token_calendario?: string | null;
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
