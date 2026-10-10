import { describe, expect, it } from 'vitest';
import linhas from '../dados/alimentos.json';
import { fracaoMagraDaPerda, kcalPorKgPerdido, ritmoEstimado, type Tendencia } from './conferencia';
import { somarDias } from './datas';
import {
  calcularSaldo,
  distribuicaoProteina,
  fecharMacro,
  lerAlimentos,
  macroPrincipal,
  macrosDoItem,
  ehColageno,
  opcoesTroca,
  proteinaColageno,
  proteinaTotal,
  somar,
  type Alimento,
  type LinhaAlimento,
  type Metas,
} from './dieta';
import { conselhoConferencia, dietaNaTendencia, textoPlanoSeguido } from './semana';
import type { RegistroDiario } from './tipos';

const alimentos = lerAlimentos(linhas as LinhaAlimento[]);
const mapa = new Map(alimentos.map((a) => [a.id, a]));

const alimento = (p: Partial<Alimento>): Alimento => ({
  id: 'a',
  nome: 'A',
  grupo: '',
  prot: 0,
  carb: 0,
  gord: 0,
  fibra: 0,
  animal: false,
  porcoes: [],
  fonte: '',
  busca: 'a',
  oculto: false,
  ...p,
});

describe('Colágeno e gelatina fora da proteína animal', () => {
  it('colágeno, gelatinas preparadas e gelatina em pó não contam como animal', () => {
    for (const id of ['x14', 'x44', 'x45', 't515']) expect(mapa.get(id)!.animal).toBe(false);
    // Colágeno vira proteína vegetal na conta (fora da meta animal)
    const m = macrosDoItem({ alimento_id: 'x14', quantidade: 1, unidade: 'dose' }, mapa.get('x14'));
    expect(m.ptn_animal).toBe(0);
    expect(m.ptn_vegetal).toBeCloseTo(9, 6);
  });
  it('carnes, ovos, leite e whey continuam animais', () => {
    for (const id of ['x01', 'x02']) expect(mapa.get(id)!.animal).toBe(true);
    expect(alimentos.filter((a) => a.animal).length).toBe(276);
  });
});

describe('Proteína total (animal + vegetal)', () => {
  it('g/kg de massa magra e de peso, com aviso abaixo de 1,6 g/kg de peso', () => {
    const t = proteinaTotal({ ptn_animal: 144.2, ptn_vegetal: 36.9 }, { peso_kg: 95.5, massa_magra_kg: 72.6 });
    expect(t.g).toBeCloseTo(181.1, 6);
    expect(t.gkg_magra).toBeCloseTo(181.1 / 72.6, 6);
    expect(t.gkg_peso).toBeCloseTo(181.1 / 95.5, 6);
    expect(t.abaixo).toBe(false);
    expect(proteinaTotal({ ptn_animal: 120, ptn_vegetal: 20 }, { peso_kg: 95.5, massa_magra_kg: 72.6 }).abaixo).toBe(true);
  });
  it('colágeno e gelatina ficam fora da proteína total', () => {
    for (const id of ['x14', 'x44', 'x45', 't515']) expect(ehColageno(mapa.get(id)!)).toBe(true);
    for (const id of ['x01', 't3', 't488']) expect(ehColageno(mapa.get(id)!)).toBe(false);
    const refeicoes = [
      { id: 'r1', nome: 'R1', horario: null, itens: [{ alimento_id: 'x14', quantidade: 2, unidade: 'dose' }, { alimento_id: 't3', quantidade: 100, unidade: 'g' }] },
      { id: 'r2', nome: 'R2', horario: null, itens: [{ alimento_id: 'x44', quantidade: 0, unidade: 'porção' }] },
    ];
    const colageno = proteinaColageno(refeicoes, mapa);
    expect(colageno).toBeCloseTo(18, 6);
    const t = proteinaTotal({ ptn_animal: 100, ptn_vegetal: 20.5 }, { peso_kg: 80, massa_magra_kg: 65 }, colageno);
    expect(t.g).toBeCloseTo(102.5, 6);
  });
});

