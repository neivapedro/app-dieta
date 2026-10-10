import { describe, expect, it } from 'vitest';
import { calcularIndiceForca, chaveExercicio, EXERCICIOS_PADRAO, exerciciosDoPerfil, ultimoDoExercicio, umRmEpley } from './forca';
import type { RegistroForca } from './tipos';

let n = 0;
const reg = (data: string, exercicio: string, carga_kg: number, reps: number, rir: number | null = 1): RegistroForca => ({
  id: `r${++n}`,
  data,
  exercicio,
  carga_kg,
  reps,
  rir,
});

// Segundas-feiras seguidas
const SEG = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];

describe('1RM estimado (Epley)', () => {
  it('carga × (1 + reps/30), só até 10 repetições', () => {
    expect(umRmEpley(80, 8)).toBeCloseTo(101.33, 2);
    expect(umRmEpley(80, 6)).toBe(96);
    expect(umRmEpley(100, 1)).toBeCloseTo(103.33, 2);
    expect(umRmEpley(60, 10)).toBe(80);
    expect(umRmEpley(60, 11)).toBeNull();
    expect(umRmEpley(0, 5)).toBeNull();
    expect(umRmEpley(50, 2.5)).toBeNull();
  });
});

describe('Lista de exercícios', () => {
  it('usa a padrão quando o perfil não tem lista', () => {
    expect(exerciciosDoPerfil(null)).toEqual(EXERCICIOS_PADRAO);
    expect(exerciciosDoPerfil(['  ', ''])).toEqual(EXERCICIOS_PADRAO);
    expect(exerciciosDoPerfil([' Supino inclinado ', 'Terra'])).toEqual(['Supino inclinado', 'Terra']);
  });
  it('nome comparável ignora maiúsculas, acentos e espaços', () => {
    expect(chaveExercicio('  Desenvolvimento  Máquina ')).toBe(chaveExercicio('desenvolvimento maquina'));
  });
});

describe('Índice de força', () => {
  it('referência = média das 2 primeiras semanas; índice = média das variações', () => {
    const r = [
      reg(SEG[0], 'Supino', 80, 8),
      reg(SEG[0], 'Remada', 70, 8),
      reg(SEG[1], 'Supino', 80, 8),
      reg(SEG[1], 'Remada', 70, 8),
      reg(SEG[2], 'Supino', 82.5, 8), // +3,1%
      reg(SEG[2], 'Remada', 70, 8), // 0%
    ];
    const i = calcularIndiceForca(r);
    expect(i.semanas).toHaveLength(3);
    expect(i.referencias.get('supino')).toBeCloseTo(101.33, 2);
    expect(i.semanas[0].indice).toBeCloseTo(0, 6);
    expect(i.semanas[2].indice).toBeCloseTo((82.5 / 80 - 1) / 2, 6);
    // Suavizado = média com a leitura anterior
    expect(i.semanas[2].suavizado).toBeCloseTo((82.5 / 80 - 1) / 4, 6);
    expect(i.nivel).toBeNull();
  });

  it('acima de 10 repetições fica fora do índice (só a carga)', () => {
    const i = calcularIndiceForca([reg(SEG[0], 'Supino', 80, 8), reg(SEG[0], 'Remada', 50, 15)]);
    expect(i.semanas[0].exercicios.find((e) => e.exercicio === 'Remada')!.e1rm).toBeNull();
    expect(i.referencias.has('remada')).toBe(false);
    expect(i.semanas[0].indice).toBeCloseTo(0, 6);
  });

  it('na mesma semana vale o registro mais recente do exercício', () => {
    const i = calcularIndiceForca([reg('2026-10-12', 'Supino', 80, 8), reg('2026-10-15', 'supino', 85, 8)]);
    expect(i.semanas).toHaveLength(1);
    expect(i.semanas[0].exercicios).toHaveLength(1);
    expect(i.semanas[0].exercicios[0].registro.carga_kg).toBe(85);
  });

  it('queda de 5% em 2 leituras seguidas = atenção; de 10% = alerta', () => {
    const base = [reg(SEG[0], 'Supino', 100, 5), reg(SEG[1], 'Supino', 100, 5)];
    // −6% e −6%: suavizado −3% e −6% → só 1 leitura abaixo de −5%
    const atencao1 = calcularIndiceForca([...base, reg(SEG[2], 'Supino', 94, 5), reg(SEG[3], 'Supino', 94, 5)]);
    expect(atencao1.nivel).toBeNull();
    const atencao = calcularIndiceForca([...base, reg(SEG[2], 'Supino', 94, 5), reg(SEG[3], 'Supino', 94, 5), reg(SEG[4], 'Supino', 94, 5)]);
    expect(atencao.nivel).toBe('atencao');
    expect(atencao.queda).toBeCloseTo(-0.06, 6);
    const alerta = calcularIndiceForca([...base, reg(SEG[2], 'Supino', 88, 5), reg(SEG[3], 'Supino', 88, 5), reg(SEG[4], 'Supino', 88, 5)]);
    expect(alerta.nivel).toBe('alerta');
  });

  it('semana sem registro não quebra a sequência de leituras', () => {
    const r = [reg(SEG[0], 'Supino', 100, 5), reg(SEG[1], 'Supino', 100, 5), reg(SEG[2], 'Supino', 88, 5), reg(SEG[4], 'Supino', 88, 5), reg(SEG[5], 'Supino', 88, 5)];
    const i = calcularIndiceForca(r);
    expect(i.semanas.map((s) => s.segunda)).toEqual([SEG[0], SEG[1], SEG[2], SEG[4], SEG[5]]);
    expect(i.nivel).toBe('alerta');
  });

  it('trocar de exercício (outro nome) começa uma referência nova', () => {
    const i = calcularIndiceForca([reg(SEG[0], 'Supino', 100, 5), reg(SEG[1], 'Supino', 100, 5), reg(SEG[2], 'Supino máquina', 70, 5)]);
    expect(i.semanas[2].exercicios[0].variacao).toBeCloseTo(0, 6);
  });

  it('último registro do exercício, opcionalmente antes de uma data', () => {
    const r = [reg(SEG[0], 'Supino', 80, 8), reg(SEG[1], 'Supino', 82, 8), reg(SEG[1], 'Remada', 70, 8)];
    expect(ultimoDoExercicio(r, 'supino')!.carga_kg).toBe(82);
    expect(ultimoDoExercicio(r, 'Supino', SEG[1])!.carga_kg).toBe(80);
    expect(ultimoDoExercicio(r, 'Agachamento')).toBeNull();
  });
});
