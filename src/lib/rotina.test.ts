import { describe, expect, it } from 'vitest';
import { diaCurto, diaDesdeDose, doseEmDestaque, horaDaFaixaOntem, horaDeFecharODia, pendenciasDeOntem, textoPendencias } from './rotina';
import type { RegistroDiario, TreinoDia } from './tipos';

const tr = (data: string, treino: boolean, cardio: boolean): TreinoDia => ({ id: data, data, treino, cardio, corrida_km: null, corrida_seg: null });
const reg = (data: string, dieta_seguida: RegistroDiario['dieta_seguida']): RegistroDiario => ({
  id: data,
  data,
  peso_kg: null,
  nausea: null,
  observacoes: null,
  dieta_seguida,
});

describe('Horários do Início', () => {
  it('faixa de ontem das 05h às 12h; "Fechar o dia" a partir das 18h', () => {
    expect([4, 5, 11, 12].map(horaDaFaixaOntem)).toEqual([false, true, true, false]);
    expect([17, 18, 23].map(horaDeFecharODia)).toEqual([false, true, true]);
  });
  it('dia curto', () => {
    expect(diaCurto('2026-10-24')).toBe('sáb 24/10');
  });
});

describe('Cartão da dose em destaque', () => {
  const r = { pausa_dias: null };
  it('completo na véspera, no dia, atrasada ou com decisão pendente', () => {
    expect(doseEmDestaque({ situacao: 'hoje', dias: 0, estado: 'em_curso' }, r)).toBe(true);
    expect(doseEmDestaque({ situacao: 'atrasada', dias: 2, estado: 'em_curso' }, r)).toBe(true);
    expect(doseEmDestaque({ situacao: 'futura', dias: 1, estado: 'em_curso' }, r)).toBe(true);
    expect(doseEmDestaque({ situacao: 'futura', dias: 4, estado: 'pendente' }, r)).toBe(true);
    expect(doseEmDestaque({ situacao: 'futura', dias: 4, estado: 'fora_do_plano' }, r)).toBe(true);
    expect(doseEmDestaque({ situacao: 'futura', dias: 4, estado: 'em_curso' }, { pausa_dias: 20 })).toBe(true);
  });
  it('compacto nos outros dias', () => {
    expect(doseEmDestaque({ situacao: 'futura', dias: 2, estado: 'em_curso' }, r)).toBe(false);
    expect(doseEmDestaque({ situacao: 'futura', dias: 6, estado: 'subir' }, r)).toBe(false);
  });
  it('dia desde a dose', () => {
    expect(diaDesdeDose('2026-10-15', '2026-10-15')).toBe(0);
    expect(diaDesdeDose('2026-10-15', '2026-10-18')).toBe(3);
    expect(diaDesdeDose('2026-10-15', '2026-10-14')).toBe(null);
    expect(diaDesdeDose(null, '2026-10-14')).toBe(null);
  });
});

describe('Pendências de ontem', () => {
  const periodo = { inicio: '2026-10-01', fim: '2026-12-31' };
  const hoje = '2026-10-25';
  const completos = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d) => tr(d, true, true));

  it('cardio esquecido ontem: pendência e a sequência que se perderia', () => {
    const p = pendenciasDeOntem({ hoje, treinos: [...completos, tr('2026-10-24', true, false)], diario: [], periodoTreino: periodo, comDieta: true })!;
    expect(p).toMatchObject({ data: '2026-10-24', treino: false, cardio: true, dieta: true, sequencia: 4 });
    expect(textoPendencias(p)).toBe('cardio não marcado · dieta sem resposta');
  });

  it('nada pendente: null', () => {
    const p = pendenciasDeOntem({ hoje, treinos: [tr('2026-10-24', true, true)], diario: [reg('2026-10-24', 'parcial')], periodoTreino: periodo, comDieta: true });
    expect(p).toBeNull();
  });

  it('conta sem Treino: só a dieta', () => {
    const p = pendenciasDeOntem({ hoje, treinos: [], diario: [], periodoTreino: null, comDieta: true })!;
    expect(p).toMatchObject({ treino: false, cardio: false, dieta: true, sequencia: 0 });
    expect(textoPendencias(p)).toBe('dieta sem resposta');
    // Sem plano montado, não cobra a dieta
    expect(pendenciasDeOntem({ hoje, treinos: [], diario: [], periodoTreino: null, comDieta: false })).toBeNull();
  });

  it('ontem fora do placar não cobra treino', () => {
    const p = pendenciasDeOntem({ hoje: '2026-10-01', treinos: [], diario: [], periodoTreino: periodo, comDieta: false });
    expect(p).toBeNull();
  });

  it('treino e cardio sem marcar', () => {
    const p = pendenciasDeOntem({ hoje, treinos: completos, diario: [reg('2026-10-24', 'sim')], periodoTreino: periodo, comDieta: true })!;
    expect(textoPendencias(p)).toBe('treino e cardio não marcados');
    expect(p.sequencia).toBe(4);
  });
});