describe('Proteína por refeição', () => {
  const r = (nome: string, ptn_animal: number, itens = 2) => ({ nome, ptn_animal, itens });
  it('conta as refeições no alvo (90% de 0,4 g/kg de massa magra) e reparte o excesso', () => {
    // Massa magra 72,5: alvo 29 g, corte 26,1 g, teto 39,9 g
    const d = distribuicaoProteina([r('R1', 37.3), r('R2', 86.2), r('R3', 5.2), r('R4', 13.3), r('R5', 2.2), r('Pós-treino', 0, 0)], 72.5);
    expect(d.alvo).toBeCloseTo(29, 6);
    expect(d.corte).toBeCloseTo(26.1, 6);
    expect(d.no_alvo).toBe(2);
    expect(d.com_itens).toBe(5);
    const c = d.concentracao!;
    expect(c.nome).toBe('R2');
    expect(c.fracao_dia).toBeCloseTo(86.2 / 144.2, 6);
    // Excesso 46,3 g: R5 recebe 26,8 (a que mais falta) e R3 o resto (19,5) → ~45 g
    expect(c.mover).toBe(45);
    expect(c.para).toEqual(['R3', 'R5']);
  });
  it('excesso maior que o que falta: move só até as outras chegarem ao alvo', () => {
    const d = distribuicaoProteina([r('R1', 100), r('R2', 20), r('R3', 40)], 72.5);
    // Excesso 60,1; só o R2 está abaixo (falta 9 até o alvo)
    expect(d.concentracao!.mover).toBe(10);
    expect(d.concentracao!.para).toEqual(['R2']);
  });
  it('sem refeição acima do teto ou sem quem receba: sem sugestão de mover', () => {
    expect(distribuicaoProteina([r('R1', 35), r('R2', 30), r('R3', 10)], 72.5).concentracao).toBeNull();
    expect(distribuicaoProteina([r('R1', 80), r('R2', 30)], 72.5).concentracao).toBeNull();
    expect(distribuicaoProteina([r('R1', 80), r('R2', 0, 0)], 72.5).concentracao).toBeNull();
    expect(distribuicaoProteina([], 72.5)).toMatchObject({ no_alvo: 0, com_itens: 0, concentracao: null });
  });
});

describe('Fechar a meta pelo macro principal', () => {
  const arroz = alimento({ id: 'arroz', carb: 28, prot: 2.5, gord: 0.2 });
  const patinho = alimento({ id: 'pat', prot: 36, gord: 7.3, animal: true });
  const azeite = alimento({ id: 'az', gord: 100, porcoes: [{ nome: 'colher de sopa', g: 8 }] });
  const ovo = alimento({ id: 'ovo', prot: 13, gord: 9, carb: 1, animal: true, porcoes: [{ nome: 'unidade', g: 50 }] });

  it('macro principal pelas kcal; proteína vegetal não tem meta', () => {
    expect(macroPrincipal(arroz)).toBe('carb');
    expect(macroPrincipal(patinho)).toBe('ptn_animal');
    expect(macroPrincipal(azeite)).toBe('gord');
    // Ovo tem mais kcal de gordura, mas é fonte de proteína animal
    expect(macroPrincipal(ovo)).toBe('ptn_animal');
    expect(macroPrincipal(alimento({ prot: 0.4, gord: 82, animal: true }))).toBe('gord');
    expect(macroPrincipal(alimento({ prot: 80 }))).toBeNull();
    expect(macroPrincipal(alimento({}))).toBeNull();
  });

  const metas = (kcal: number, ptn: number, gord: number): Metas => ({
    tmb: 0,
    dia_a_dia: 0,
    exercicio: 0,
    exercicio_planejado: 0,
    pela_aderencia: false,
    gasto_total: kcal,
    meta_kcal: kcal,
    ptn_animal_g: ptn,
    gord_g: gord,
  });

  it('carbo: a proteína vegetal do alimento também mexe na falta (o carbo fecha as kcal)', () => {
    const item = { alimento_id: 'arroz', quantidade: 300, unidade: 'g' };
    const m = metas(2500, 145, 95);
    const saldo = calcularSaldo(m, macrosDoItem(item, arroz));
    const f = fecharMacro(item, arroz, saldo)!;
    expect(f.macro).toBe('carb');
    expect(f.item.unidade).toBe('g');
    // Depois de fechar, a falta de carbo fica ~0 (arredondado ao grama)
    const depois = calcularSaldo(m, macrosDoItem(f.item, arroz));
    expect(Math.abs(depois.falta.carb)).toBeLessThan(0.3);
    expect(f.delta).toBe(f.gramas - 300);
  });

  it('proteína animal e gordura; reduz quando passou; some quando já está fechado', () => {
    const item = { alimento_id: 'pat', quantidade: 240, unidade: 'g' };
    const m = metas(2500, 145, 95);
    const plano = macrosDoItem(item, patinho);
    const f = fecharMacro(item, patinho, calcularSaldo(m, plano))!;
    expect(f.macro).toBe('ptn_animal');
    expect(f.gramas).toBe(Math.round(240 + (145 - 0.36 * 240) / 0.36));
    // Passou da meta: o botão reduz
    const muito = { alimento_id: 'pat', quantidade: 500, unidade: 'g' };
    expect(fecharMacro(muito, patinho, calcularSaldo(m, macrosDoItem(muito, patinho)))!.delta).toBeLessThan(0);
    // Já fechado (dentro de 1 g ou 2% da meta): nada a mostrar
    const certo = { alimento_id: 'pat', quantidade: Math.round(145 / 0.36), unidade: 'g' };
    expect(fecharMacro(certo, patinho, calcularSaldo(m, macrosDoItem(certo, patinho)))).toBeNull();
  });

  it('em porções arredonda de meia em meia e mantém a unidade', () => {
    const item = { alimento_id: 'ovo', quantidade: 2, unidade: 'unidade' };
    const m = metas(2500, 30, 95);
    const f = fecharMacro(item, ovo, calcularSaldo(m, macrosDoItem(item, ovo)))!;
    expect(f.item.unidade).toBe('unidade');
    expect(f.item.quantidade).toBe(4.5);
    const az = { alimento_id: 'az', quantidade: 1, unidade: 'colher de sopa' };
    const g = fecharMacro(az, azeite, calcularSaldo(metas(2500, 0, 30), somar([macrosDoItem(az, azeite)])))!;
    expect(g.macro).toBe('gord');
    expect(g.item.quantidade).toBe(4);
  });

  it('sem alimento ou com falta que pediria quantidade negativa: nada', () => {
    const item = { alimento_id: 'arroz', quantidade: 100, unidade: 'g' };
    expect(fecharMacro(item, undefined, calcularSaldo(metas(2500, 145, 95), macrosDoItem(item, arroz)))).toBeNull();
    // Carbo passou muito por outros alimentos: nem zerando o arroz fecha
    const saldo = calcularSaldo(metas(1000, 0, 0), { ptn_animal: 0, ptn_vegetal: 0, carb: 400, gord: 0, fibra: 0, kcal: 1600 });
    expect(fecharMacro(item, arroz, saldo)).toBeNull();
  });
});

