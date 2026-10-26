import { describe, expect, it } from 'vitest';
import { montarCartao, textoDose, textoPeriodo, tituloCartao, type EntradaCartao } from './compartilhar-cartao';
import { corAdesao, pontosLinha, tamanhoQueCabe } from './compartilhar-imagem';
import { somarDias } from './datas';
import { historicoComposicao } from './gordura';
import type { Medida, RegistroDiario, TreinoDia } from './tipos';

const INICIO = '2026-09-07';
const dia = (n: number) => somarDias(INICIO, n);
const medida = (n: number, cintura: number, peso: number, extra: Partial<Medida> = {}): Medida =>
  ({ id: `m${n}`, data: dia(n), altura_cm: 181, pescoco_cm: 41, cintura_cm: cintura, quadril_cm: null, peso_kg: peso, ...extra }) as Medida;
const medidas = [98, 97.6, 96.9, 96.5, 95.8, 95.6, 95.0, 94.6, 94.2].map((c, i) => medida(7 * i, c, 96 - i * 0.6));
const composicoes = historicoComposicao(medidas, 'Masculino', { altura_cm: 181 });
const serie = composicoes.map((c) => ({ data: c.data, peso_kg: c.peso_kg, origem: 'medida' as const }));
const diario: RegistroDiario[] = Array.from({ length: 56 }, (_, i) => ({
  id: `d${i}`,
  data: dia(i),
  peso_kg: null,
  nausea: 0,
  observacoes: null,
  dieta_seguida: i % 7 === 0 ? 'nao' : 'sim',
  sono_h: 7.5,
  agua_l: 3,
}));
const treinos: TreinoDia[] = Array.from({ length: 56 }, (_, i) => ({ id: `t${i}`, data: dia(i), treino: i % 6 !== 0, cardio: true, corrida_km: null, corrida_seg: null }));
const aplicacoes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ data: dia(7 * i), dose_mg: i < 4 ? 1.25 : 1.5 }));

const base = (o: Partial<EntradaCartao> = {}): EntradaCartao => ({
  composicoes,
  serie,
  inicioCiclo: INICIO,
  hoje: dia(56),
  aplicacoes,
  diario,
  treinos,
  metaAgua: () => 2.5,
  incluirDose: false,
  incluirPeso: true,
  ...o,
});

describe('textoPeriodo', () => {
  it('mesmo ano: o ano só no fim', () => expect(textoPeriodo('2026-09-07', '2026-11-02')).toBe('7 set – 2 nov 2026'));
  it('anos diferentes: os dois', () => expect(textoPeriodo('2025-12-28', '2026-01-04')).toBe('28 dez 2025 – 4 jan 2026'));
  it('um dia só', () => expect(textoPeriodo('2026-11-02', '2026-11-02')).toBe('2 nov 2026'));
});

describe('tituloCartao', () => {
  it('ciclo inteiro em semanas completas', () => {
    expect(tituloCartao(INICIO, INICIO, dia(56), false).titulo).toBe('Meu ciclo · 8 semanas');
    expect(tituloCartao(INICIO, INICIO, dia(10), false).titulo).toBe('Meu ciclo · 1 semana');
    expect(tituloCartao(INICIO, INICIO, dia(3), false).titulo).toBe('Meu ciclo · 1ª semana');
  });
  it('uma semana: a semana do ciclo, como no Resumo da semana', () => {
    const t = tituloCartao(INICIO, dia(49), dia(56), true);
    expect(t).toEqual({ sobretitulo: 'Resumo da semana', titulo: 'Meu ciclo · semana 8' });
  });
});

describe('textoDose', () => {
  it('primeira e última dose do período, com o número de aplicações', () => {
    expect(textoDose(aplicacoes, INICIO, dia(56))).toBe('Dose 1,25 → 1,50 mg · 8 aplicações');
    expect(textoDose(aplicacoes, dia(49), dia(56))).toBe('Dose 1,50 mg · 1 aplicação');
  });
  it('sem aplicação no período: a última antes dele, sem contagem', () => {
    expect(textoDose(aplicacoes, dia(50), dia(55))).toBe('Dose 1,50 mg');
    expect(textoDose([], INICIO, dia(56))).toBeNull();
  });
});

