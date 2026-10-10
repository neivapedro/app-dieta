import { describe, expect, it } from 'vitest';
import { lerBackup, montarBackup, planejarImportacao } from './backup';

const apl = (data: string) => ({ id: data, ciclo_id: 'c', data, dose_mg: 1.25, local: null, observacoes: null });
const med = (data: string) => ({ id: data, data, altura_cm: 181, pescoco_cm: 41, cintura_cm: 97, quadril_cm: null, peso_kg: 95 });

describe('Backup', () => {
  const b = montarBackup(
    {
      perfil: null,
      ciclo: null,
      aplicacoes: [apl('2026-09-28'), apl('2026-10-05')],
      diario: [],
      medidas: [med('2026-10-05')],
      dieta: null,
      treinos: [{ id: 't', data: '2026-10-05', treino: true, cardio: false, corrida_km: null, corrida_seg: null }],
    },
    '2026-10-09T12:00:00Z',
  );

  it('versão 2 leva os treinos', () => {
    const lido = lerBackup(JSON.stringify(b));
    expect(lido.versao).toBe(2);
    expect(lido.treinos).toHaveLength(1);
  });

  it('importar de novo não duplica aplicações nem medidas', () => {
    const p = planejarImportacao(b, { aplicacoes: [apl('2026-09-28'), apl('2026-10-05')], medidas: [med('2026-10-05')], diario: [], treinos: [] });
    expect(p.aplicacoes).toHaveLength(0);
    expect(p.medidas).toHaveLength(0);
    expect(p.ignoradas).toEqual({ aplicacoes: 2, medidas: 1 });
  });

  it('conta nova recebe tudo', () => {
    const p = planejarImportacao(b, { aplicacoes: [], medidas: [], diario: [], treinos: [] });
    expect(p.aplicacoes).toHaveLength(2);
    expect(p.treinos).toHaveLength(1);
  });

  it('aceita a versão 1 e recusa arquivo estranho', () => {
    expect(lerBackup(JSON.stringify({ ...b, versao: 1, treinos: undefined })).versao).toBe(1);
    expect(() => lerBackup('{"a":1}')).toThrow('não reconhecido');
    expect(() => lerBackup('xx')).toThrow('não reconhecido');
  });

  it('leva a marca de medição atípica e a calibração do % de gordura', () => {
    const perfil = { nome: 'P', sexo: 'Masculino' as const, altura_cm: 181, lembretes_ativos: true, hora_lembrete: '08:00', fuso_horario: 'America/Sao_Paulo', ajuste_gordura: 1.5, exame_gordura_data: '2026-10-05', exame_gordura_bf: 23.5 };
    const c = montarBackup({ perfil, ciclo: null, aplicacoes: [], diario: [], medidas: [{ ...med('2026-10-12'), atipica: true }] }, '2026-10-13T12:00:00Z');
    const lido = lerBackup(JSON.stringify(c));
    expect(lido.medidas[0].atipica).toBe(true);
    expect(lido.perfil).toMatchObject({ ajuste_gordura: 1.5, exame_gordura_data: '2026-10-05', exame_gordura_bf: 23.5 });
    expect(planejarImportacao(lido, { aplicacoes: [], medidas: [], diario: [], treinos: [] }).medidas[0].atipica).toBe(true);
  });
});

describe('Backup: força', () => {
  const f = (data: string, exercicio: string) => ({ id: data + exercicio, data, exercicio, carga_kg: 80, reps: 8, rir: 1 });
  it('leva a força e não duplica o mesmo exercício no mesmo dia', () => {
    const b = montarBackup(
      { perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [], treinos: [], forca: [f('2026-10-19', 'Supino'), f('2026-10-19', 'Remada'), f('2026-10-26', 'Supino')] },
      '2026-10-27T12:00:00Z',
    );
    const lido = lerBackup(JSON.stringify(b));
    expect(lido.forca).toHaveLength(3);
    const p = planejarImportacao(lido, { aplicacoes: [], medidas: [], diario: [], treinos: [], forca: [f('2026-10-19', 'supino')] });
    expect(p.forca.map((x) => `${x.data} ${x.exercicio}`)).toEqual(['2026-10-19 Remada', '2026-10-26 Supino']);
    expect(planejarImportacao(lido, { aplicacoes: [], medidas: [], diario: [], treinos: [] }).forca).toHaveLength(3);
  });
  it('recusa força que não é lista', () => {
    expect(() => lerBackup(JSON.stringify({ versao: 2, exportado_em: 'x', aplicacoes: [], forca: 1 }))).toThrow('não reconhecido');
  });
});
