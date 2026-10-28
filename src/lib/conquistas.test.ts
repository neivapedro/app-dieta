import { describe, expect, it } from 'vitest';
import { chaveMemoria, detectarConquistas, filtrarNovas, lerMemoria, type RetratoConquistas } from './conquistas';

function retrato(p: Partial<RetratoConquistas> = {}): RetratoConquistas {
  return {
    hoje: '2026-11-02',
    checklist: { feitas: 3, total: 6 },
    corridas: [],
    medidas: [],
    metas: null,
    sexo: 'Masculino',
    aplicacoes: 3,
    fase: { chave: '2026-10-01|1.25', nome: 'Adaptação', feitas: 3, previstas: 4 },
    ...p,
  };
}

const medida = (data: string, cintura: number, peso = 90, extra: object = {}) => ({ data, peso_kg: peso, bf: 22, cintura_cm: cintura, pescoco_cm: 40, quadril_cm: null, ...extra });

function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('detectarConquistas', () => {
  it('nada muda: nenhuma conquista', () => {
    expect(detectarConquistas(retrato(), retrato())).toEqual([]);
  });

  it('checklist: comemora só quando o último item é marcado no mesmo dia', () => {
    const antes = retrato({ checklist: { feitas: 5, total: 6 } });
    const agora = retrato({ checklist: { feitas: 6, total: 6 } });
    const c = detectarConquistas(antes, agora);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 'checklist:2026-11-02', tipo: 'checklist', titulo: 'Checklist do dia completo!' });
    // Já estava completo, virou o dia ou não havia checklist antes: não comemora
    expect(detectarConquistas(agora, agora)).toEqual([]);
    expect(detectarConquistas({ ...antes, hoje: '2026-11-01' }, agora)).toEqual([]);
    expect(detectarConquistas({ ...antes, checklist: null }, agora)).toEqual([]);
    expect(detectarConquistas(antes, retrato({ checklist: { feitas: 0, total: 0 } }))).toEqual([]);
  });

  it('corrida: recorde de pace (arredondado ao segundo) e corrida mais longa', () => {
    const base = [
      { data: '2026-10-20', km: 5, segundos: 1600 }, // 5:20/km
      { data: '2026-10-25', km: 6, segundos: 1950 }, // 5:25/km
    ];
    const recorde = detectarConquistas(retrato({ corridas: base }), retrato({ corridas: [...base, { data: '2026-11-02', km: 5, segundos: 1560 }] }));
    expect(recorde).toHaveLength(1);
    expect(recorde[0].titulo).toBe('Novo recorde de corrida: 5:12/km');
    // Mesmo pace na tela (5:20): não é recorde
    expect(detectarConquistas(retrato({ corridas: base }), retrato({ corridas: [...base, { data: '2026-11-02', km: 4, segundos: 1281 }] }))).toEqual([]);
    const longa = detectarConquistas(retrato({ corridas: base }), retrato({ corridas: [...base, { data: '2026-11-02', km: 8.2, segundos: 2900 }] }));
    expect(longa[0].titulo).toBe('Corrida mais longa: 8,2 km');
    const ambos = detectarConquistas(retrato({ corridas: base }), retrato({ corridas: [...base, { data: '2026-11-02', km: 7, segundos: 2100 }] }));
    expect(ambos[0].titulo).toBe('Novo recorde de corrida: 5:00/km');
    expect(ambos[0].detalhe).toContain('mais longa');
  });

  it('corrida: a primeira corrida e cargas com várias corridas novas não comemoram', () => {
    expect(detectarConquistas(retrato(), retrato({ corridas: [{ data: '2026-11-02', km: 5, segundos: 1500 }] }))).toEqual([]);
    const varias = [
      { data: '2026-10-20', km: 5, segundos: 1600 },
      { data: '2026-11-02', km: 9, segundos: 2000 },
    ];
    expect(detectarConquistas(retrato(), retrato({ corridas: varias }))).toEqual([]);
  });

  it('corrida editada na mesma data não compara consigo mesma', () => {
    const antes = [
      { data: '2026-10-20', km: 5, segundos: 1600 },
      { data: '2026-11-02', km: 5, segundos: 1590 },
    ];
    const agora = [antes[0], { data: '2026-11-02', km: 5, segundos: 1580 }];
    expect(detectarConquistas(retrato({ corridas: antes }), retrato({ corridas: agora }))[0].titulo).toBe('Novo recorde de corrida: 5:16/km');
  });

  it('meta: medição nova que alcança a meta pela primeira vez', () => {
    const metas = { cintura_cm: 90, peso_kg: 85, bf: null, pescoco_cm: null, quadril_cm: 100 };
    const antes = retrato({ metas, medidas: [medida('2026-10-26', 91.5)] });
    const agora = retrato({ metas, medidas: [medida('2026-10-26', 91.5), medida('2026-11-02', 89.8)] });
    const c = detectarConquistas(antes, agora);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 'meta:cintura_cm:90', titulo: 'Meta de cintura atingida', detalhe: '89,8 cm · meta 90,0 cm' });
    // Já estava na meta antes: não comemora de novo
    const ja = retrato({ metas, medidas: [medida('2026-10-26', 89.9)] });
    expect(detectarConquistas(ja, retrato({ metas, medidas: [...ja.medidas, medida('2026-11-02', 89.5)] }))).toEqual([]);
    // Quadril só entra no perfil feminino
    expect(detectarConquistas(antes, agora).some((x) => x.id.startsWith('meta:quadril'))).toBe(false);
  });

  it('meta: medição antiga lançada agora, atípica ou sem meta não comemora', () => {
    const metas = { cintura_cm: 90, peso_kg: null, bf: null, pescoco_cm: null, quadril_cm: null };
    const antes = retrato({ metas, medidas: [medida('2026-10-26', 91.5)] });
    expect(detectarConquistas(antes, retrato({ metas, medidas: [...antes.medidas, medida('2026-10-01', 89)] }))).toEqual([]);
    expect(detectarConquistas(antes, retrato({ metas, medidas: [...antes.medidas, medida('2026-11-02', 89, 90, { atipica: true })] }))).toEqual([]);
    expect(detectarConquistas({ ...antes, metas: null }, retrato({ metas: null, medidas: [...antes.medidas, medida('2026-11-02', 89)] }))).toEqual([]);
  });

  it('meta: várias metas na mesma medição', () => {
    const metas = { cintura_cm: 90, peso_kg: 85, bf: 20, pescoco_cm: null, quadril_cm: null };
    const antes = retrato({ metas, medidas: [medida('2026-10-26', 91, 86)] });
    const agora = retrato({ metas, medidas: [...antes.medidas, { ...medida('2026-11-02', 89, 84.6), bf: 19.5 }] });
    expect(detectarConquistas(antes, agora).map((c) => c.titulo)).toEqual(['Meta de cintura atingida', 'Meta de % de gordura atingida', 'Meta de peso atingida']);
  });

  it('fase: a aplicação que fecha a fase', () => {
    const antes = retrato({ aplicacoes: 3, fase: { chave: 'b1', nome: 'Adaptação', feitas: 3, previstas: 4 } });
    const agora = retrato({ aplicacoes: 4, fase: { chave: 'b1', nome: 'Adaptação', feitas: 4, previstas: 4 } });
    const c = detectarConquistas(antes, agora);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 'fase:b1', titulo: 'Fase concluída', detalhe: 'Adaptação · 4 de 4 aplicações' });
    // Carga com várias aplicações, aplicação a mais depois do fim ou fase sem previsão: não comemora
    expect(detectarConquistas({ ...antes, aplicacoes: 2 }, agora)).toEqual([]);
    expect(detectarConquistas(agora, retrato({ aplicacoes: 5, fase: { chave: 'b1', nome: 'Adaptação', feitas: 5, previstas: 4 } }))).toEqual([]);
    expect(detectarConquistas(antes, retrato({ aplicacoes: 4, fase: { chave: 'b2', nome: '', feitas: 1, previstas: null } }))).toEqual([]);
  });
});

