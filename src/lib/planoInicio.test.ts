import { describe, expect, it } from 'vitest';
import { pluralPorcao, proximaRefeicao, resumoPlano, textoItemPlano, ZERO, type Alimento, type Refeicao, type Saldo } from './dieta';

const ovo: Alimento = {
  id: 'ovo',
  nome: 'Ovo, de galinha, inteiro, cozido',
  grupo: 'Ovos',
  prot: 13,
  carb: 0.6,
  gord: 9.5,
  fibra: 0,
  animal: true,
  porcoes: [{ nome: 'unidade', g: 50 }],
  fonte: 'TACO',
  busca: 'ovo',
  oculto: false,
};

const ref = (nome: string, horario: string | null, comItens = true): Refeicao => ({
  id: nome,
  nome,
  horario,
  itens: comItens ? [{ alimento_id: 'ovo', quantidade: 1, unidade: 'unidade' }] : [],
});

const h = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);

describe('Próxima refeição no Início', () => {
  const plano = [ref('Café', '07:00'), ref('Almoço', '12:00'), ref('Lanche', null, false), ref('Jantar', '19:30'), ref('Ceia', null)];
  it('pela hora, até 30 min depois de passar', () => {
    expect(proximaRefeicao(plano, h('06:00'))?.nome).toBe('Café');
    expect(proximaRefeicao(plano, h('07:25'))?.nome).toBe('Café');
    expect(proximaRefeicao(plano, h('07:40'))?.nome).toBe('Almoço');
  });
  it('depois da última com horário vem a ceia (sem horário, depois dela na lista)', () => {
    expect(proximaRefeicao(plano, h('21:00'))?.nome).toBe('Ceia');
    expect(proximaRefeicao(plano.slice(0, 4), h('21:00'))).toBeNull();
  });
  it('sem horários: a primeira com alimentos; sem alimentos: nada', () => {
    expect(proximaRefeicao([ref('A', null, false), ref('B', null)], h('10:00'))?.nome).toBe('B');
    expect(proximaRefeicao([ref('A', null, false)], h('10:00'))).toBeNull();
  });
});

describe('Itens na unidade do plano', () => {
  it('plural da porção', () => {
    expect(pluralPorcao('unidade')).toBe('unidades');
    expect(pluralPorcao('colher de sopa')).toBe('colheres de sopa');
    expect(pluralPorcao('porção')).toBe('porções');
    expect(pluralPorcao('filé')).toBe('filés');
    expect(pluralPorcao('2 ovos')).toBe('2 ovos');
    expect(pluralPorcao('colher de sopa cheia')).toBe('colheres de sopa cheias');
    expect(pluralPorcao('unidade média')).toBe('unidades médias');
    expect(pluralPorcao('lata drenada')).toBe('latas drenadas');
    expect(pluralPorcao('colher de sopa (ralado)')).toBe('colheres de sopa (ralado)');
    expect(pluralPorcao('unidade (150 g)')).toBe('unidades (150 g)');
  });
  it('nome completo e unidade do plano', () => {
    expect(textoItemPlano({ alimento_id: 'ovo', quantidade: 2, unidade: 'unidade' }, ovo)).toBe('Ovo, de galinha, inteiro, cozido · 2 unidades');
    expect(textoItemPlano({ alimento_id: 'ovo', quantidade: 1, unidade: 'unidade' }, ovo)).toBe('Ovo, de galinha, inteiro, cozido · 1 unidade');
    expect(textoItemPlano({ alimento_id: 'ovo', quantidade: 1.5, unidade: 'unidade' }, ovo)).toBe('Ovo, de galinha, inteiro, cozido · 1,5 unidades');
    expect(textoItemPlano({ alimento_id: 'ovo', quantidade: 120, unidade: 'g' }, ovo)).toBe('Ovo, de galinha, inteiro, cozido · 120 g');
    // Porção que não existe mais no banco: mostra os gramas
    expect(textoItemPlano({ alimento_id: 'ovo', quantidade: 80, unidade: 'fatia' }, ovo)).toBe('Ovo, de galinha, inteiro, cozido · 80 g');
  });
});

describe('Plano × meta no Início', () => {
  const saldo = (plano: Partial<typeof ZERO>, meta = { ptn_animal: 180, carb: 300, gord: 90, kcal: 2730 }): Saldo => {
    const p = { ...ZERO, ...plano };
    return {
      meta,
      plano: p,
      falta: { ptn_animal: meta.ptn_animal - p.ptn_animal, carb: meta.carb - p.carb, gord: meta.gord - p.gord, kcal: meta.kcal - p.kcal },
    };
  };
  it('plano fechado dentro das tolerâncias da Dieta', () => {
    const r = resumoPlano(saldo({ ptn_animal: 179.5, carb: 302, gord: 90, kcal: 2735 }));
    expect(r.fechado).toBe(true);
    expect(r.faltam).toEqual([]);
  });
  it('falta e passou, por macro', () => {
    const r = resumoPlano(saldo({ ptn_animal: 180, carb: 196, gord: 48, kcal: 1851 }));
    expect(r.fechado).toBe(false);
    expect(r.kcal_plano).toBe(1851);
    expect(r.faltam).toEqual([
      { nome: 'Carb', g: 104 },
      { nome: 'Gord', g: 42 },
    ]);
    const s = resumoPlano(saldo({ ptn_animal: 200, carb: 300, gord: 90, kcal: 2810 }));
    expect(s.passam).toEqual([{ nome: 'Ptn A', g: 20 }]);
  });
});
