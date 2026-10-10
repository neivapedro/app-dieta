import { describe, expect, it } from 'vitest';
import { calcularCiclo, cicloPadrao } from './ciclo';
import type { Composicao } from './gordura';
import { avisoReganho, decisaoPosRemedio, fasePos, linhasBalanco, periodoTreinoPos, subidasSeguidas } from './projeto';
import type { Aplicacao, Ciclo, DecisaoFase } from './tipos';
import { periodoProjeto } from './treino';

const comp = (data: string, cintura: number, peso: number, bf = 20): Composicao => ({
  data,
  peso_kg: peso,
  bf,
  massa_gorda_kg: (peso * bf) / 100,
  massa_magra_kg: peso * (1 - bf / 100),
  cintura_cm: cintura,
  pescoco_cm: 41,
  quadril_cm: 100,
});

const pos = (bloco_inicio: string, extra: Partial<DecisaoFase> = {}): DecisaoFase => ({
  id: 'p',
  data: '2027-03-01',
  apos_aplicacao: 30,
  dose_mg: 2.5,
  fase_indice: null,
  escolha: 'pos_remedio',
  bloco_inicio,
  ...extra,
});

describe('Fase pós-remédio', () => {
  it('vale a decisão mais recente, e uma aplicação depois do início a cancela', () => {
    const ciclo = { decisoes: [pos('2027-02-20')] };
    expect(decisaoPosRemedio(ciclo, [{ data: '2027-02-20' }])?.bloco_inicio).toBe('2027-02-20');
    expect(decisaoPosRemedio(ciclo, [{ data: '2027-02-27' }])).toBeNull();
    expect(decisaoPosRemedio({ decisoes: [] }, [])).toBeNull();
    expect(decisaoPosRemedio(null, [])).toBeNull();
  });

  it('52 semanas a partir da última dose; semanas 0 a 5 são a saída do remédio', () => {
    expect(fasePos('2027-02-20', '2027-02-19').semana).toBeNull();
    const f0 = fasePos('2027-02-20', '2027-02-20');
    expect(f0).toMatchObject({ semana: 0, saida: true, encerrada: false, fim: '2028-02-18' });
    expect(fasePos('2027-02-20', '2027-04-02').semana).toBe(5);
    expect(fasePos('2027-02-20', '2027-04-02').saida).toBe(true);
    expect(fasePos('2027-02-20', '2027-04-03')).toMatchObject({ semana: 6, saida: false });
    expect(fasePos('2027-02-20', '2028-02-19').encerrada).toBe(true);
  });

  it('o placar de treino pós começa no dia seguinte ao fim do placar do projeto', () => {
    const c: Ciclo = { id: 'c', ...cicloPadrao('2026-10-01') };
    const ap: Aplicacao[] = ['2026-10-01', '2026-10-08'].map((d) => ({ id: d, ciclo_id: 'c', data: d, dose_mg: 1.25, local: null, observacoes: null }));
    const r = calcularCiclo(c, ap, [], '2026-10-20');
    // Sem fase pós, o projeto vai até 7 dias depois da última dose prevista
    expect(periodoProjeto(c, r).fim > '2027-01-01').toBe(true);
    // Com a fase pós iniciada (parou na 2ª dose), o projeto acaba 7 dias depois dela
    const proj = periodoProjeto(c, r, '2026-10-08');
    expect(proj).toEqual({ inicio: '2026-10-01', fim: '2026-10-15' });
    expect(periodoTreinoPos('2026-10-08', proj.fim)).toEqual({ inicio: '2026-10-16', fim: '2027-10-06' });
    // Fase iniciada dias depois do fim do projeto: o placar começa no dia em que foi iniciada
    expect(periodoTreinoPos('2026-10-08', proj.fim, '2026-10-20')).toEqual({ inicio: '2026-10-20', fim: '2027-10-06' });
    expect(periodoTreinoPos('2026-10-08', proj.fim, '2026-10-10')).toEqual({ inicio: '2026-10-16', fim: '2027-10-06' });
  });

  it('subidas seguidas no fim da série', () => {
    expect(subidasSeguidas([90, 89, 89.5, 90, 91])).toBe(3);
    expect(subidasSeguidas([90, 91, 91])).toBe(0);
    expect(subidasSeguidas([90])).toBe(0);
  });

  it('aviso quando a cintura ou o peso sobem 3 medições seguidas depois da última dose', () => {
    const inicio = '2027-02-20';
    const lista = [comp('2027-02-15', 88, 88), comp('2027-02-22', 88.5, 87.8), comp('2027-03-01', 89, 87.6), comp('2027-03-08', 89.4, 87.5)];
    const a = avisoReganho(lista, inicio)!;
    expect(a.cintura).toBe(3);
    expect(a.peso).toBe(0);
    expect(a.texto).toContain('a cintura subiu 3');
    expect(a.texto).not.toContain('o peso');
    // Só duas subidas: sem aviso
    expect(avisoReganho(lista.slice(0, 3), inicio)).toBeNull();
    // A medição de referência é a última até a última dose (as anteriores não entram)
    const comAntigas = [comp('2027-01-01', 80, 80), ...lista.slice(0, 3)];
    expect(avisoReganho(comAntigas, inicio)).toBeNull();
    // Medição atípica (inchado, viagem) não conta como subida
    const comAtipica = [...lista.slice(0, 3), { ...comp('2027-03-08', 92, 87.5), atipica: true }];
    expect(avisoReganho(comAtipica, inicio)).toBeNull();
  });

  it('o aviso é só informativo: sem sugestão de mudar a meta', () => {
    const lista = [comp('2027-02-15', 88, 88), comp('2027-02-22', 88.5, 88.2), comp('2027-03-01', 89, 88.4), comp('2027-03-08', 89.4, 88.6)];
    const a = avisoReganho(lista, '2027-02-20')!;
    expect(a.texto).toContain('a cintura subiu 3 e o peso subiu 3');
    expect(a.texto).not.toMatch(/déficit|revise|reduz/i);
  });
});