describe('Opções na troca de alimento', () => {
  const patinho = alimento({ id: 'pat', prot: 35.9, gord: 7.3, animal: true });
  const frango = alimento({ id: 'fr', prot: 32, gord: 2.5, animal: true });
  const feijao = alimento({ id: 'fj', prot: 4.8, carb: 13.6, gord: 0.5 });

  it('mesmo peso e mesma proteína (240 g de patinho → frango)', () => {
    const o = opcoesTroca({ alimento_id: 'pat', quantidade: 240, unidade: 'g' }, patinho, frango);
    expect(o.mesmo_peso).toEqual({ alimento_id: 'fr', quantidade: 240, unidade: 'g' });
    expect(o.mesmo_macro!.macro).toBe('ptn_animal');
    expect(o.mesmo_macro!.item).toEqual({ alimento_id: 'fr', quantidade: Math.round((35.9 * 2.4) / 0.32), unidade: 'g' });
  });
  it('sem a segunda opção quando o novo não tem o macro (proteína vegetal) ou dá o mesmo peso', () => {
    expect(opcoesTroca({ alimento_id: 'pat', quantidade: 240, unidade: 'g' }, patinho, feijao).mesmo_macro).toBeNull();
    expect(opcoesTroca({ alimento_id: 'pat', quantidade: 240, unidade: 'g' }, patinho, { ...patinho, id: 'p2', prot: 36 }).mesmo_macro).toBeNull();
    expect(opcoesTroca({ alimento_id: 'x', quantidade: 240, unidade: 'g' }, undefined, frango).mesmo_macro).toBeNull();
  });
  it('mesmo carbo entre alimentos de carbo', () => {
    const arroz = alimento({ id: 'ar', carb: 28.1, prot: 2.5 });
    const batata = alimento({ id: 'bd', carb: 18.4, prot: 0.6 });
    const o = opcoesTroca({ alimento_id: 'ar', quantidade: 200, unidade: 'g' }, arroz, batata);
    expect(o.mesmo_macro!.macro).toBe('carb');
    expect(o.mesmo_macro!.item.quantidade).toBe(Math.round((28.1 * 2) / 0.184));
  });
});