describe('memória das comemorações', () => {
  const c = [{ id: 'checklist:2026-11-02', tipo: 'checklist' as const, titulo: 'x' }];

  it('comemora uma vez e guarda o id', () => {
    const a = memoria();
    const k = chaveMemoria('u1');
    expect(filtrarNovas(c, k, a)).toHaveLength(1);
    expect(filtrarNovas(c, k, a)).toEqual([]);
    expect(lerMemoria(k, a)).toEqual(['checklist:2026-11-02']);
    // Outra conta no mesmo aparelho tem memória própria
    expect(filtrarNovas(c, chaveMemoria('u2'), a)).toHaveLength(1);
  });

  it('armazenamento quebrado ou bloqueado não derruba nada', () => {
    const quebrado = { getItem: () => '{oops', setItem: () => { throw new Error('cheio'); } };
    expect(filtrarNovas(c, 'k', quebrado)).toHaveLength(1);
    expect(lerMemoria('k', quebrado)).toEqual([]);
    expect(filtrarNovas(c, 'k', null)).toHaveLength(1);
  });

  it('a memória não cresce sem limite', () => {
    const a = memoria();
    for (let i = 0; i < 260; i++) filtrarNovas([{ id: `x${i}`, tipo: 'meta', titulo: '' }], 'k', a);
    expect(lerMemoria('k', a)).toHaveLength(200);
  });
});
