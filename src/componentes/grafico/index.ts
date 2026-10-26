// Motor de gráficos em SVG puro (sem biblioteca): tempo, dispersão e barras por categoria.
import '../../estilos/grafico.css';

export { GraficoTempo, SimboloMarco } from './GraficoTempo';
export { GraficoDispersao } from './GraficoDispersao';
export { GraficoBarrasSemana } from './GraficoBarrasSemana';
export { ProvedorSincronia, useSincronia } from './sincronia';
export { corCss } from './comum';
export type {
  BarraSemana,
  CorSerie,
  EixoDispersao,
  Faixa,
  Marco,
  Periodo,
  PontoDispersao,
  PontoSerie,
  PropsGraficoBarrasSemana,
  PropsGraficoDispersao,
  PropsGraficoTempo,
  Referencia,
  Serie,
} from './tipos';
