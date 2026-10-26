// Vitrine do motor de gráficos com dados sintéticos (não é importada pelo app; serve para testar e olhar).
import { useMemo, useState } from 'react';
import { somarDias } from '../../lib/datas';
import { GraficoBarrasSemana, GraficoDispersao, GraficoTempo, ProvedorSincronia, type Faixa, type Marco, type Periodo, type Serie } from './index';

const INICIO = '2026-09-01';

/** Números pseudoaleatórios estáveis (a demonstração sai sempre igual) */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function dadosDemo() {
  const r = aleatorio(7);
  const dias = 56;
  const peso: Serie['pontos'] = [];
  const cintura: Serie['pontos'] = [];
  const nausea: Serie['pontos'] = [];
  const sono: Serie['pontos'] = [];
  const dose: Serie['pontos'] = [];
  for (let i = 0; i < dias; i++) {
    const data = somarDias(INICIO, i);
    // pesagem a cada 3 ou 4 dias
    if (i % 7 === 0 || i % 7 === 3) {
      const v = 92.4 - i * 0.1 + (r() - 0.5) * 0.7;
      peso.push({ data, valor: Math.round(v * 10) / 10 });
    }
    if (i % 7 === 0) cintura.push({ data, valor: Math.round((102.5 - i * 0.11 + (r() - 0.5) * 0.6) * 10) / 10 });
    const n = Math.max(0, Math.round((i % 7 < 2 ? 5 : 2) - i * 0.03 + (r() - 0.5) * 3));
    nausea.push({ data, valor: i === 20 || i === 21 ? null : n });
    sono.push({ data, valor: i === 20 || i === 21 ? null : Math.round((7.6 - n * 0.18 + (r() - 0.5) * 1.1) * 10) / 10 });
    if (i % 7 === 0) dose.push({ data, valor: i < 21 ? 1 : i < 42 ? 2 : 3 });
  }
  // Pesagem atípica (depois de uma festa) e um buraco sem dado
  peso.push({ data: somarDias(INICIO, 26), valor: 91.2, atipico: true });
  peso.push({ data: somarDias(INICIO, 31), valor: null });
  const ultimo = peso.filter((p) => p.valor !== null && !p.atipico).sort((a, b) => (a.data < b.data ? -1 : 1)).at(-1)!;
  // Leque da previsão: abre com o tempo
  const previsao: Faixa['pontos'] = [];
  const centro: Serie['pontos'] = [{ data: ultimo.data, valor: ultimo.valor }];
  for (let k = 0; k <= 42; k += 3) {
    const c = ultimo.valor! - k * 0.085;
    const abre = 0.15 + k * 0.032;
    previsao.push({ data: somarDias(ultimo.data, k), min: Math.round((c - abre) * 10) / 10, max: Math.round((c + abre) * 10) / 10 });
    if (k) centro.push({ data: somarDias(ultimo.data, k), valor: Math.round(c * 10) / 10 });
  }
  const marcos: Marco[] = [
    { data: somarDias(INICIO, 0), rotulo: 'Início: 1 mg por semana', tipo: 'dose' },
    { data: somarDias(INICIO, 21), rotulo: 'Dose subiu para 2 mg', tipo: 'dose' },
    { data: somarDias(INICIO, 21), rotulo: 'Decisão com o médico: subir a dose', tipo: 'decisao' },
    { data: somarDias(INICIO, 26), rotulo: 'Pesagem atípica (retenção depois de viagem)', tipo: 'atipico' },
    { data: somarDias(INICIO, 35), rotulo: 'Bioimpedância na clínica', tipo: 'medicao' },
    { data: somarDias(INICIO, 42), rotulo: 'Dose subiu para 3 mg', tipo: 'dose' },
    { data: somarDias(INICIO, 47), rotulo: 'Nota: semana de muito trabalho, pouco sono', tipo: 'nota' },
  ];
  return { peso, cintura, nausea, sono, dose, previsao, centro, marcos };
}

/** 400 pontos diários (desempenho e marcas por mês) */
function serieLonga(): Serie['pontos'] {
  const r = aleatorio(3);
  let v = 60;
  return Array.from({ length: 400 }, (_, i) => {
    v += (r() - 0.48) * 1.4;
    return { data: somarDias('2025-09-20', i), valor: Math.round(v * 10) / 10 };
  });
}

