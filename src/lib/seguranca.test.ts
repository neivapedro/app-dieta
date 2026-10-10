import { describe, expect, it } from 'vitest';
import { somarDias } from './datas';
import type { Composicao } from './gordura';
import { alertasSeguranca } from './seguranca';
import type { Aplicacao, RegistroDiario } from './tipos';

const reg = (data: string, extra: Partial<RegistroDiario> = {}): RegistroDiario => ({
  id: data,
  data,
  peso_kg: null,
  nausea: null,
  observacoes: null,
  ...extra,
});

const ap = (data: string): Aplicacao => ({ id: data, ciclo_id: 'c', data, dose_mg: 1.5, local: null, observacoes: null });

const comp = (data: string, peso: number): Composicao => ({
  data,
  peso_kg: peso,
  bf: 25,
  massa_gorda_kg: peso * 0.25,
  massa_magra_kg: peso * 0.75,
  cintura_cm: 95,
  pescoco_cm: 41,
  quadril_cm: null,
});

const regras = (l: { regra: string }[]) => l.map((a) => a.regra).sort();

describe('Alertas de segurança', () => {
  const dose = '2026-10-15';
  const base = { composicoes: [], aplicacoes: [ap('2026-10-08'), ap(dose)] };

  it('sem sintomas não há alerta', () => {
    expect(alertasSeguranca({ ...base, diario: [reg(dose, { nausea: 1 }), reg('2026-10-16', { vomito: false })], hoje: '2026-10-18' })).toEqual([]);
  });

  it('vômito ou diarreia em 2 dias desde a dose → hidratação', () => {
    const diario = [reg('2026-10-17', { diarreia: true }), reg('2026-10-19', { vomito: true })];
    const a = alertasSeguranca({ ...base, diario, hoje: '2026-10-20' });
    expect(regras(a)).toEqual(['hidratacao']);
    expect(a[0].nivel).toBe('atencao');
    expect(a[0].data).toBe('2026-10-19');
    expect(a[0].texto).toContain('2 dias');
    expect(a[0].texto).toContain('dose de 15/10');
  });

  it('dias antes da última dose não entram na janela da hidratação', () => {
    const diario = [reg('2026-10-13', { vomito: true }), reg('2026-10-16', { diarreia: true })];
    expect(regras(alertasSeguranca({ ...base, diario, hoje: '2026-10-18' }))).toEqual([]);
  });

  it('vômito no dia da dose ou no seguinte', () => {
    const a = alertasSeguranca({ ...base, diario: [reg('2026-10-16', { vomito: true })], hoje: '2026-10-17' });
    expect(regras(a)).toEqual(['vomito_dose']);
    expect(a[0].texto).toContain('dia seguinte');
    const b = alertasSeguranca({ ...base, diario: [reg(dose, { vomito: true })], hoje: dose });
    expect(b[0].texto).toContain('no dia da dose');
    // Dois dias depois já não é o "dia seguinte"
    expect(alertasSeguranca({ ...base, diario: [reg('2026-10-17', { vomito: true })], hoje: '2026-10-18' })).toEqual([]);
  });

  it('náusea forte em 2 dias seguidos; dias separados não contam', () => {
    const seguidos = [reg('2026-10-16', { nausea: 3 }), reg('2026-10-17', { nausea: 3 })];
    const a = alertasSeguranca({ ...base, diario: seguidos, hoje: '2026-10-18' });
    expect(regras(a)).toEqual(['nausea_forte']);
    expect(a[0].data).toBe('2026-10-17');
    const separados = [reg('2026-10-15', { nausea: 3 }), reg('2026-10-17', { nausea: 3 })];
    expect(alertasSeguranca({ ...base, diario: separados, hoje: '2026-10-18' })).toEqual([]);
  });

  it('intestino preso 3 dias seguidos vira dica (nível info)', () => {
    const diario = ['2026-10-14', '2026-10-15', '2026-10-16'].map((d) => reg(d, { intestino_preso: true }));
    const a = alertasSeguranca({ ...base, diario, hoje: '2026-10-17' });
    expect(regras(a)).toEqual(['intestino_preso']);
    expect(a[0].nivel).toBe('info');
    expect(a[0].texto).toContain('3 dias seguidos');
    expect(alertasSeguranca({ ...base, diario: diario.slice(1), hoje: '2026-10-17' })).toEqual([]);
  });

  it('ritmo acima de 1,5% por semana na tendência das medidas', () => {
    // 100 kg perdendo 2 kg por semana = 2%/sem
    const rapido = [0, 7, 14, 21].map((d, i) => comp(somarDias('2026-09-21', d), 100 - 2 * i));
    const a = alertasSeguranca({ ...base, composicoes: rapido, diario: [], hoje: '2026-10-14' });
    expect(regras(a)).toEqual(['ritmo_rapido']);
    expect(a[0].texto).toContain('1,5%');
    // 1 kg por semana fica dentro
    const ok = [0, 7, 14, 21].map((d, i) => comp(somarDias('2026-09-21', d), 100 - i));
    expect(alertasSeguranca({ ...base, composicoes: ok, diario: [], hoje: '2026-10-14' })).toEqual([]);
    // Medições velhas (mais de 14 dias) não geram alerta
    expect(alertasSeguranca({ ...base, composicoes: rapido, diario: [], hoje: '2026-11-10' })).toEqual([]);
  });

  it('sem aplicações a janela é a dos últimos 7 dias', () => {
    const diario = [reg('2026-10-12', { vomito: true }), reg('2026-10-14', { vomito: true })];
    expect(regras(alertasSeguranca({ composicoes: [], aplicacoes: [], diario, hoje: '2026-10-15' }))).toEqual(['hidratacao']);
  });
});
