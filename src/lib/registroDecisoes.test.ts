import { describe, expect, it } from 'vitest';
import { configPadrao } from './dieta';
import {
  alteracoesDasDecisoesFase,
  compararDieta,
  compararFases,
  compararMetas,
  decisoesPorDia,
  descreverRegistro,
  marcosDasDecisoes,
  mesclarAlteracoes,
  mudancasMisturadas,
} from './registroDecisoes';
import type { DecisaoFase, Fase, RegistroDecisao } from './tipos';

const fase = (semanas: number, dose_mg: number): Fase => ({ nome: 'F', semanas, dose_mg, objetivo: '' });
let n = 0;
const novoId = () => `id${++n}`;

describe('Registro de decisões: o que mudou', () => {
  it('Dieta: déficit, fator, g/kg e exercício; o resto não conta', () => {
    const a = configPadrao();
    const b = { ...a, ajuste_kcal: -450, fator_atividade: 1.3, ptn_gkg: 2.2, atividades: [{ nome: 'Musculação', kcal: 300, vezes_semana: 5 }], pos_degrau_medicao: '2026-10-12' };
    const alt = compararDieta(a, b);
    expect(alt.map((x) => x.campo)).toEqual(['Déficit/superávit', 'Fator de atividade', 'Proteína animal', 'Exercício da meta']);
    expect(alt[0]).toMatchObject({ tipo: 'dieta', de: '−300 kcal', para: '−450 kcal' });
    expect(alt[1]).toMatchObject({ de: '1,2', para: '1,3' });
    expect(alt[3]).toMatchObject({ de: 'nenhum', para: '1.500 kcal/sem' });
    expect(compararDieta(a, { ...a })).toEqual([]);
  });

  it('Plano: dose e semanas de cada fase, fase nova e removida', () => {
    const antes = [fase(4, 1.25), fase(4, 1.5)];
    expect(compararFases(antes, [fase(5, 1.25), fase(4, 1.75), fase(4, 2)]).map(descreverRegistro)).toEqual([
      'Fase 1: semanas: 4 sem. → 5 sem.',
      'Fase 2: dose: 1,50 mg → 1,75 mg',
      'Fase 3: 4 sem. × 2,00 mg',
    ]);
    expect(compararFases(antes, [fase(4, 1.25)]).map(descreverRegistro)).toEqual(['Fase 2: 4 sem. × 1,50 mg → removida']);
    // Só o nome mudou: não é decisão
    expect(compararFases(antes, [{ ...antes[0], nome: 'Outra' }, antes[1]])).toEqual([]);
  });

  it('Metas: cada meta que mudou, inclusive a primeira vez', () => {
    const depois = { pescoco_cm: null, cintura_cm: 88, quadril_cm: null, peso_kg: 85, bf: 15 };
    expect(compararMetas(null, depois).map((a) => [a.campo, a.de, a.para])).toEqual([
      ['Meta de cintura', null, '88,0 cm'],
      ['Meta de peso', null, '85,0 kg'],
      ['Meta de % de gordura', null, '15,0%'],
    ]);
    expect(compararMetas(depois, { ...depois, bf: 14 })).toHaveLength(1);
  });

  it('Decisões do fim de fase: subir, repetir, confirmar e pós-remédio; anotação não; removida vira ref', () => {
    const base = { data: '2026-11-02', apos_aplicacao: 4, dose_mg: 1.25, fase_indice: 1 };
    const subir: DecisaoFase = { id: 's', escolha: 'subir', dose_nova_mg: 1.5, ...base };
    const repetir: DecisaoFase = { id: 'r', escolha: 'repetir', semanas: 4, ...base, fase_indice: 0 };
    const anot: DecisaoFase = { id: 'a', escolha: 'anotacao', texto: 'x', ...base };
    const fases = [fase(8, 1.25), fase(4, 1.5)];
    const { novas, removidas } = alteracoesDasDecisoesFase([anot], [anot, subir, repetir], fases);
    expect(novas.map((x) => [x.tipo, descreverRegistro(x), x.ref])).toEqual([
      ['dose', 'Dose: 1,25 mg → 1,50 mg', 's'],
      ['plano', 'Repetir fase 1: 4 sem. → 8 sem.', 'r'],
    ]);
    expect(removidas).toEqual([]);
    expect(alteracoesDasDecisoesFase([subir], [], fases).removidas).toEqual(['s']);
  });
});