export function Demonstracao() {
  const d = useMemo(dadosDemo, []);
  const longa = useMemo(serieLonga, []);
  const [log, setLog] = useState<string[]>([]);
  const [semana, setSemana] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const anotar = (t: string) => setLog((l) => [t, ...l].slice(0, 6));

  const seriesPeso = useMemo<Serie[]>(
    () => [
      { id: 'peso', nome: 'Peso', tipo: 'area', pontos: d.peso, cor: 'texto', unidade: 'kg', casas: 1 },
      { id: 'prev', nome: 'Previsão', tipo: 'linha', pontos: d.centro, cor: 'neutro', unidade: 'kg', casas: 1, tracejado: true },
      { id: 'dose', nome: 'Dose', tipo: 'degrau', pontos: d.dose, cor: 'aviso', eixo: 'dir', unidade: 'mg', casas: 1 },
    ],
    [d],
  );
  const faixas = useMemo<Faixa[]>(() => [{ id: 'leque', nome: 'Faixa provável', pontos: d.previsao, cor: 'neutro' }], [d]);
  const seriesBem = useMemo<Serie[]>(
    () => [
      { id: 'nausea', nome: 'Náusea', tipo: 'barra', pontos: d.nausea, cor: 'ruim', casas: 0 },
      { id: 'sono', nome: 'Sono', tipo: 'linha', pontos: d.sono, cor: 'texto', eixo: 'dir', unidade: 'h', casas: 1 },
    ],
    [d],
  );
  const seriesCintura = useMemo<Serie[]>(() => [{ id: 'cintura', nome: 'Cintura', tipo: 'linha', pontos: d.cintura, cor: 'bom', unidade: 'cm', casas: 1 }], [d]);

  // Semanas (para as barras e para o destaque cruzado)
  const semanas = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const de = somarDias(INICIO, i * 7);
        return { chave: de, rotulo: `S${i + 1}`, de, ate: somarDias(de, 6) };
      }),
    [],
  );
  const barras = useMemo(() => {
    const r = aleatorio(11);
    return semanas.map((s, i) => ({
      chave: s.chave,
      rotulo: s.rotulo,
      valores: [
        { serie: 'dieta', valor: Math.round(60 + r() * 38) },
        { serie: 'treino', valor: i === 3 ? null : Math.round(40 + r() * 55) },
      ],
    }));
  }, [semanas]);
  // Os gráficos de baixo seguem a mesma janela do primeiro (eixos alinhados)
  const alinhado = periodo ?? { de: INICIO, ate: d.previsao[d.previsao.length - 1].data };
  const destaque = semana ? semanas.find((s) => s.chave === semana) ?? null : null;

  const dispersao = useMemo(() => {
    const pts = d.sono.map((s, i) => ({ s, n: d.nausea[i] })).filter((q) => q.s.valor !== null && q.n.valor !== null);
    return pts.map((q) => ({ x: q.s.valor!, y: q.n.valor!, data: q.s.data, destaque: q.s.valor! < 6.5 }));
  }, [d]);

  return (
    <div className="pilha demo-graficos">
      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Peso, dose e previsão</h2>
            <p className="secao-sub">Arraste para ler; pinça ou faixa embaixo para ampliar; toque duplo volta.</p>
          </div>
        </div>
        <ProvedorSincronia>
          <div className="pilha">
            <GraficoTempo
              titulo="Peso, dose e previsão"
              series={seriesPeso}
              faixas={faixas}
              referencias={[{ valor: 86, rotulo: 'Meta 86 kg' }]}
              marcos={d.marcos}
              destaque={destaque}
              sincronia="demo"
              periodo={periodo}
              aoMudarPeriodo={(p) => {
                setPeriodo(p);
                anotar(p ? `zoom ${p.de} → ${p.ate}` : 'zoom: tudo');
              }}
              aoTocarMarco={(m) => anotar(`marco: ${m.rotulo}`)}
              aoTocarData={(x) => anotar(`data: ${x}`)}
              permitirZoom
              expandivel
              formatoDir={(v) => `${v.toLocaleString('pt-BR')} mg`}
            />
            <GraficoTempo titulo="Náusea e sono" series={seriesBem} sincronia="demo" altura={170} destaque={destaque} periodo={alinhado} />
            <GraficoTempo titulo="Cintura" series={seriesCintura} sincronia="demo" altura={140} destaque={destaque} periodo={alinhado} />
          </div>
        </ProvedorSincronia>
        <output className="mudo demo-log" data-testid="log">
          {log.length ? log.map((l, i) => <div key={i}>{l}</div>) : 'Toque num marco ou numa data.'}
        </output>
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Adesão por semana</h2>
            <p className="secao-sub">Toque numa semana para destacá-la nos gráficos acima.</p>
          </div>
        </div>
        <GraficoBarrasSemana
          titulo="Adesão por semana"
          barras={barras}
          series={[
            { id: 'dieta', nome: 'Dieta', cor: 'texto' },
            { id: 'treino', nome: 'Treino', cor: 'neutro' },
          ]}
          selecionada={semana}
          aoSelecionar={(c) => {
            setSemana(c);
            anotar(`semana: ${c ?? 'nenhuma'}`);
          }}
          max={100}
          formato={(v) => `${Math.round(v)}%`}
        />
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>Sono × náusea</h2>
            <p className="secao-sub">Cada ponto é um dia. Associação, não prova causa.</p>
          </div>
        </div>
        <GraficoDispersao
          titulo="Sono por náusea"
          pontos={dispersao}
          eixoX={{ nome: 'Sono', unidade: 'h', casas: 1 }}
          eixoY={{ nome: 'Náusea', casas: 0 }}
          tendencia
          aoTocarPonto={(i) => anotar(`ponto: ${dispersao[i].data}`)}
        />
      </section>

      <section className="cartao">
        <div className="secao-cab">
          <div>
            <h2>400 dias</h2>
            <p className="secao-sub">Desempenho com muitos pontos.</p>
          </div>
        </div>
        <GraficoTempo titulo="Série longa" series={[{ id: 'longa', nome: 'Série', tipo: 'area', pontos: longa, cor: 'bom', casas: 1 }]} permitirZoom expandivel altura={180} />
      </section>
    </div>
  );
}
