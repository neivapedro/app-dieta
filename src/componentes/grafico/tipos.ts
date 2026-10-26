// Tipos públicos do motor de gráficos (SVG puro)

export type CorSerie = 'texto' | 'neutro' | 'aviso' | 'bom' | 'ruim' | 'destaque';

export interface PontoSerie {
  /** AAAA-MM-DD */
  data: string;
  valor: number | null;
  atipico?: boolean;
}

export interface Serie {
  id: string;
  nome: string;
  tipo: 'linha' | 'area' | 'barra' | 'degrau';
  pontos: PontoSerie[];
  cor?: CorSerie;
  eixo?: 'esq' | 'dir';
  casas?: number;
  unidade?: string;
  tracejado?: boolean;
}

export interface Faixa {
  id: string;
  nome: string;
  pontos: { data: string; min: number; max: number }[];
  cor?: CorSerie;
  eixo?: 'esq' | 'dir';
}

export interface Marco {
  data: string;
  rotulo: string;
  tipo?: 'dose' | 'decisao' | 'nota' | 'atipico' | 'medicao';
}

export interface Referencia {
  valor: number;
  rotulo: string;
  eixo?: 'esq' | 'dir';
  cor?: CorSerie;
  tracejado?: boolean;
}

export interface Periodo {
  de: string;
  ate: string;
}

export interface PropsGraficoTempo {
  series: Serie[];
  faixas?: Faixa[];
  marcos?: Marco[];
  referencias?: Referencia[];
  /** Janela visível (zoom controlado). Sem ela: todo o período dos dados. */
  periodo?: Periodo | null;
  aoMudarPeriodo?: (p: Periodo | null) => void;
  /** Faixa sombreada de destaque cruzado (do seletor de período ou de outro gráfico) */
  destaque?: Periodo | null;
  aoTocarData?: (data: string) => void;
  aoTocarMarco?: (m: Marco) => void;
  /** Grupo: gráficos com o mesmo id dividem a data da mira */
  sincronia?: string;
  /** padrão 220 */
  altura?: number;
  formatoEsq?: (v: number) => string;
  formatoDir?: (v: number) => string;
  /** pinça (dois dedos) e faixa de zoom embaixo; toque duplo volta ao todo */
  permitirZoom?: boolean;
  /** botão "Expandir" → tela cheia com o mesmo gráfico */
  expandivel?: boolean;
  /** nome acessível; também o título da tela cheia */
  titulo: string;
  /** padrão: true com mais de uma série */
  legenda?: boolean;
}

export interface PontoDispersao {
  x: number;
  y: number;
  rotulo?: string;
  data?: string;
  destaque?: boolean;
}

export interface EixoDispersao {
  nome: string;
  unidade?: string;
  casas?: number;
}

export interface PropsGraficoDispersao {
  pontos: PontoDispersao[];
  eixoX: EixoDispersao;
  eixoY: EixoDispersao;
  /** reta de mínimos quadrados e r no canto */
  tendencia?: boolean;
  aoTocarPonto?: (i: number) => void;
  altura?: number;
  titulo: string;
}

export interface BarraSemana {
  chave: string;
  rotulo: string;
  valores: { serie: string; valor: number | null }[];
}

export interface PropsGraficoBarrasSemana {
  barras: BarraSemana[];
  series: { id: string; nome: string; cor?: CorSerie }[];
  selecionada?: string | null;
  aoSelecionar?: (chave: string | null) => void;
  max?: number;
  altura?: number;
  formato?: (v: number) => string;
  titulo: string;
}
