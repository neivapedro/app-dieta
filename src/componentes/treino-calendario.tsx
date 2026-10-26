// Calendário do treino em mapa de calor: quanto mais forte o verde, mais do dia foi feito
// (treino e cardio). Cada dia mostra T e C; a letra apagada é o que não foi feito.
import { diaDaSemana, formatarData } from '../lib/datas';
import { celulaDia } from '../lib/treino-painel';
import type { TreinoDia } from '../lib/tipos';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function CalendarioTreino({
  semanas,
  inicio,
  fim,
  hoje,
  doDia,
  aoAbrir,
  cabecalho = true,
}: {
  semanas: { segunda: string; dias: string[] }[];
  inicio: string;
  fim: string;
  hoje: string;
  doDia: (data: string) => TreinoDia | undefined;
  aoAbrir: (data: string) => void;
  /** Linha Seg…Dom no topo */
  cabecalho?: boolean;
}) {
  // A primeira célula visível e o dia 1 de cada mês levam o mês junto ("01/11")
  let primeira = true;
  return (
    <div className="cal-treino" role="grid" aria-label="Calendário do treino">
      {cabecalho &&
        DIAS.map((d) => (
          <div key={d} className="cal-cab" aria-hidden="true">
            {d}
          </div>
        ))}
      {semanas.flatMap((s) =>
        s.dias.map((d) => {
          if (d < inicio || d > fim) return <div key={d} className="cal-dia fora" aria-hidden="true" />;
          const c = celulaDia(d, hoje, doDia(d));
          const comMes = primeira || d.endsWith('-01');
          primeira = false;
          const rotulo = formatarData(d, true).slice(0, 5);
          const desc = c.estado === 'futuro' ? 'ainda vai chegar' : `treino ${c.treino ? 'feito' : 'não feito'}, cardio ${c.cardio ? 'feito' : 'não feito'}`;
          return (
            <button
              key={d}
              type="button"
              className={`cal-dia n${c.nivel} ${c.estado}`}
              onClick={() => d <= hoje && aoAbrir(d)}
              disabled={d > hoje}
              aria-label={`${diaDaSemana(d)}, ${rotulo}${d === hoje ? ' (hoje)' : ''}: ${desc}`}
            >
              <span className="cal-num">{comMes ? rotulo : rotulo.slice(0, 2)}</span>
              <span className="cal-pips" aria-hidden="true">
                <span className={`cal-pip ${c.treino ? 'sim' : ''}`}>T</span>
                <span className={`cal-pip ${c.cardio ? 'sim' : ''}`}>C</span>
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}

/** Legenda curta do mapa de calor. */
export function LegendaCalendario() {
  return (
    <div className="cal-legenda">
      <span>
        <i className="cal-amostra n2 passado" /> treino e cardio
      </span>
      <span>
        <i className="cal-amostra n1 passado" /> só um
      </span>
      <span>
        <i className="cal-amostra n0 passado" /> nenhum
      </span>
      <span>
        <i className="cal-amostra hoje" /> hoje
      </span>
    </div>
  );
}
