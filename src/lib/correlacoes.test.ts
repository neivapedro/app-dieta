import { describe, expect, it } from 'vitest';
import type { PontoPeso } from './analise';
import {
  analisesDispersao,
  analisesGrupos,
  AVISO_ASSOCIACAO,
  AVISO_DOSE,
  dadosCorrelacao,
  diasCorrelacao,
  filtrarPeriodo,
  insightsCorrelacoes,
  intensidade,
  paresValidos,
  pearson,
  postos,
  rCriticoPearson,
  rCriticoSpearman,
  retaMinimos,
  semanasCorrelacao,
  spearman,
  textoR,
  TEXTO_COMO_LER,
  type AnaliseCorrelacao,
  type DadosCorrelacao,
  type EntradaCorrelacoes,
} from './correlacoes';
import { segundaDaSemana, somarDias } from './datas';
import type { Composicao } from './gordura';
import type { Aplicacao, RegistroDiario, TreinoDia } from './tipos';

const INICIO = segundaDaSemana('2026-08-05');

interface SemanaFake {
  sono?: number | null;
  agua?: number | null;
  dieta?: 'sim' | 'parcial' | 'nao' | null;
  /** Dias de treino na semana (0 a 7) */
  treinos?: number;
  /** Dias com vômito na semana */
  sintomas?: number;
  nausea?: number | null;
  dose?: number | null;
  /** Medição da segunda */
  cintura?: number | null;
  magra?: number | null;
  peso?: number | null;
  atipica?: boolean;
  /** Sem nenhum registro no Diário */
  semDiario?: boolean;
}

/** Cenário sintético: uma semana por item, a partir de INICIO; hoje = último domingo. */
function cenario(sem: SemanaFake[], o: { comTreino?: boolean } = {}): EntradaCorrelacoes {
  const diario: RegistroDiario[] = [];
  const aplicacoes: Aplicacao[] = [];
  const composicoes: Composicao[] = [];
  const serie: PontoPeso[] = [];
  const treinos: TreinoDia[] = [];
  sem.forEach((s, w) => {
    const seg = somarDias(INICIO, 7 * w);
    if (s.dose != null) aplicacoes.push({ id: seg, ciclo_id: 'c', data: seg, dose_mg: s.dose, local: null, observacoes: null });
    for (let d = 0; d < 7; d++) {
      const data = somarDias(seg, d);
      if (!s.semDiario) {
        diario.push({
          id: data,
          data,
          peso_kg: null,
          nausea: s.nausea ?? null,
          observacoes: null,
          vomito: d < (s.sintomas ?? 0) ? true : null,
          dieta_seguida: s.dieta ?? null,
          sono_h: s.sono ?? null,
          agua_l: s.agua ?? null,
        });
      }
      treinos.push({ id: data, data, treino: d < (s.treinos ?? 0), cardio: false, corrida_km: null, corrida_seg: null });
    }
    if (s.cintura != null) {
      const peso = s.peso ?? 90;
      const magra = s.magra ?? 60;
      composicoes.push({
        data: seg,
        peso_kg: peso,
        bf: ((peso - magra) / peso) * 100,
        massa_magra_kg: magra,
        massa_gorda_kg: peso - magra,
        cintura_cm: s.cintura,
        pescoco_cm: 40,
        quadril_cm: null,
        atipica: !!s.atipica,
      });
    }
    if (s.peso != null) serie.push({ data: seg, peso_kg: s.peso, origem: 'medida', ...(s.atipica ? { atipica: true } : {}) });
  });
  return {
    inicio: INICIO,
    hoje: somarDias(INICIO, 7 * sem.length - 1),
    aplicacoes,
    serie,
    composicoes,
    diario,
    treinos: o.comTreino === false ? null : treinos,
    metaAgua: () => 2,
  };
}

/** Cintura acumulada a partir de variações semanais (a 1ª semana não tem variação) */
const acumular = (inicio: number, deltas: number[]) => deltas.reduce<number[]>((l, d) => [...l, l[l.length - 1] + d], [inicio]);

