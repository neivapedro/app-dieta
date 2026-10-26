// Gráficos coloridos do Relatório final, no motor em SVG: arrastar lê a data (a mesma
// nos gráficos do corpo), pinça amplia, "Expandir" abre em tela cheia. Tocar num bloco de
// dose sombreia o período dele em todos os gráficos do corpo.
import { useMemo, useState } from 'react';
import { marcosAnalise } from '../lib/analise-detalhe';
import { formatarData } from '../lib/datas';
import { num, pct } from '../lib/formato';
import type { RelatorioFinal } from '../lib/relatorio-final';
import type { DecisaoFase, RegistroDecisao } from '../lib/tipos';
import { FaixaFases } from './analise-graficos';
import { GraficoBarrasSemana, GraficoTempo, ProvedorSincronia, type Periodo, type Serie } from './grafico';
import { MapaCalor } from './painel';
import { Vazio } from './ui';

const rotuloSemana = (s: string) => formatarData(s, true).slice(0, 5);

/** Peso × dose, cintura e % de gordura, massa magra × gorda: mira sincronizada e destaque por bloco de dose. */
export function GraficosCorpo({ r, decisoes, registros }: { r: RelatorioFinal; decisoes: DecisaoFase[]; registros: RegistroDecisao[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const s = r.series;
  const marcos = useMemo(
    () =>
      marcosAnalise({
        doses: s.dose.slice(0, -1).map((p) => ({ data: p.data, dose_mg: p.valor })),
        decisoes: decisoes.filter((d) => d.data <= r.periodo.fim),
        registros: registros.filter((x) => x.data <= r.periodo.fim),
        medicoes: s.cintura.map((p) => ({ data: p.data, atipica: p.atipico })),
      }),
    [s, decisoes, registros, r.periodo.fim],
  );
  const faixa = r.fases.map((f, i) => ({ chave: `f${i}`, rotulo: f.rotulo_curto, doses: f.doses, de: f.inicio, ate: f.fim }));
  const destaque: Periodo | null = (() => {
    const f = faixa.find((x) => x.chave === sel);
    return f ? { de: f.de, ate: f.ate } : null;
  })();
  const metaPeso = r.metas.itens.find((m) => m.chave === 'peso_kg')?.progresso.meta;
  const metaCintura = r.metas.itens.find((m) => m.chave === 'cintura_cm')?.progresso.meta;

  const seriesPeso = useMemo<Serie[]>(
    () => [
      { id: 'peso', nome: 'Peso', tipo: 'area', pontos: s.peso, cor: 'indigo', unidade: 'kg', casas: 1 },
      ...(s.dose.length ? [{ id: 'dose', nome: 'Dose', tipo: 'degrau' as const, pontos: s.dose, cor: 'laranja' as const, eixo: 'dir' as const, unidade: 'mg', casas: 2 }] : []),
    ],
    [s.peso, s.dose],
  );
  const seriesCintura = useMemo<Serie[]>(
    () => [
      { id: 'cintura', nome: 'Cintura', tipo: 'area', pontos: s.cintura, cor: 'azul', unidade: 'cm', casas: 1 },
      { id: 'bf', nome: '% de gordura (dir.)', tipo: 'linha', pontos: s.bf, cor: 'rosa', eixo: 'dir', unidade: '%', casas: 1 },
      ...(s.quadril.length ? [{ id: 'quadril', nome: 'Quadril', tipo: 'linha' as const, tracejado: true, pontos: s.quadril, cor: 'ciano' as const, unidade: 'cm', casas: 1 }] : []),
    ],
    [s.cintura, s.bf, s.quadril],
  );
  const seriesMassas = useMemo<Serie[]>(
    () => [
      { id: 'magra', nome: 'Massa magra', tipo: 'area', pontos: s.massa_magra, cor: 'verde', unidade: 'kg', casas: 1 },
      { id: 'gorda', nome: 'Massa gorda (dir.)', tipo: 'linha', pontos: s.massa_gorda, cor: 'laranja', eixo: 'dir', unidade: 'kg', casas: 1 },
    ],
    [s.massa_magra, s.massa_gorda],
  );
  const normais = (l: { atipico?: boolean }[]) => l.filter((p) => !p.atipico).length;
  const temPeso = s.peso.length > 0;
  const temCintura = normais(s.cintura) >= 2;
  const temMassas = normais(s.massa_magra) >= 2;

  return (
    <ProvedorSincronia>
      {faixa.length > 1 && (
        <>
          <div className="rotulo rf-rotulo-grafico">Toque num bloco de dose para sombrear o período nos gráficos</div>
          <FaixaFases fases={faixa} selecionada={sel} aoSelecionar={setSel} />
        </>
      )}
      <div className="rf-grafico">
        <h3>Peso × dose</h3>
        {temPeso ? (
          <GraficoTempo
            titulo="Peso × dose"
            series={seriesPeso}
            marcos={marcos}
            destaque={destaque}
            referencias={metaPeso ? [{ valor: metaPeso, rotulo: 'meta', cor: 'verde' }] : undefined}
            sincronia="rf-corpo"
            permitirZoom
            expandivel
            altura={230}
            formatoDir={(v) => num(v, 2)}
          />
        ) : (
          <Vazio>Sem pesagens no período.</Vazio>
        )}
      </div>
      <div className="rf-grafico">
        <h3>Cintura e % de gordura</h3>
        {temCintura ? (
          <GraficoTempo
            titulo="Cintura e % de gordura"
            series={seriesCintura}
            destaque={destaque}
            referencias={metaCintura ? [{ valor: metaCintura, rotulo: 'meta', cor: 'verde' }] : undefined}
            sincronia="rf-corpo"
            permitirZoom
            expandivel
            altura={210}
          />
        ) : (
          <Vazio>Com duas medições, aparece a evolução da cintura e do % de gordura.</Vazio>
        )}
      </div>
      {temMassas && (
        <div className="rf-grafico">
          <h3>Massa magra × massa gorda</h3>
          <GraficoTempo titulo="Massa magra × massa gorda" series={seriesMassas} destaque={destaque} sincronia="rf-corpo" permitirZoom expandivel altura={200} />
        </div>
      )}
      <p className="mudo rf-nota">Arraste num gráfico para ler a data (ela aparece nos três). Círculo vazado: medição atípica, fora das comparações.</p>
    </ProvedorSincronia>
  );
}

/** Sono, água e dieta por semana. */
export function GraficosHabitos({ r }: { r: RelatorioFinal }) {
  const [sel, setSel] = useState<string | null>(null);
  const h = r.habitos.por_semana;
  const temSono = h.some((x) => x.sono_h !== null);
  const temAgua = h.some((x) => x.agua_l !== null);
  const dieta = r.semanas.filter((x) => x.dieta_fracao !== null);
  return (
    <>
      {temSono && (
        <div className="rf-grafico">
          <h3>Sono médio por semana</h3>
          <GraficoBarrasSemana
            titulo="Sono médio por semana"
            barras={h.map((x) => ({ chave: x.segunda, rotulo: rotuloSemana(x.segunda), valores: [{ serie: 'sono', valor: x.sono_h === null ? null : Math.round(x.sono_h * 10) / 10 }] }))}
            series={[{ id: 'sono', nome: 'Sono', cor: 'roxo' }]}
            selecionada={sel}
            aoSelecionar={setSel}
            altura={150}
            formato={(v) => `${num(v, 1)} h`}
          />
        </div>
      )}
      {temAgua && (
        <div className="rf-grafico">
          <h3>Água por semana · média e meta</h3>
          <GraficoBarrasSemana
            titulo="Água por semana"
            barras={h.map((x) => ({
              chave: x.segunda,
              rotulo: rotuloSemana(x.segunda),
              valores: [
                { serie: 'agua', valor: x.agua_l === null ? null : Math.round(x.agua_l * 10) / 10 },
                { serie: 'meta', valor: x.agua_meta_l === null ? null : Math.round(x.agua_meta_l * 10) / 10 },
              ],
            }))}
            series={[
              { id: 'agua', nome: 'Água', cor: 'ciano' },
              { id: 'meta', nome: 'Meta', cor: 'neutro' },
            ]}
            selecionada={sel}
            aoSelecionar={setSel}
            altura={160}
            formato={(v) => `${num(v, 1)} L`}
          />
        </div>
      )}
      {dieta.length > 0 && (
        <div className="rf-grafico">
          <h3>Plano alimentar seguido por semana</h3>
          <GraficoBarrasSemana
            titulo="Plano alimentar seguido por semana"
            barras={r.semanas.map((x) => ({ chave: x.segunda, rotulo: rotuloSemana(x.segunda), valores: [{ serie: 'dieta', valor: x.dieta_fracao === null ? null : Math.round(x.dieta_fracao * 100) }] }))}
            series={[{ id: 'dieta', nome: 'Dieta', cor: 'verde' }]}
            selecionada={sel}
            aoSelecionar={setSel}
            max={100}
            altura={150}
            formato={(v) => `${num(v, 0)}%`}
          />
        </div>
      )}
      {!temSono && !temAgua && !dieta.length && <Vazio>Registre sono, água e “Segui o plano?” no Diário para ver os hábitos por semana.</Vazio>}
    </>
  );
}

/** Náusea média por dia depois da dose, em cada bloco. */
export function CalorNausea({ r }: { r: RelatorioFinal }) {
  const vazio = r.fases.every((f) => f.nausea_por_dia.every((n) => n === null));
  if (vazio) return <Vazio>Sem náusea registrada no Diário.</Vazio>;
  return (
    <>
      <MapaCalor colunas={r.nausea.colunas} linhas={r.fases.map((f) => ({ rotulo: `${num(f.dose_mg)} mg`, valores: f.nausea_por_dia }))} />
      <div className="calor-escala">
        <span>0</span>
        <i />
        <span>3</span>
      </div>
      {r.nausea.pico && r.nausea.pico.media >= 0.1 && (
        <p className="rf-linha-info">
          Náusea mais forte no <b>{r.nausea.pico.rotulo}</b> depois da dose (média {num(r.nausea.pico.media, 1)} de 3). D0 = dia da dose.
        </p>
      )}
      {r.nausea.tem_sintomas && (
        <details className="tabela-detalhe">
          <summary>Vômito, diarreia e intestino preso por bloco</summary>
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Bloco</th>
                  <th>Vômito</th>
                  <th>Diarreia</th>
                  <th>Intest. preso</th>
                </tr>
              </thead>
              <tbody>
                {r.fases.map((f) => (
                  <tr key={f.indice}>
                    <td>{f.rotulo}</td>
                    <td>{f.vomito === null ? '–' : pct(f.vomito, 0)}</td>
                    <td>{f.diarreia === null ? '–' : pct(f.diarreia, 0)}</td>
                    <td>{f.intestino_preso === null ? '–' : pct(f.intestino_preso, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mudo" style={{ marginTop: 6 }}>% dos dias registrados no Diário naquele bloco.</p>
        </details>
      )}
    </>
  );
}

/** Treino e cardio por semana, corridas (km e pace) e o índice de força. */
export function GraficosTreino({ r }: { r: RelatorioFinal }) {
  const [sel, setSel] = useState<string | null>(null);
  const t = r.treino;
  const corridas = t?.lista_corridas ?? [];
  const seriesCorrida = useMemo<Serie[]>(
    () => [
      { id: 'km', nome: 'Distância', tipo: 'barra', pontos: corridas.map((c) => ({ data: c.data, valor: c.km })), cor: 'laranja', unidade: 'km', casas: 1 },
      // Velocidade em vez do pace: a dica mostra "11,2 km/h" (o pace em m:ss fica nos recordes)
      { id: 'vel', nome: 'Velocidade (dir.)', tipo: 'linha', pontos: corridas.map((c) => ({ data: c.data, valor: Math.round((3600 / c.pace) * 10) / 10 })), cor: 'azul', eixo: 'dir', unidade: 'km/h', casas: 1 },
    ],
    [corridas],
  );
  const forca = t?.forca;
  const seriesForca = useMemo<Serie[]>(
    () =>
      forca
        ? [{ id: 'forca', nome: 'Índice de força', tipo: 'linha', pontos: forca.semanas.filter((s) => s.suavizado !== null).map((s) => ({ data: s.segunda, valor: Math.round(s.suavizado! * 1000) / 10 })), cor: 'roxo', unidade: '%', casas: 1 }]
        : [],
    [forca],
  );
  if (!t) return null;
  return (
    <>
      {t.semanas.length > 0 && (
        <div className="rf-grafico">
          <h3>Treino e cardio por semana</h3>
          <GraficoBarrasSemana
            titulo="Treino e cardio por semana"
            barras={t.semanas.map((x) => ({ chave: x.segunda, rotulo: rotuloSemana(x.segunda), valores: [{ serie: 'treino', valor: x.treino }, { serie: 'cardio', valor: x.cardio }] }))}
            series={[
              { id: 'treino', nome: 'Treino', cor: 'rosa' },
              { id: 'cardio', nome: 'Cardio', cor: 'ciano' },
            ]}
            selecionada={sel}
            aoSelecionar={setSel}
            max={7}
            formato={(v) => `${num(v, 0)} d`}
          />
        </div>
      )}
      {corridas.length >= 2 && (
        <div className="rf-grafico">
          <h3>Corridas: distância e velocidade</h3>
          <GraficoTempo
            titulo="Corridas: distância e velocidade"
            series={seriesCorrida}
            permitirZoom
            expandivel
            altura={200}
          />
        </div>
      )}
      {seriesForca.length > 0 && seriesForca[0].pontos.length >= 2 && (
        <div className="rf-grafico">
          <h3>Força: variação do 1RM estimado</h3>
          <GraficoTempo titulo="Índice de força" series={seriesForca} referencias={[{ valor: 0, rotulo: 'início', cor: 'neutro' }]} altura={170} />
        </div>
      )}
    </>
  );
}

