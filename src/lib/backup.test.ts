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

  it('versão 3 leva os treinos', () => {
    const lido = lerBackup(JSON.stringify(b));
    expect(lido.versao).toBe(3);
    expect(lido.treinos).toHaveLength(1);
  });

  it('importar de novo não duplica aplicações nem medidas', () => {
    const p = planejarImportacao(b, { aplicacoes: [apl('2026-09-28'), apl('2026-10-05')], medidas: [med('2026-10-05')], diario: [], treinos: [] });
    expect(p.aplicacoes).toHaveLength(0);
    expect(p.medidas).toHaveLength(0);
    expect(p.ignoradas).toEqual({ aplicacoes: 2, medidas: 1, fotos: 0 });
  });

  it('conta nova recebe tudo', () => {
    const p = planejarImportacao(b, { aplicacoes: [], medidas: [], diario: [], treinos: [] });
    expect(p.aplicacoes).toHaveLength(2);
    expect(p.treinos).toHaveLength(1);
  });

  it('aceita as versões 1 e 2 e recusa arquivo estranho', () => {
    expect(lerBackup(JSON.stringify({ ...b, versao: 1, treinos: undefined })).versao).toBe(1);
    expect(lerBackup(JSON.stringify({ ...b, versao: 2 })).versao).toBe(2);
    expect(() => lerBackup(JSON.stringify({ ...b, registro_decisoes: 'x' }))).toThrow('não reconhecido');
    expect(() => lerBackup('{"a":1}')).toThrow('não reconhecido');
    expect(() => lerBackup('xx')).toThrow('não reconhecido');
  });

  it('leva as decisões de fase, a seringa e a concentração de cada aplicação', () => {
    const ciclo = {
      id: 'c',
      nome: 'x',
      data_inicio: '2026-10-08',
      quantidade_total_mg: 60,
      concentracao_mg_ml: 20,
      intervalo_dias: 7,
      passo_ui: 0.125,
      fases: [],
      seringa_capacidade_ui: 30,
      seringa_marca_ui: 0.5,
      frasco_aberto_em: '2026-10-01',
      decisoes: [{ id: 'd', data: '2026-11-01', apos_aplicacao: 4, dose_mg: 1.25, fase_indice: 0, escolha: 'anotacao' as const, texto: 'náusea no D1' }],
    };
    const comCiclo = montarBackup({ ...b, ciclo, aplicacoes: [{ ...apl('2026-10-08'), concentracao_mg_ml: 20 }] }, '2026-11-02T12:00:00Z');
    const lido = lerBackup(JSON.stringify(comCiclo));
    expect(lido.ciclo).toMatchObject({ seringa_capacidade_ui: 30, seringa_marca_ui: 0.5, frasco_aberto_em: '2026-10-01' });
    expect(lido.ciclo!.decisoes![0].texto).toBe('náusea no D1');
    expect(lido.aplicacoes[0].concentracao_mg_ml).toBe(20);
  });

  it('leva o registro de decisões e não duplica ao importar de novo', () => {
    const r = { id: 'r1', data: '2026-10-12', tipo: 'dieta' as const, campo: 'Déficit/superávit', de: '−300 kcal', para: '−450 kcal', motivo: 'ritmo baixo', ref: null };
    const comRegistro = montarBackup({ ...b, registro_decisoes: [r] }, '2026-10-13T12:00:00Z');
    const lido = lerBackup(JSON.stringify(comRegistro));
    expect(lido.registro_decisoes![0].motivo).toBe('ritmo baixo');
    const vazio = { aplicacoes: [], medidas: [], diario: [], treinos: [] };
    expect(planejarImportacao(lido, vazio).registro_decisoes).toHaveLength(1);
    // Mesma linha já existe na conta (mesmo com outro id): não importa de novo
    expect(planejarImportacao(lido, { ...vazio, registro_decisoes: [{ ...r, id: 'outro' }] }).registro_decisoes).toHaveLength(0);
    // Backup antigo, sem o registro
    expect(planejarImportacao(b, vazio).registro_decisoes).toEqual([]);
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