const ehCausal = (t: string) => /\b(causa|causou|causam|causar|porque|faz|fez|fazem|provoca|provocou|leva a|levou a|graças)\b/i.test(t.replace(AVISO_ASSOCIACAO, ''));
const conselhoDose = (t: string) => /\b(suba|subir|aumente|aumentar|reduza|reduzir|diminua|diminuir|baixe|baixar|mantenha|manter|ajuste|ajustar|troque|deveria|recomend\w*)\b/i.test(t);

describe('pearson', () => {
  it('correlação perfeita positiva e negativa', () => {
    const p = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!;
    expect(p.r).toBeCloseTo(1, 10);
    expect(p.n).toBe(5);
    expect(p.significativa).toBe(true);
    expect(pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])!.r).toBeCloseTo(-1, 10);
  });
  it('sem relação: r ≈ 0 e não significativa', () => {
    const p = pearson([1, 2, 3, 4, 5, 6], [1, 3, 2, 2, 3, 1])!;
    expect(Math.abs(p.r)).toBeLessThan(0.1);
    expect(p.significativa).toBe(false);
  });
  it('exclusão aos pares com nulls, undefined e NaN', () => {
    const p = pearson([1, null, 2, 3, undefined, 4, NaN, 5], [2, 9, 4, 6, 9, 8, 9, 10])!;
    expect(p.n).toBe(5);
    expect(p.r).toBeCloseTo(1, 10);
    expect(paresValidos([1, null, 3], [null, 2, 3])).toEqual({ x: [3], y: [3] });
  });
  it('série constante ou poucos pares: null', () => {
    expect(pearson([1, 2, 3, 4, 5], [3, 3, 3, 3, 3])).toBeNull();
    expect(pearson([7, 7, 7, 7], [1, 2, 3, 4])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([], [])).toBeNull();
  });
  it('comprimentos diferentes: usa o menor', () => {
    expect(pearson([1, 2, 3, 4], [1, 2, 3])!.n).toBe(3);
  });
  it('significância pelo r crítico do n', () => {
    // n = 5: r crítico 0,878; r = 0,85 não passa
    expect(rCriticoPearson(5)).toBeCloseTo(0.878, 3);
    expect(rCriticoPearson(10)).toBeCloseTo(0.632, 3);
    expect(rCriticoPearson(30)).toBeCloseTo(0.361, 2);
    expect(rCriticoPearson(50)).toBeCloseTo(0.279, 2);
    expect(rCriticoPearson(2)).toBeNull();
    const x = [1, 2, 3, 4, 5];
    const y = [1, 3, 2, 5, 4]; // r = 0,8
    const p = pearson(x, y)!;
    expect(p.r).toBeCloseTo(0.8, 6);
    expect(p.significativa).toBe(false);
    // O mesmo padrão repetido (n = 10) já passa
    const p2 = pearson([...x, ...x.map((v) => v + 5)], [...y, ...y.map((v) => v + 5)])!;
    expect(p2.significativa).toBe(true);
  });
});