describe('Balanço do projeto', () => {
  const ini = comp('2026-10-05', 100, 100, 25);
  const fim = comp('2027-02-15', 90, 92, 18);

  it('medidas antes do peso, metas atingidas e quanto faltou', () => {
    const l = linhasBalanco(ini, fim, { cintura_cm: 88, pescoco_cm: null, quadril_cm: null, peso_kg: 90, bf: 18 }, 'Masculino');
    expect(l.map((x) => x.nome)).toEqual(['Cintura', '% de gordura', 'Massa gorda', 'Massa magra', 'Peso']);
    const cintura = l[0];
    expect(cintura).toMatchObject({ inicio: 100, final: 90, meta: 88, atingida: false });
    expect(cintura.variacao).toBeCloseTo(-10, 6);
    expect(cintura.faltou).toBeCloseTo(2, 6);
    expect(l[1]).toMatchObject({ atingida: true, faltou: null });
    // Massa magra: maior é melhor (meta 73,8 kg; final 75,44 kg)
    expect(l[3].menorMelhor).toBe(false);
    expect(l[3].atingida).toBe(true);
    expect(l[4]).toMatchObject({ atingida: false });
    expect(l[4].faltou).toBeCloseTo(2, 6);
  });

  it('sem metas (conta sem Treino) só mostra início e final; feminino inclui o quadril', () => {
    const l = linhasBalanco(ini, fim, null, 'Feminino');
    expect(l.map((x) => x.nome)).toEqual(['Cintura', 'Quadril', '% de gordura', 'Massa gorda', 'Massa magra', 'Peso']);
    expect(l.every((x) => x.meta === null && x.atingida === null)).toBe(true);
  });

  it('pescoço só com meta para ele; sem medição final, sem variação', () => {
    const l = linhasBalanco(ini, null, { cintura_cm: null, pescoco_cm: 40, quadril_cm: null, peso_kg: null, bf: null }, 'Masculino');
    expect(l.map((x) => x.nome)).toContain('Pescoço');
    expect(l[0].variacao).toBeNull();
    expect(l[0].atingida).toBeNull();
  });
});