describe('montarCartao', () => {
  it('ciclo inteiro: as variações da Análise (início × última medição) com a cor do MDC', () => {
    const d = montarCartao(base());
    expect(d.titulo).toBe('Meu ciclo · 8 semanas');
    expect(d.periodoTexto).toBe('7 set – 2 nov 2026');
    expect(d.principal).toMatchObject({ rotulo: 'Cintura', texto: '− 3,8 cm', tom: 'bom', detalhe: '98,0 → 94,2 cm' });
    const peso = d.metricas.find((m) => m.chave === 'peso_kg')!;
    expect(peso.texto).toBe('− 4,8 kg');
    expect(peso.tom).toBe('bom');
    expect(peso.detalhe).toBe('91,2 kg · − 5,0%');
    expect(d.metricas.find((m) => m.chave === 'bf')!.texto).toMatch(/p\.p\.$/);
    expect(d.serieCintura).toHaveLength(9);
    expect(d.legendaLinhas).toBe('desde 07/09');
    expect(d.seriePeso).toHaveLength(9);
    expect(d.temVariacao).toBe(true);
    expect(d.nomeArquivo).toBe('ciclo-progresso-2026-11-02.png');
  });
  it('dose só com a opção ligada', () => {
    expect(montarCartao(base()).dose).toBeNull();
    expect(montarCartao(base({ incluirDose: true })).dose).toBe('Dose 1,25 → 1,50 mg · 8 aplicações');
  });
  it('sem o peso: nem a variação, nem a linha, nem no texto alternativo', () => {
    const d = montarCartao(base({ incluirPeso: false }));
    expect(d.metricas.map((m) => m.chave)).toEqual(['massa_gorda_kg', 'bf']);
    expect(d.seriePeso).toBeNull();
    expect(d.descricao).not.toMatch(/Peso/);
  });
  it('semana: medição anterior × a que fecha a semana, sem cor abaixo do erro da fita', () => {
    const d = montarCartao(base({ periodo: { de: dia(49), ate: dia(56) } }));
    expect(d.titulo).toBe('Meu ciclo · semana 8');
    expect(d.principal.texto).toBe('− 0,4 cm');
    expect(d.principal.tom).toBe('');
    // As linhas dão o contexto: as últimas 8 medições até a da semana
    expect(d.serieCintura).toHaveLength(8);
    expect(d.serieCintura[7].data).toBe(dia(56));
    expect(d.legendaLinhas).toBe('últimas 8 medições');
  });
  it('hábitos: da 1ª dose até ontem; na semana, até a véspera da medição', () => {
    const ciclo = montarCartao(base());
    expect(ciclo.adesao.map((a) => a.rotulo)).toEqual(['Treino', 'Cardio', 'Dieta', 'Água', 'Sono 7 h+']);
    expect(ciclo.adesao.find((a) => a.rotulo === 'Cardio')!.texto).toBe('56 de 56 dias');
    const semana = montarCartao(base({ periodo: { de: dia(49), ate: dia(56) }, hoje: dia(60) }));
    expect(semana.adesao.find((a) => a.rotulo === 'Cardio')!.texto).toBe('7 de 7 dias');
    // Sem a aba Treino: sem treino e cardio
    expect(montarCartao(base({ treinos: null })).adesao.map((a) => a.rotulo)).toEqual(['Dieta', 'Água', 'Sono 7 h+']);
  });
  it('medição atípica fica fora do início e do agora', () => {
    const comAtipica = historicoComposicao([...medidas, medida(63, 99, 97, { atipica: true })], 'Masculino', { altura_cm: 181 });
    const d = montarCartao(base({ composicoes: comAtipica, hoje: dia(64) }));
    expect(d.principal.texto).toBe('− 3,8 cm');
  });
  it('conta nova: sem medições, sem variação e sem hábitos', () => {
    const d = montarCartao(base({ composicoes: [], serie: [], diario: [], treinos: null, aplicacoes: [], hoje: INICIO }));
    expect(d.temDados).toBe(false);
    expect(d.temVariacao).toBe(false);
    expect(d.principal.texto).toBe('–');
    expect(d.adesao).toEqual([]);
    expect(d.descricao).toMatch(/Sem variação/);
  });
  it('semana antes do início do ciclo: o texto do período começa no início', () => {
    expect(montarCartao(base({ periodo: { de: dia(-7), ate: dia(0) }, hoje: dia(1) })).periodoTexto).toBe('7 set 2026');
  });
  it('uma medição só: o valor de agora, sem variação', () => {
    const d = montarCartao(base({ composicoes: composicoes.slice(0, 1), serie: serie.slice(0, 1), hoje: dia(2) }));
    expect(d.temDados).toBe(true);
    expect(d.temVariacao).toBe(false);
    expect(d.principal.detalhe).toBe('98,0 cm agora');
    expect(d.seriePeso).toBeNull();
  });
});

describe('desenho: contas puras', () => {
  it('tamanhoQueCabe reduz até caber (e para no mínimo)', () => {
    const medir = (px: number) => px * 10;
    expect(tamanhoQueCabe(medir, 500, 72)).toBe(50);
    expect(tamanhoQueCabe(medir, 1000, 72)).toBe(72);
    expect(tamanhoQueCabe(medir, 10, 72, 20)).toBe(20);
  });
  it('pontosLinha: x pelas datas, y invertido (maior valor no alto)', () => {
    const p = pontosLinha(
      [
        { data: '2026-10-01', valor: 100 },
        { data: '2026-10-03', valor: 90 },
        { data: '2026-10-05', valor: 95 },
      ],
      { x: 0, y: 0, l: 100, a: 50 },
    );
    expect(p).toEqual([
      [0, 0],
      [50, 50],
      [100, 25],
    ]);
    expect(pontosLinha([{ data: '2026-10-01', valor: 1 }], { x: 0, y: 0, l: 1, a: 1 })).toEqual([]);
  });
  it('pontosLinha: valores iguais ficam no meio', () => {
    const p = pontosLinha(
      [
        { data: '2026-10-01', valor: 5 },
        { data: '2026-10-08', valor: 5 },
      ],
      { x: 0, y: 0, l: 10, a: 40 },
    );
    expect(p.map(([, y]) => y)).toEqual([20, 20]);
  });
  it('corAdesao segue a régua do painel', () => {
    expect(corAdesao(0.9)).toBe('#34c759');
    expect(corAdesao(0.6)).toBe('#ffd60a');
    expect(corAdesao(0.3)).toBe('#ff453a');
  });
});
