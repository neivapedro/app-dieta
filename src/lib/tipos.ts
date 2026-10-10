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
  /** Passo de leitura na seringa U-100 (UI): 1/4 do intervalo entre marcas */
  passo_ui: number;
  fases: Fase[];
  /** Capacidade da seringa (30, 50 ou 100 UI); vazio = não informada */
  seringa_capacidade_ui?: number | null;
  /** Intervalo entre as marcas impressas (1 ou 0,5 UI); vazio = 1 UI */
  seringa_marca_ui?: number | null;
  /** Dia em que o frasco foi aberto/reconstituído (opcional) */
  frasco_aberto_em?: string | null;
  /** Decisões tomadas no fim de cada fase (subir, repetir, anotações) */
  decisoes?: DecisaoFase[] | null;
}

/**
 * Decisão registrada pelo usuário no fim de um degrau de dose. O app nunca
 * sobe a dose sozinho: só segue o que foi decidido aqui.
 */
export interface DecisaoFase {
  id: string;
  /** Dia em que foi registrada */
  data: string;
  /** Nº de aplicações registradas no momento da decisão (vale para a seguinte) */
  apos_aplicacao: number;
  /** Dose aplicada no degrau que terminou */
  dose_mg: number;
  /** Fase do plano a que a decisão se refere (subir: a fase nova) */
  fase_indice: number | null;
  escolha: 'subir' | 'repetir' | 'confirmar_fase' | 'anotacao';
  dose_nova_mg?: number | null;
  /** Repetir: semanas acrescentadas à fase */
  semanas?: number | null;
  /** Confirmar fase (dose fora do plano): 1ª data do bloco de doses */
  bloco_inicio?: string | null;
  /** Anotação para o médico (vai para o PDF) */
  texto?: string | null;
}

export interface Aplicacao {
  id: string;
  ciclo_id: string;
  data: string;
  dose_mg: number;
  local: string | null;
  observacoes: string | null;
  /** Concentração do frasco no dia do registro; vazio (registros antigos) = a do ciclo */
  concentracao_mg_ml?: number | null;
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