describe('Ritmo estimado pelo déficit', () => {
  const tend = (gorda: number, magra: number): Tendencia => ({
    de: '2026-09-07',
    ate: '2026-10-05',
    medicoes: 5,
    gorda_semana: gorda,
    magra_semana: magra,
    peso_semana: gorda + magra,
    cintura_semana: -0.5,
    bf_semana: -0.3,
    deficit_dia: 500,
    ic95_dia: 100,
    ic95_semana: { gorda: 0.1, magra: 0.1, peso: 0.2, cintura: 0.2 },
  });
  it('Forbes sem tendência: massa gorda 22,9 kg → p ≈ 0,31, ρ ≈ 7.030 kcal/kg', () => {
    const f = fracaoMagraDaPerda(null, 22.9);
    expect(f.fonte).toBe('forbes');
    expect(f.p).toBeCloseTo(10.4 / 33.3, 6);
    expect(kcalPorKgPerdido(f.p)).toBeCloseTo(7026.4, 0);
    // −300 kcal/dia com 95,5 kg ≈ 0,31%/sem
    expect(ritmoEstimado(300, 95.5, f.p)).toBeCloseTo((300 * 7) / (kcalPorKgPerdido(f.p) * 95.5) * 100, 9);
    expect(ritmoEstimado(300, 95.5, f.p)).toBeCloseTo(0.312, 2);
  });
  it('pela tendência das medidas, limitado a 0–0,5', () => {
    expect(fracaoMagraDaPerda(tend(-0.6, -0.2), 22.9)).toEqual({ p: 0.25, fonte: 'tendencia' });
    expect(fracaoMagraDaPerda(tend(-0.6, 0.1), 22.9).p).toBe(0);
    expect(fracaoMagraDaPerda(tend(-0.1, -0.5), 22.9).p).toBe(0.5);
    // Peso parado ou subindo: volta para Forbes
    expect(fracaoMagraDaPerda(tend(0, 0), 22.9).fonte).toBe('forbes');
  });
  it('massa magra mantida: ρ = 9.400', () => {
    expect(kcalPorKgPerdido(0)).toBe(9400);
    expect(ritmoEstimado(940, 100, 0)).toBeCloseTo(0.7, 9);
  });
});

describe('"Segui o plano?" na Conferência', () => {
  const tend = (o: Partial<Tendencia> = {}): Tendencia => ({
    de: '2026-09-07',
    ate: '2026-10-05',
    medicoes: 5,
    gorda_semana: -0.5,
    magra_semana: 0,
    peso_semana: -0.5,
    cintura_semana: -0.5,
    bf_semana: -0.3,
    deficit_dia: 500,
    ic95_dia: 100,
    ic95_semana: { gorda: 0.1, magra: 0.1, peso: 0.2, cintura: 0.2 },
    ...o,
  });
  const dias = (sim: number, parcial: number, nao: number): RegistroDiario[] => {
    const v = [...Array(sim).fill('sim'), ...Array(parcial).fill('parcial'), ...Array(nao).fill('nao')] as ('sim' | 'parcial' | 'nao')[];
    return v.map((d, i) => ({ id: String(i), data: somarDias('2026-09-07', i), peso_kg: null, nausea: null, observacoes: null, dieta_seguida: d }));
  };

  it('janela da tendência até a véspera da última medição; "em parte" vale meio dia', () => {
    // 28 respondidos + um dia no dia da última medição (fica fora)
    const diario = [...dias(16, 4, 8), { id: 'x', data: '2026-10-05', peso_kg: null, nausea: null, observacoes: null, dieta_seguida: 'nao' as const }];
    const d = dietaNaTendencia(diario, tend());
    expect(d).toMatchObject({ sim: 16, parcial: 4, nao: 8, respondidos: 28, dias: 28 });
    expect(textoPlanoSeguido(d)).toBe('Plano seguido: 18 de 28 dias (64%)');
    expect(textoPlanoSeguido(dietaNaTendencia(dias(17, 1, 10), tend()))).toBe('Plano seguido: 17,5 de 28 dias (63%)');
    expect(textoPlanoSeguido(dietaNaTendencia([], tend()))).toBe('Plano seguido: nenhum dia respondido');
  });

  it('conselho: responder → seguir o plano → reduzir → gasto outro → impreciso → bate', () => {
    const c = (t: Tendencia, diario: RegistroDiario[], deficitPlano: number | null = 500, ajuste: number | null = -500) =>
      conselhoConferencia(t, 95, dietaNaTendencia(diario, t), deficitPlano, ajuste).tipo;
    expect(c(tend(), dias(20, 0, 0))).toBe('responder');
    expect(c(tend(), dias(16, 4, 8))).toBe('seguir_plano');
    // Seguiu bem, perda de 1,2 kg/sem (1,3%) com massa magra caindo
    expect(c(tend({ peso_semana: -1.2, magra_semana: -0.3 }), dias(28, 0, 0))).toBe('reduzir');
    // Sem déficit (manutenção/superávit): a regra de reduzir o déficit não vale
    expect(c(tend({ peso_semana: -1.2, magra_semana: -0.3 }), dias(28, 0, 0), 0, 0)).toBe('gasto_outro');
    // Plano prevê 300, medidas 500 ± 100: fora da faixa
    expect(c(tend(), dias(26, 2, 0), 300)).toBe('gasto_outro');
    expect(c(tend({ ic95_dia: 400 }), dias(28, 0, 0), 300)).toBe('impreciso');
    expect(c(tend(), dias(28, 0, 0), 450)).toBe('bate');
  });
});