describe('spearman', () => {
  it('monótona não linear: ρ = 1', () => {
    const s = spearman([1, 2, 3, 4, 5, 6], [1, 4, 9, 16, 25, 1000])!;
    expect(s.r).toBeCloseTo(1, 10);
    expect(s.significativa).toBe(true);
    expect(pearson([1, 2, 3, 4, 5, 6], [1, 4, 9, 16, 25, 1000])!.r).toBeLessThan(0.8);
  });
  it('postos com empates pela média', () => {
    expect(postos([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });
  it('empates (náusea 0 a 3)', () => {
    const s = spearman([8, 8, 7, 6, 6, 5], [0, 0, 1, 2, 2, 3])!;
    expect(s.r).toBeCloseTo(-1, 10);
  });
  it('valores críticos: tabela exata até 20, t acima; menos de 5 não é significativo', () => {
    expect(rCriticoSpearman(5)).toBe(1);
    expect(rCriticoSpearman(10)).toBe(0.648);
    expect(rCriticoSpearman(4)).toBeNull();
    expect(rCriticoSpearman(40)).toBeCloseTo(rCriticoPearson(40)!, 10);
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])!.significativa).toBe(false);
  });
  it('constante: null', () => {
    expect(spearman([1, 2, 3, 4, 5], [0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('retaMinimos', () => {
  it('reta exata', () => {
    const r = retaMinimos([0, 1, 2, 3], [1, 3, 5, 7])!;
    expect(r.inclinacao).toBeCloseTo(2, 10);
    expect(r.intercepto).toBeCloseTo(1, 10);
    expect(r.n).toBe(4);
  });
  it('com nulls e x constante', () => {
    expect(retaMinimos([0, null, 2], [1, 5, 5])!.inclinacao).toBeCloseTo(2, 10);
    expect(retaMinimos([3, 3, 3], [1, 2, 3])).toBeNull();
    expect(retaMinimos([1], [1])).toBeNull();
  });
});

describe('formatação', () => {
  it('textoR em pt-BR com o menos colado', () => {
    expect(textoR(-0.4567)).toBe('r = −0,46');
    expect(textoR(0.5)).toBe('r = 0,50');
    expect(textoR(-0.001)).toBe('r = 0,00');
  });
  it('intensidade', () => {
    expect(intensidade(0.2)).toBe('fraca');
    expect(intensidade(-0.35)).toBe('moderada');
    expect(intensidade(0.6)).toBe('forte');
    expect(intensidade(-0.9)).toBe('muito forte');
  });
  it('Como ler sem causalidade', () => {
    expect(TEXTO_COMO_LER).toContain(AVISO_ASSOCIACAO);
    expect(ehCausal(TEXTO_COMO_LER)).toBe(false);
  });
});

describe('semanasCorrelacao', () => {
  it('médias, frações e variações da semana', () => {
    const e = cenario([
      { sono: 7, agua: 1.5, dieta: 'sim', treinos: 7, sintomas: 0, nausea: 1, dose: 2.5, cintura: 100, peso: 90, magra: 60 },
      { sono: 6, agua: 2.5, dieta: 'parcial', treinos: 0, sintomas: 2, nausea: 2, dose: 5, cintura: 99, peso: 89, magra: 59.5 },
      { semDiario: true, cintura: 98.2, peso: 88.3, magra: 59.5 },
    ]);
    const [s0, s1, s2] = semanasCorrelacao(e);
    expect(s0.rotulo).toBe(INICIO.slice(8, 10) + '/' + INICIO.slice(5, 7));
    expect(s0).toMatchObject({ sono_h: 7, agua_l: 1.5, agua_meta_l: 2, agua_frac: 0.75, dieta_frac: 1, treino_frac: 1, adesao: 1, sintomas: 0, nausea_media: 1, dose_mg: 2.5 });
    expect(s0.cintura_sem).toBeNull();
    expect(s0.peso_sem).toBeNull();
    expect(s1).toMatchObject({ dieta_frac: 0.5, treino_frac: 0, adesao: 0.25, sintomas: 2, dose_mg: 5 });
    expect(s1.cintura_sem).toBeCloseTo(-1, 10);
    expect(s1.peso_sem).toBeCloseTo(-1, 10);
    expect(s1.magra_sem).toBeCloseTo(-0.5, 10);
    expect(s1.gorda_sem).toBeCloseTo(-0.5, 10);
    // Semana sem Diário: sintomas null (não 0), sem sono nem dieta
    expect(s2).toMatchObject({ sintomas: null, sono_h: null, dieta_frac: null, nausea_media: null });
    expect(s2.cintura_sem).toBeCloseTo(-0.8, 10);
  });
  it('medição atípica fica de fora; a variação compara com a última normal (por semana)', () => {
    const e = cenario([{ cintura: 100, peso: 90 }, { cintura: 90, peso: 80, atipica: true }, { cintura: 98, peso: 88 }]);
    const s = semanasCorrelacao(e);
    expect(s[1].cintura_sem).toBeNull();
    expect(s[1].peso_sem).toBeNull();
    // 2 cm em 14 dias = − 1 cm/sem
    expect(s[2].cintura_sem).toBeCloseTo(-1, 10);
    expect(s[2].peso_sem).toBeCloseTo(-1, 10);
  });
  it('intervalo longo demais entre medições: sem variação', () => {
    const sem: SemanaFake[] = [{ cintura: 100 }, {}, {}, {}, {}, {}, { cintura: 95 }];
    expect(semanasCorrelacao(cenario(sem))[6].cintura_sem).toBeNull();
  });
  it('peso pela média das pesagens na data média', () => {
    const e = cenario([{}, {}]);
    const seg2 = somarDias(INICIO, 7);
    e.serie = [
      { data: INICIO, peso_kg: 90, origem: 'diario' },
      { data: somarDias(INICIO, 2), peso_kg: 89.8, origem: 'diario' },
      { data: somarDias(seg2, 1), peso_kg: 89.1, origem: 'diario' },
    ];
    const s = semanasCorrelacao(e);
    // Semana 1: 89,9 no dia 1; semana 2: 89,1 no dia 8 → − 0,8 kg em 7 dias
    expect(s[1].peso_sem).toBeCloseTo(-0.8, 10);
  });
  it('conta sem Treino: treino null e adesão só da dieta', () => {
    const [s] = semanasCorrelacao(cenario([{ dieta: 'parcial' }], { comTreino: false }));
    expect(s.treino_frac).toBeNull();
    expect(s.adesao).toBe(0.5);
  });
  it('fora do ciclo (início depois de hoje): vazio', () => {
    const e = cenario([{}]);
    expect(semanasCorrelacao({ ...e, inicio: somarDias(e.hoje, 1) })).toEqual([]);
  });
});

describe('diasCorrelacao', () => {
  it('sono da noite, náusea, água, sintoma e dia após a dose', () => {
    const e = cenario([{ sono: 6.5, nausea: 2, agua: 1.8, sintomas: 1, dose: 2.5 }]);
    const d = diasCorrelacao(e);
    expect(d).toHaveLength(7);
    expect(d[0]).toMatchObject({ sono_h: 6.5, nausea: 2, agua_l: 1.8, agua_meta_l: 2, sintoma: true, d_dose: 0 });
    expect(d[3]).toMatchObject({ sintoma: false, d_dose: 3 });
  });
});

/** Dados prontos a partir de semanas */
const dados = (sem: SemanaFake[], o?: { comTreino?: boolean }): DadosCorrelacao => dadosCorrelacao(cenario(sem, o));
const achar = <T extends AnaliseCorrelacao>(l: T[], id: string) => l.find((a) => a.id === id)!;

describe('analisesDispersao', () => {
  it('adesão × cintura perfeita: texto com r e contagem, sem causa', () => {
    // Adesão cai e a queda de cintura diminui junto
    const deltas = [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2];
    const cint = acumular(100, deltas);
    const treinos = [7, 7, 6, 5, 4, 3, 2, 1];
    const sem = cint.map((c, i) => ({ cintura: c, treinos: treinos[i], dieta: 'sim' as const }));
    const a = achar(analisesDispersao(dados(sem)), 'adesao_cintura');
    expect(a.titulo).toBe('Adesão (treino e dieta) × cintura');
    expect(a.n).toBe(7);
    expect(a.r!).toBeLessThan(-0.95);
    expect(a.significativa).toBe(true);
    expect(a.reta!.inclinacao).toBeLessThan(0);
    expect(a.pontos[0]).toMatchObject({ data: somarDias(INICIO, 7), rotulo: expect.stringMatching(/^\d\d\/\d\d$/) });
    expect(a.texto).toMatch(/^Semanas com mais adesão ao treino e à dieta tiveram mais queda de cintura \(r = −\d,\d\d, associação muito forte; 7 semanas\)\. Associação, não prova de causa\.$/);
    expect(ehCausal(a.texto!)).toBe(false);
  });
  it('menos de 5 semanas: sem texto, mesmo com r perfeito', () => {
    const cint = acumular(100, [-1, -0.5, 0, 0.5]);
    const sem = cint.map((c, i) => ({ cintura: c, treinos: 7 - i, dieta: 'sim' as const }));
    const a = achar(analisesDispersao(dados(sem)), 'adesao_cintura');
    expect(a.n).toBe(4);
    expect(a.r!).toBeLessThan(-0.95);
    expect(a.texto).toBeNull();
    expect(a.forca).toBe(0);
  });
  it('sem relação ou série constante: sem texto', () => {
    const cint = acumular(100, [-0.5, -0.5, -0.5, -0.5, -0.5, -0.5]);
    const sem = cint.map((c, i) => ({ cintura: c, treinos: [7, 2, 5, 1, 6, 3, 4][i], dieta: 'sim' as const }));
    const a = achar(analisesDispersao(dados(sem)), 'adesao_cintura');
    expect(a.r).toBeNull();
    expect(a.texto).toBeNull();
  });
  it('conta sem Treino: adesão é só a dieta', () => {
    const cint = acumular(100, [-1, -1, -0.2, -0.2, -1, -0.2]);
    const dieta = ['sim', 'sim', 'sim', 'nao', 'nao', 'sim', 'nao'] as const;
    const sem = cint.map((c, i) => ({ cintura: c, dieta: dieta[i] }));
    const a = achar(analisesDispersao(dados(sem, { comTreino: false })), 'adesao_cintura');
    expect(a.titulo).toBe('Adesão à dieta × cintura');
    expect(a.eixoX.nome).toBe('Adesão à dieta');
    expect(a.texto).toMatch(/^Semanas com mais adesão à dieta tiveram mais queda de cintura/);
  });
  it('dose × ritmo de peso: só descritivo, com o aviso da dose e nada de conselho', () => {
    const pesos = acumular(95, [-0.2, -0.3, -0.5, -0.6, -0.8, -0.9]);
    const doses = [1, 1.5, 2, 2.5, 3, 3.5, 4];
    const sem = pesos.map((p, i) => ({ peso: p, dose: doses[i] }));
    const a = achar(analisesDispersao(dados(sem)), 'dose_peso');
    expect(a.sobre_dose).toBe(true);
    expect(a.texto).toContain('Nas semanas com dose maior, o peso caiu mais rápido');
    expect(a.texto).toContain(AVISO_DOSE);
    expect(a.texto!.endsWith(AVISO_ASSOCIACAO)).toBe(true);
    expect(conselhoDose(a.texto!)).toBe(false);
    expect(ehCausal(a.texto!)).toBe(false);
    expect(a.tom).toBe('info');
    // Direção oposta também só descreve
    const sem2 = acumular(95, [-0.9, -0.8, -0.6, -0.5, -0.3, -0.2]).map((p, i) => ({ peso: p, dose: doses[i] }));
    const b = achar(analisesDispersao(dados(sem2)), 'dose_peso');
    expect(b.texto).toContain('o peso caiu mais devagar');
    expect(conselhoDose(b.texto!)).toBe(false);
  });
  it('semanas sem dose ficam fora (exclusão aos pares)', () => {
    const pesos = acumular(95, [-0.2, -0.3, -0.5, -0.6, -0.8, -0.9]);
    const sem = pesos.map((p, i) => ({ peso: p, dose: i === 3 ? null : 1 + i * 0.5 }));
    const a = achar(analisesDispersao(dados(sem)), 'dose_peso');
    expect(a.n).toBe(5);
  });
  it('sono × náusea dia a dia: 14 dias ou mais para virar texto', () => {
    const sonos = [8, 7.5, 7, 6.5, 6, 5.5, 5];
    const nauseas = [0, 0, 1, 1, 2, 2, 3];
    const montar = (semanas: number) => {
      const e = cenario(Array.from({ length: semanas }, () => ({})));
      e.diario = e.diario.map((r, i) => ({ ...r, sono_h: sonos[i % 7], nausea: nauseas[i % 7] }));
      return dadosCorrelacao(e);
    };
    const curto = achar(analisesDispersao(montar(1)), 'sono_nausea');
    expect(curto.n).toBe(7);
    expect(curto.texto).toBeNull();
    const a = achar(analisesDispersao(montar(3)), 'sono_nausea');
    expect(a.escopo).toBe('dia');
    expect(a.n).toBe(21);
    expect(a.rho!).toBeCloseTo(-1, 1);
    expect(a.texto).toMatch(/^Noites de sono mais longas vieram com menos náusea no dia seguinte \(r = −0,\d\d, associação muito forte; 21 dias\)\./);
  });
  it('sono × massa magra e água × sintoma', () => {
    const sono = [7.5, 8, 7, 6.5, 6, 5.5, 5];
    const magra = acumular(60, [0.1, 0, -0.1, -0.2, -0.3, -0.4]);
    const sem = magra.map((m, i) => ({ cintura: 100 - i, magra: m, sono: sono[i], agua: 3 - i * 0.2, sintomas: i }));
    const d = analisesDispersao(dados(sem));
    expect(achar(d, 'sono_magra').texto).toMatch(/^Semanas com mais sono tiveram menos queda de massa magra pela fita/);
    expect(achar(d, 'agua_sintoma').texto).toMatch(/^Semanas com mais água tiveram menos dias com vômito, diarreia ou intestino preso \(r = −/);
  });
});

describe('analisesGrupos', () => {
  it('sono ≥ 7 h × cintura: o texto do exemplo', () => {
    const cint = acumular(100, [-0.6, -0.6, -0.6, -0.6, -0.3, -0.3, -0.3]);
    const sono = [7, 7.5, 7, 8, 7.2, 6, 6.5, 5.5];
    const sem = cint.map((c, i) => ({ cintura: c, sono: sono[i] }));
    const g = achar(analisesGrupos(dados(sem)), 'sono_cintura');
    expect(g.sim).toMatchObject({ n: 4 });
    expect(g.nao).toMatchObject({ n: 3 });
    expect(g.sim!.media).toBeCloseTo(-0.6, 10);
    expect(g.significativa).toBe(true);
    expect(g.texto).toBe('Nas semanas com sono de 7 h ou mais, a cintura caiu em média 0,6 cm/sem; nas outras, 0,3 cm/sem (4 × 3 semanas). Associação, não prova de causa.');
    expect(g.tom).toBe('bom');
  });
  it('limiar: exatamente 7 h entra no grupo de cima', () => {
    const cint = acumular(100, [-0.6, -0.6, -0.6, -0.3, -0.3, -0.3]);
    const sono = [7, 7, 7, 7, 6.9, 6.9, 6.9];
    const g = achar(analisesGrupos(dados(cint.map((c, i) => ({ cintura: c, sono: sono[i] })))), 'sono_cintura');
    expect(g.sim!.n).toBe(3);
    expect(g.nao!.n).toBe(3);
  });
  it('direções opostas e estável', () => {
    const cint = acumular(100, [-0.5, -0.5, -0.5, 0.2, 0.2, 0.2]);
    const sono = [8, 8, 8, 8, 6, 6, 6];
    const g = achar(analisesGrupos(dados(cint.map((c, i) => ({ cintura: c, sono: sono[i] })))), 'sono_cintura');
    expect(g.texto).toContain('a cintura caiu em média 0,5 cm/sem; nas outras, subiu 0,2 cm/sem (3 × 3 semanas)');
    const cint2 = acumular(100, [0, 0, 0, -0.4, -0.4, -0.4]);
    const g2 = achar(analisesGrupos(dados(cint2.map((c, i) => ({ cintura: c, sono: sono[i] })))), 'sono_cintura');
    expect(g2.texto).toContain('a cintura ficou estável, em média; nas outras, caiu 0,4 cm/sem');
    expect(g2.tom).toBe('info');
  });
  it('grupo pequeno, poucas semanas ou diferença sem significância: sem texto', () => {
    // Só 1 semana abaixo de 7 h
    const cint = acumular(100, [-0.6, -0.6, -0.6, -0.6, -0.6, -0.1]);
    const sono = [8, 8, 8, 8, 8, 8, 6];
    expect(achar(analisesGrupos(dados(cint.map((c, i) => ({ cintura: c, sono: sono[i] })))), 'sono_cintura').texto).toBeNull();
    // 4 semanas
    const curto = acumular(100, [-0.6, -0.6, -0.3, -0.3]);
    expect(achar(analisesGrupos(dados(curto.map((c, i) => ({ cintura: c, sono: [8, 8, 8, 6, 6][i] })))), 'sono_cintura').texto).toBeNull();
    // Grupos misturados: médias quase iguais
    const misto = acumular(100, [-0.6, -0.2, -0.6, -0.2, -0.6, -0.2]);
    const sonoMisto = [8, 8, 8, 6, 6, 8, 6];
    const g = achar(analisesGrupos(dados(misto.map((c, i) => ({ cintura: c, sono: sonoMisto[i] })))), 'sono_cintura');
    expect(g.significativa).toBe(false);
    expect(g.texto).toBeNull();
  });
  it('água na meta × dias com sintoma (pluralização) e dias com sintoma × água', () => {
    const agua = [2.2, 2.5, 2, 1.95, 1.4, 1.2, 1.5];
    const sint = [0, 1, 0, 0, 3, 2, 4];
    const g = achar(analisesGrupos(dados(agua.map((a, i) => ({ agua: a, sintomas: sint[i] })))), 'agua_sintoma_grupos');
    expect(g.texto).toBe('Nas semanas com água na meta (média), houve em média 0,3 dia com sintoma; nas outras, 3,0 dias (4 × 3 semanas). Associação, não prova de causa.');
    expect(g.tom).toBe('bom');
    // Nenhum dia com sintoma nas semanas na meta
    const sint0 = [0, 0, 0, 0, 3, 2, 4];
    const g0 = achar(analisesGrupos(dados(agua.map((a, i) => ({ agua: a, sintomas: sint0[i] })))), 'agua_sintoma_grupos');
    expect(g0.texto).toBe('Nas semanas com água na meta (média), não houve dia com sintoma; nas outras, 3,0 dias em média (4 × 3 semanas). Associação, não prova de causa.');
    // Dia a dia: nos dias com sintoma, menos água → atenção
    const e = cenario([{}, {}, {}]);
    e.diario = e.diario.map((r, i) => ({ ...r, vomito: i % 5 === 0 ? true : null, agua_l: i % 5 === 0 ? 1.2 : 2.4 }));
    const s = achar(analisesGrupos(dadosCorrelacao(e)), 'sintoma_agua');
    expect(s.texto).toBe('Nos dias com sintoma, a água anotada foi em média 1,2 L; nos outros, 2,4 L (5 × 16 dias). Associação, não prova de causa.');
    expect(s.tom).toBe('atencao');
  });
  it('sono × náusea por grupos de noites', () => {
    const e = cenario([{}, {}, {}]);
    e.diario = e.diario.map((r, i) => ({ ...r, sono_h: i % 3 === 0 ? 6 : 7.5, nausea: i % 3 === 0 ? 2 : i % 2 }));
    const g = achar(analisesGrupos(dadosCorrelacao(e)), 'sono_nausea_grupos');
    expect(g.texto).toMatch(/^Depois de noites com 7 h ou mais de sono, a náusea média do dia foi 0,\d de 3; depois das noites mais curtas, 2,0 de 3 \(14 × 7 dias\)\./);
  });
});

/** Cenário rico: vários pares com associação nas duas direções */
function rico(): DadosCorrelacao {
  const cint = acumular(100, [-0.8, -0.7, -0.2, -0.1, -0.9, -0.15, -0.75, -0.1, -0.85]);
  const sono = [7.5, 7.4, 7.6, 6.1, 6.3, 7.8, 6.2, 7.3, 6, 7.9];
  const treinos = [7, 6, 7, 2, 1, 7, 2, 6, 1, 7];
  const doses = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  const pesos = acumular(98, [-0.9, -0.8, -0.3, -0.2, -1, -0.25, -0.85, -0.2, -0.95]);
  const sem = cint.map((c, i) => ({
    cintura: c,
    peso: pesos[i],
    magra: 60 - i * 0.1 + (sono[i] >= 7 ? 0.05 : -0.2),
    sono: sono[i],
    treinos: treinos[i],
    dieta: (treinos[i] > 4 ? 'sim' : 'nao') as 'sim' | 'nao',
    dose: doses[i],
    agua: sono[i] >= 7 ? 2.3 : 1.6,
    sintomas: sono[i] >= 7 ? 0 : 2,
    nausea: sono[i] >= 7 ? 0 : 2,
  }));
  return dadosCorrelacao(cenario(sem));
}

describe('insightsCorrelacoes', () => {
  it('no máximo 4, do mais forte ao mais fraco, um por par, com grupos preferidos', () => {
    const d = rico();
    const lista = insightsCorrelacoes(d);
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.length).toBeLessThanOrEqual(4);
    const forcas = lista.map((i) => i.analise.forca);
    expect([...forcas].sort((a, b) => b - a)).toEqual(forcas);
    const pares = lista.map((i) => i.analise.par);
    expect(new Set(pares).size).toBe(pares.length);
    // sono × cintura e adesão × cintura têm grupos com texto: a dispersão do mesmo par não aparece junto
    const grupos = analisesGrupos(d).filter((g) => g.texto);
    for (const g of grupos) {
      const doPar = lista.filter((i) => i.analise.par === g.par);
      if (doPar.length) expect(doPar[0].analise.tipo).toBe('grupos');
    }
    for (const i of lista) expect(i.texto).toBe(i.analise.texto);
    expect(insightsCorrelacoes(d, 2)).toHaveLength(Math.min(2, lista.length));
  });
  it('aceita a entrada crua (mesmas entradas de semanasDoCiclo)', () => {
    const cint = acumular(100, [-0.6, -0.6, -0.6, -0.6, -0.3, -0.3, -0.3]);
    const sono = [7, 7.5, 7, 8, 7.2, 6, 6.5, 5.5];
    const lista = insightsCorrelacoes(cenario(cint.map((c, i) => ({ cintura: c, sono: sono[i] }))));
    expect(lista[0].texto).toContain('Nas semanas com sono de 7 h ou mais');
    expect(lista[0].tom).toBe('bom');
  });
  it('conta nova ou dados vazios: nenhum insight', () => {
    expect(insightsCorrelacoes(cenario([{}]))).toEqual([]);
    expect(insightsCorrelacoes({ semanas: [], dias: [], comTreino: true })).toEqual([]);
    const vazias = analisesDispersao({ semanas: [], dias: [], comTreino: false });
    expect(vazias.map((a) => a.id)).toEqual(['sono_nausea', 'adesao_cintura', 'dose_peso', 'sono_magra', 'agua_sintoma']);
    expect(vazias.every((a) => a.texto === null && a.n === 0 && a.r === null && a.reta === null)).toBe(true);
  });
  it('nenhum texto fala em causa nem dá conselho de dose; números em pt-BR', () => {
    const d = rico();
    const textos = [...analisesDispersao(d), ...analisesGrupos(d)].map((a) => a.texto).filter((t): t is string => !!t);
    expect(textos.length).toBeGreaterThanOrEqual(4);
    for (const t of textos) {
      expect(ehCausal(t)).toBe(false);
      expect(conselhoDose(t)).toBe(false);
      expect(t).not.toMatch(/\d\.\d/);
      expect(t.endsWith(AVISO_ASSOCIACAO)).toBe(true);
    }
  });
});

describe('filtrarPeriodo', () => {
  it('semanas que tocam o período e dias dentro dele', () => {
    const d = dados([{ sono: 7 }, { sono: 6 }, { sono: 8 }]);
    const de = somarDias(INICIO, 9);
    const ate = somarDias(INICIO, 15);
    const f = filtrarPeriodo(d, de, ate);
    expect(f.semanas.map((s) => s.segunda)).toEqual([somarDias(INICIO, 7), somarDias(INICIO, 14)]);
    expect(f.dias).toHaveLength(7);
    expect(f.dias[0].data).toBe(de);
  });
});
