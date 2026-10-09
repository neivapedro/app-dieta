import { describe, expect, it } from 'vitest';
import linhas from '../dados/alimentos.json';
import {
  buscarAlimentos,
  calcularMetas,
  calcularSaldo,
  configPadrao,
  exercicioMedioDia,
  idade,
  lerAlimentos,
  macrosDoItem,
  tmbHarris,
  tmbKatch,
  tmbMifflin,
  itemPadrao,
  trocarAlimento,
  exercicioReal,
  metaFibra,
  type LinhaAlimento,
} from './dieta';

const alimentos = lerAlimentos(linhas as LinhaAlimento[]);
const mapa = new Map(alimentos.map((a) => [a.id, a]));

describe('Taxa metabólica basal', () => {
  it('Katch-McArdle pela massa magra', () => {
    expect(tmbKatch(72.6)).toBeCloseTo(1938.16, 2);
  });
  it('Mifflin-St Jeor', () => {
    expect(tmbMifflin('Masculino', 95.5, 181, 31)).toBeCloseTo(1936.25, 2);
    expect(tmbMifflin('Feminino', 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });
  it('Harris-Benedict da planilha de dieta (TMB!C7 = 2.508,246 com FA 1,3)', () => {
    expect(tmbHarris('Masculino', 85, 181, 31) * 1.3).toBeCloseTo(2508.246, 3);
  });
  it('idade pela data de nascimento', () => {
    expect(idade('1995-03-10', '2026-10-09')).toBe(31);
    expect(idade('1995-10-10', '2026-10-09')).toBe(30);
    expect(idade('1995-10-09', '2026-10-09')).toBe(31);
    expect(idade(null, '2026-10-09')).toBeNull();
  });
});

describe('Gasto total e metas', () => {
  const config = {
    ...configPadrao(),
    fator_atividade: 1.2,
    ajuste_kcal: -300,
    atividades: [
      { nome: 'Musculação', kcal: 350, vezes_semana: 7 },
      { nome: 'Bike', kcal: 300, vezes_semana: 5 },
      { nome: 'Corrida', kcal: 440, vezes_semana: 2 },
    ],
  };
  it('exercício entra pela média da semana', () => {
    expect(exercicioMedioDia(config.atividades)).toBeCloseTo((350 * 7 + 300 * 5 + 440 * 2) / 7, 6);
  });
  it('meta = TMB × fator + exercício + ajuste; proteína pela massa magra, gordura pelo peso', () => {
    const m = calcularMetas(config, { peso_kg: 95.5, massa_magra_kg: 72.6 });
    expect(m.tmb).toBeCloseTo(1938.16, 2);
    expect(m.gasto_total).toBeCloseTo(1938.16 * 1.2 + 690, 2);
    expect(m.meta_kcal).toBeCloseTo(m.gasto_total - 300, 6);
    expect(m.ptn_animal_g).toBeCloseTo(145.2, 6);
    expect(m.gord_g).toBeCloseTo(95.5, 6);
  });
  it('carboidrato fecha a conta (exemplo de 2.100 kcal)', () => {
    const metas = { tmb: 0, dia_a_dia: 0, exercicio: 0, exercicio_planejado: 0, pela_aderencia: false, gasto_total: 2400, meta_kcal: 2100, ptn_animal_g: 145.2, gord_g: 95.5 };
    const vazio = { ptn_animal: 0, ptn_vegetal: 0, carb: 0, gord: 0, fibra: 0, kcal: 0 };
    expect(calcularSaldo(metas, vazio).meta.carb).toBeCloseTo((2100 - 145.2 * 4 - 95.5 * 9) / 4, 6);
    // proteína vegetal planejada (arroz, feijão…) consome kcal do carboidrato
    const comVegetal = calcularSaldo(metas, { ...vazio, ptn_vegetal: 10, kcal: 40 });
    expect(comVegetal.meta.carb).toBeCloseTo((2100 - 145.2 * 4 - 95.5 * 9) / 4 - 10, 6);
    expect(comVegetal.falta.kcal).toBe(2060);
  });
});

describe('Montagem do plano', () => {
  it('arroz, feijão e carne moída entram em gramas; ovo e fatia em unidade', () => {
    expect(itemPadrao(mapa.get('t3')!)).toEqual({ alimento_id: 't3', quantidade: 100, unidade: 'g' });
    expect(itemPadrao(mapa.get('t561')!).unidade).toBe('g');
    expect(itemPadrao(mapa.get('t488')!)).toEqual({ alimento_id: 't488', quantidade: 1, unidade: 'unidade' });
    expect(itemPadrao(mapa.get('x01')!).unidade).toBe('dose');
  });
  it('trocar o alimento mantém o peso', () => {
    const arroz = { alimento_id: 't3', quantidade: 200, unidade: 'g' };
    expect(trocarAlimento(arroz, mapa.get('t3'), mapa.get('t1')!)).toEqual({ alimento_id: 't1', quantidade: 200, unidade: 'g' });
    const ovos = { alimento_id: 't488', quantidade: 2, unidade: 'unidade' };
    expect(trocarAlimento(ovos, mapa.get('t488'), mapa.get('t490')!)).toEqual({ alimento_id: 't490', quantidade: 2, unidade: 'unidade' });
    // porção que o novo alimento não tem vira gramas
    expect(trocarAlimento(ovos, mapa.get('t488'), mapa.get('t410')!)).toEqual({ alimento_id: 't410', quantidade: 100, unidade: 'g' });
  });
  it('exercício pela aderência real e fibra de referência', () => {
    const at = [
      { nome: 'Musculação', kcal: 350, vezes_semana: 7 },
      { nome: 'Bike', kcal: 300, vezes_semana: 5 },
    ];
    expect(exercicioReal(at, { treino: 1, cardio: 0.5, dias: 28 })).toBeCloseTo((350 * 7 + 300 * 5 * 0.5) / 7, 6);
    expect(metaFibra(2500)).toBe(35);
  });
  it('busca põe os do dia a dia primeiro e o pronto antes do cru', () => {
    expect(buscarAlimentos(alimentos, 'frango')[0].id).toBe('t410');
    const brocolis = buscarAlimentos(alimentos, 'brocolis').map((a) => a.nome);
    expect(brocolis[0]).not.toMatch(/cru/);
  });
});

describe('Banco de alimentos', () => {
  it('macros pela porção caseira e kcal por 4/4/9', () => {
    const ovos = macrosDoItem({ alimento_id: 't488', quantidade: 2, unidade: 'unidade' }, mapa.get('t488'));
    expect(ovos.ptn_animal).toBeCloseTo(13.3, 6); // 100 g de ovo cozido
    expect(ovos.ptn_vegetal).toBe(0);
    expect(ovos.kcal).toBeCloseTo(13.3 * 4 + 0.6 * 4 + 9.5 * 9, 6);
    const arroz = macrosDoItem({ alimento_id: 't3', quantidade: 200, unidade: 'g' }, mapa.get('t3'));
    expect(arroz.ptn_vegetal).toBeCloseTo(5, 6);
    expect(arroz.carb).toBeCloseTo(56.2, 6);
  });
  it('busca sem acento, em qualquer ordem e por apelido', () => {
    expect(buscarAlimentos(alimentos, 'frango grelhado peito')[0].id).toBe('t410');
    expect(buscarAlimentos(alimentos, 'grao de bico')[0].id).toBe('x65');
    expect(buscarAlimentos(alimentos, 'codorna').length).toBe(1);
    expect(buscarAlimentos(alimentos, 'mussarela').map((a) => a.id)).toContain('t463');
    expect(buscarAlimentos(alimentos, 'feijao carioca cozido')[0].id).toBe('t561');
    expect(buscarAlimentos(alimentos, 'whey growth')[0].id).toBe('x01');
  });
  it('só alimentos prontos na busca (cru fica oculto, exceto o que se come cru)', () => {
    const patinho = buscarAlimentos(alimentos, 'patinho');
    expect(patinho.map((a) => a.id)).toEqual(expect.arrayContaining(['t377', 'x49']));
    expect(patinho.some((a) => /\bcru/.test(a.nome))).toBe(false);
    expect(buscarAlimentos(alimentos, 'arroz').some((a) => a.id === 't4')).toBe(false);
    expect(buscarAlimentos(alimentos, 'feijao preto')[0].id).toBe('t567');
    expect(buscarAlimentos(alimentos, 'salmao').map((a) => a.id)).toContain('t316'); // sashimi
    expect(buscarAlimentos(alimentos, 'alface').length).toBeGreaterThan(0); // salada continua crua
    // um plano antigo com item cru ainda é calculado
    expect(mapa.get('t376')?.oculto).toBe(true);
    expect(buscarAlimentos(alimentos, 'carne moida').map((a) => a.id)).toEqual(expect.arrayContaining(['x49', 't326']));
  });

  it('todo alimento tem macros válidos', () => {
    expect(alimentos.length).toBeGreaterThan(600);
    for (const a of alimentos) {
      expect(a.prot + a.carb + a.gord).toBeLessThanOrEqual(101);
      expect(Math.min(a.prot, a.carb, a.gord)).toBeGreaterThanOrEqual(0);
    }
  });
});