describe('Registro de decisões: mescla do mesmo dia', () => {
  const hoje = '2026-10-12';
  it('mesmo campo no mesmo dia vira uma linha só (primeiro "de", último "para")', () => {
    let lista: RegistroDecisao[] = [];
    for (const v of ['−4 kcal', '−45 kcal', '−450 kcal']) {
      lista = mesclarAlteracoes(lista, [{ tipo: 'dieta', campo: 'Déficit/superávit', de: v === '−4 kcal' ? '−300 kcal' : 'x', para: v }], hoje, novoId).lista;
    }
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ de: '−300 kcal', para: '−450 kcal', data: hoje });
  });

  it('voltou ao valor de antes no mesmo dia: a linha some (sem motivo)', () => {
    const m1 = mesclarAlteracoes([], [{ tipo: 'dieta', campo: 'Fator de atividade', de: '1,2', para: '1,3' }], hoje, novoId);
    const m2 = mesclarAlteracoes(m1.lista, [{ tipo: 'dieta', campo: 'Fator de atividade', de: '1,3', para: '1,2' }], hoje, novoId);
    expect(m2.lista).toEqual([]);
    expect(m2.excluir).toHaveLength(1);
    // Com motivo escrito, fica
    const comMotivo = [{ ...m1.lista[0], motivo: 'teste' }];
    expect(mesclarAlteracoes(comMotivo, [{ tipo: 'dieta', campo: 'Fator de atividade', de: '1,3', para: '1,2' }], hoje, novoId).lista).toHaveLength(1);
  });

  it('em outro dia, vira uma linha nova; decisão desfeita apaga a linha dela', () => {
    const m1 = mesclarAlteracoes([], [{ tipo: 'dieta', campo: 'Gordura', de: '1,0 g/kg', para: '0,8 g/kg' }], '2026-10-05', novoId);
    const m2 = mesclarAlteracoes(m1.lista, [{ tipo: 'dieta', campo: 'Gordura', de: '0,8 g/kg', para: '1,0 g/kg' }], hoje, novoId);
    expect(m2.lista).toHaveLength(2);
    const m3 = mesclarAlteracoes(m2.lista, [{ tipo: 'dose', campo: 'Dose', de: '1,25 mg', para: '1,50 mg', ref: 's' }], hoje, novoId);
    expect(m3.salvar[0].ref).toBe('s');
    const m4 = mesclarAlteracoes(m3.lista, [], hoje, novoId, ['s']);
    expect(m4.lista).toHaveLength(2);
    expect(m4.excluir.map((r) => r.ref)).toEqual(['s']);
  });
});

describe('Registro de decisões: leitura', () => {
  const r = (id: string, data: string, tipo: RegistroDecisao['tipo'], campo = 'c'): RegistroDecisao => ({ id, data, tipo, campo, de: '1', para: '2' });
  it('agrupa por dia (um marcador por dia), do mais recente ao mais antigo', () => {
    const dias = decisoesPorDia([r('a', '2026-10-05', 'dieta'), r('b', '2026-10-12', 'dose'), r('c', '2026-10-05', 'metas')]);
    expect(dias.map((d) => [d.data, d.registros.length])).toEqual([
      ['2026-10-12', 1],
      ['2026-10-05', 2],
    ]);
    expect(marcosDasDecisoes([r('a', '2026-10-05', 'dieta', 'X'), r('c', '2026-10-05', 'metas', 'Y')])).toEqual([{ data: '2026-10-05', texto: 'X: 1 → 2; Y: 1 → 2' }]);
  });

  it('avisa quando dose e dieta mudaram com menos de 7 dias', () => {
    expect(mudancasMisturadas([r('a', '2026-10-05', 'dose'), r('b', '2026-10-09', 'dieta')])).toEqual([{ dose: '2026-10-05', dieta: '2026-10-09' }]);
    expect(mudancasMisturadas([r('a', '2026-10-05', 'dose'), r('b', '2026-10-12', 'dieta')])).toEqual([]);
  });
});
