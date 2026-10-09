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
});
