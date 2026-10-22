import { describe, expect, it } from 'vitest';
import { converterRegistro } from '../dados/fotos';
import { lerBackup, montarBackup, planejarImportacao } from './backup';
import {
  conflitoDataSessao,
  converterFotoAntiga,
  dataDaSessao,
  deBase64,
  estimarTamanhoPdf,
  fotoBackupValida,
  fotosDaSessao,
  fotosParaImportar,
  idLegado,
  idsDosPares,
  medicaoProxima,
  montarFotosPdf,
  normalizarFotoBackup,
  numerosDaMedicao,
  ordenarFotos,
  paraBase64,
  periodoDaSessao,
  proximaOrdem,
  separarFotosImportar,
  separarParesFotos,
  tamanhoBackupFotos,
  textoTamanho,
  type FotoBackup,
  type FotoInfo,
  type Rotulo,
  type Sessao,
} from './fotos';
import type { Composicao } from './gordura';

const comp = (data: string, peso: number, cintura: number, bf: number | null, extra: Partial<Composicao> = {}): Composicao => ({
  data,
  peso_kg: peso,
  bf,
  massa_magra_kg: null,
  massa_gorda_kg: null,
  cintura_cm: cintura,
  pescoco_cm: 41,
  quadril_cm: null,
  ...extra,
});

let seq = 0;
const foto = (sessao: Sessao, rotulo: Rotulo, data: string, extra: Partial<FotoInfo> = {}): FotoInfo => ({
  id: `f${++seq}`,
  sessao,
  rotulo,
  data,
  ordem: seq,
  ...extra,
});

describe('Fotos: medição mais próxima', () => {
  const lista = [comp('2026-09-07', 96, 98, 25), comp('2026-09-14', 95.5, 97.5, 24.8), comp('2026-12-07', 90, 92, 21)];
  it('escolhe a mais próxima até 7 dias', () => {
    expect(medicaoProxima(lista, '2026-09-08')?.data).toBe('2026-09-07');
    expect(medicaoProxima(lista, '2026-09-12')?.data).toBe('2026-09-14');
    expect(medicaoProxima(lista, '2026-12-14')?.data).toBe('2026-12-07');
  });
  it('nada a mais de 7 dias', () => {
    expect(medicaoProxima(lista, '2026-10-20')).toBeNull();
    expect(medicaoProxima(lista, '2026-12-15')).toBeNull();
    expect(medicaoProxima([], '2026-10-20')).toBeNull();
  });
  it('empate: fica com a de antes da foto', () => {
    expect(medicaoProxima([comp('2026-09-14', 1, 1, 1), comp('2026-09-08', 2, 2, 2)], '2026-09-11')?.data).toBe('2026-09-08');
  });
  it('pula a medição atípica', () => {
    const l = [comp('2026-09-07', 96, 98, 25), comp('2026-09-10', 99, 100, 26, { atipica: true })];
    expect(medicaoProxima(l, '2026-09-10')?.data).toBe('2026-09-07');
  });
  it('peso, cintura e % de gordura; quadril só no feminino; variação contra o Antes', () => {
    const a = comp('2026-09-07', 96, 98, 25, { quadril_cm: 104 });
    const d = comp('2026-12-07', 90, 92, 21, { quadril_cm: 100 });
    expect(numerosDaMedicao(a, false).map((n) => n.rotulo)).toEqual(['Peso', 'Cintura', '% de gordura']);
    const fem = numerosDaMedicao(d, true, a);
    expect(fem.map((n) => n.rotulo)).toEqual(['Peso', 'Cintura', '% de gordura', 'Quadril']);
    expect(fem[0].variacao).toBe('− 6,0 kg');
    expect(fem[2].variacao).toBe('− 4,0 p.p.');
    expect(fem[3].delta).toBe(-4);
    expect(numerosDaMedicao(null, false)).toEqual([]);
  });
});

describe('Fotos: galeria (quantas quiser por sessão)', () => {
  it('ordem: pela data e, no mesmo dia, pela ordem de adição', () => {
    const l = [
      foto('antes', 'outra', '2026-09-08', { id: 'c', ordem: 1 }),
      foto('antes', 'frente', '2026-09-07', { id: 'b', ordem: 9 }),
      foto('antes', 'lado', '2026-09-07', { id: 'a', ordem: 3 }),
      foto('depois', 'frente', '2026-09-01', { id: 'd', ordem: 0 }),
    ];
    expect(ordenarFotos(l).map((f) => f.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(fotosDaSessao(l, 'antes').map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(fotosDaSessao(l, 'depois').map((f) => f.id)).toEqual(['d']);
    expect(proximaOrdem(l)).toBe(10);
    expect(proximaOrdem([])).toBe(0);
  });
  it('data da sessão para os números: a da foto mais recente; período da sessão', () => {
    const l = [foto('antes', 'frente', '2026-09-07'), foto('antes', 'outra', '2026-09-10'), foto('antes', 'lado', '2026-09-08')];
    expect(dataDaSessao(l, 'antes')).toBe('2026-09-10');
    expect(dataDaSessao(l, 'depois')).toBeNull();
    expect(periodoDaSessao(l, 'antes')).toEqual({ primeira: '2026-09-07', ultima: '2026-09-10' });
    expect(periodoDaSessao(l, 'depois')).toBeNull();
  });
  it('datas: todo o Antes vem antes de todo o Depois (compara a mais recente do Antes e a mais antiga do Depois)', () => {
    const l = [foto('antes', 'frente', '2026-09-07'), foto('antes', 'outra', '2026-10-19'), foto('depois', 'frente', '2026-12-01'), foto('depois', 'lado', '2026-12-20')];
    expect(conflitoDataSessao(l, 'depois', '2026-10-18')).toMatch(/foto mais recente do Antes \(19\/10\/2026\)/);
    expect(conflitoDataSessao(l, 'depois', '2026-10-19')).toBeNull();
    expect(conflitoDataSessao(l, 'antes', '2026-12-02')).toMatch(/foto mais antiga do Depois \(01\/12\/2026\)/);
    expect(conflitoDataSessao(l, 'antes', '2026-12-01')).toBeNull();
    // Mesma sessão não conflita
    expect(conflitoDataSessao(l, 'antes', '2026-01-01')).toBeNull();
  });
});

describe('Fotos: migração do formato antigo (uma por sessão + pose)', () => {
  it('a foto antiga ganha id estável, o rótulo da pose e a ordem frente, lado, costas', () => {
    const antiga = { sessao: 'antes' as const, pose: 'lado' as const, data: '2026-09-07', tipo: 'image/jpeg' };
    const n = converterFotoAntiga(antiga);
    expect(n).toEqual({ id: 'antiga-antes-lado-2026-09-07', sessao: 'antes', rotulo: 'lado', data: '2026-09-07', ordem: 1, tipo: 'image/jpeg' });
    expect('pose' in n).toBe(false);
    expect(n.id).toBe(idLegado('antes', 'lado', '2026-09-07'));
    // Converter de novo dá o mesmo (id estável) e a nova passa como está
    expect(converterFotoAntiga(n)).toEqual(n);
    const nova = { id: 'abc-123', sessao: 'depois' as const, rotulo: 'outra' as const, data: '2026-12-01', ordem: 1730000000000 };
    expect(converterFotoAntiga(nova)).toEqual(nova);
  });
  it('registro do banco (versão 1) vira o formato novo com a chave usuario|id', () => {
    const v1 = {
      chave: 'u1|depois|costas',
      usuario: 'u1',
      sessao: 'depois' as const,
      pose: 'costas' as const,
      data: '2026-12-07',
      dados: new ArrayBuffer(8),
      tipo: 'image/jpeg',
      largura: 960,
      altura: 1280,
      salva_em: '2026-12-07T10:00:00Z',
    };
    const r = converterRegistro(v1);
    expect(r).toMatchObject({ chave: 'u1|antiga-depois-costas-2026-12-07', id: 'antiga-depois-costas-2026-12-07', rotulo: 'costas', ordem: 2, usuario: 'u1' });
    expect(r.dados.byteLength).toBe(8);
    expect('pose' in r).toBe(false);
    // Já convertido: nada muda
    expect(converterRegistro(r)).toEqual(r);
  });
});

describe('Fotos: pares por pose e grade do PDF', () => {
  const medidas = [comp('2026-09-07', 96, 98, 25), comp('2026-10-01', 94, 96, 24), comp('2026-12-07', 90, 92, 21)];
  const l = [
    foto('antes', 'frente', '2026-09-10', { id: 'af2' }),
    foto('antes', 'frente', '2026-09-07', { id: 'af1' }),
    foto('antes', 'lado', '2026-09-07', { id: 'al1' }),
    foto('antes', 'costas', '2026-09-07', { id: 'ac1' }),
    foto('antes', 'outra', '2026-09-08', { id: 'ao1' }),
    foto('depois', 'frente', '2026-12-01', { id: 'df1' }),
    foto('depois', 'frente', '2026-12-07', { id: 'df2' }),
    foto('depois', 'lado', '2026-12-07', { id: 'dl1' }),
    foto('depois', 'outra', '2026-12-07', { id: 'do1' }),
  ];
  it('par = primeira (mais antiga) do Antes × mais recente do Depois; pose só de um lado vai para a grade', () => {
    const s = separarParesFotos(l);
    expect(s.pares.map((p) => [p.rotulo, p.antes.id, p.depois.id])).toEqual([
      ['frente', 'af1', 'df2'],
      ['lado', 'al1', 'dl1'],
    ]);
    expect(s.outrasAntes.map((f) => f.id)).toEqual(['ac1', 'ao1', 'af2']);
    expect(s.outrasDepois.map((f) => f.id)).toEqual(['df1', 'do1']);
    expect([...idsDosPares(l)].sort()).toEqual(['af1', 'al1', 'df2', 'dl1']);
    expect(separarParesFotos([])).toEqual({ pares: [], outrasAntes: [], outrasDepois: [] });
  });
  it('números e variação nos pares; data e pose embaixo de cada foto da grade', () => {
    const p = montarFotosPdf(l, medidas, false);
    expect(p.pares[0]).toMatchObject({ titulo: 'Frente', idAntes: 'af1', idDepois: 'df2' });
    expect(p.pares[0].antes).toEqual({ data: '07/09/26', linhas: ['Peso: 96,0 kg', 'Cintura: 98,0 cm', '% de gordura: 25,0%'] });
    expect(p.pares[0].depois.linhas[0]).toBe('Peso: 90,0 kg');
    expect(p.pares[0].variacao).toEqual(['Peso: − 6,0 kg', 'Cintura: − 6,0 cm', '% de gordura: − 4,0 p.p.']);
    expect(p.outrasAntes.map((x) => x.legenda)).toEqual(['07/09/26 · Costas', '08/09/26', '10/09/26 · Frente']);
    expect(p.outrasDepois.map((x) => x.legenda)).toEqual(['01/12/26 · Frente', '07/12/26']);
  });
  it('foto sem medição por perto avisa; medição de outro dia aparece com a data', () => {
    const p = montarFotosPdf([foto('antes', 'costas', '2026-09-09', { id: 'a' }), foto('depois', 'costas', '2026-10-20', { id: 'd' })], medidas, true);
    expect(p.pares[0].antes.linhas[0]).toBe('Medição de 07/09/26');
    expect(p.pares[0].depois.linhas).toEqual(['Sem medição até 7 dias da foto.']);
    expect(p.pares[0].variacao).toEqual([]);
  });
  it('muitas fotos: todas entram (pares + grade), nenhuma repetida', () => {
    const muitas = [
      ...Array.from({ length: 14 }, (_, i) => foto('antes', (['frente', 'lado', 'costas', 'outra'] as const)[i % 4], `2026-09-${String(1 + i).padStart(2, '0')}`)),
      ...Array.from({ length: 10 }, (_, i) => foto('depois', (['frente', 'outra'] as const)[i % 2], `2026-12-${String(1 + i).padStart(2, '0')}`)),
    ];
    const p = montarFotosPdf(muitas, [], false);
    const ids = [...p.pares.flatMap((x) => [x.idAntes, x.idDepois]), ...p.outrasAntes.map((x) => x.id), ...p.outrasDepois.map((x) => x.id)];
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    expect(p.pares.map((x) => x.rotulo)).toEqual(['frente']);
  });
  it('tamanho aproximado do PDF: cresce com as fotos; as da grade pesam menos que as dos pares', () => {
    const com = (f: FotoInfo, bytes = 300_000) => ({ ...f, bytes, largura: 960, altura: 1280 });
    const par = [com(foto('antes', 'frente', '2026-09-01', { id: 'p1' })), com(foto('depois', 'frente', '2026-12-01', { id: 'p2' }))];
    const grade = [com(foto('antes', 'outra', '2026-09-01', { id: 'g1' })), com(foto('depois', 'outra', '2026-12-01', { id: 'g2' }))];
    const base = estimarTamanhoPdf([]);
    expect(estimarTamanhoPdf(par)).toBeGreaterThan(estimarTamanhoPdf(grade));
    expect(estimarTamanhoPdf(grade)).toBeGreaterThan(base);
    // 24 fotos de ~300 KB: na casa de poucos MB
    const muitas = Array.from({ length: 24 }, (_, i) => com(foto('antes', 'outra', '2026-09-01', { id: `m${i}` })));
    const mb = estimarTamanhoPdf(muitas) / 1024 / 1024;
    expect(mb).toBeGreaterThan(0.5);
    expect(mb).toBeLessThan(4);
  });
});

describe('Fotos: backup', () => {
  const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
  const b64 = paraBase64(bytes);
  /** Item do backup no formato novo */
  const nova = (id: string, sessao: Sessao, rotulo: Rotulo, data = '2026-10-05', ordem = 0): FotoBackup => ({
    id,
    sessao,
    rotulo,
    ...(rotulo !== 'outra' ? { pose: rotulo } : {}),
    data,
    ordem,
    tipo: 'image/jpeg',
    largura: 960,
    altura: 1280,
    salva_em: '2026-10-05T10:00:00Z',
    base64: b64,
  });
  /** Item do backup no formato antigo (sem id, rótulo nem ordem) */
  const antiga = (sessao: Sessao, pose: 'frente' | 'lado' | 'costas', data = '2026-10-05') =>
    ({ sessao, pose, data, tipo: 'image/jpeg', largura: 960, altura: 1280, salva_em: '2026-10-05T10:00:00Z', base64: b64 }) as unknown as FotoBackup;
  const vazio = { aplicacoes: [], medidas: [], diario: [], treinos: [] };

  it('base64 vai e volta sem perder bytes (foto grande)', () => {
    const volta = deBase64(paraBase64(bytes));
    expect(volta.length).toBe(bytes.length);
    expect(volta.every((b, i) => b === bytes[i])).toBe(true);
    expect(tamanhoBackupFotos([nova('a', 'antes', 'frente')])).toBe(Math.ceil(70000 / 3) * 4);
    expect(textoTamanho(2.5 * 1024 * 1024)).toBe('2,5 MB');
    expect(textoTamanho(300 * 1024)).toBe('300 KB');
  });

  it('backup novo: todas as fotos, várias por pose, entram; importar de novo não duplica (pelo id)', () => {
    const fotos = [nova('a1', 'antes', 'frente'), nova('a2', 'antes', 'frente'), nova('a3', 'antes', 'outra'), nova('d1', 'depois', 'lado', '2026-12-01')];
    const b = montarBackup({ perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [], fotos }, '2026-12-08T12:00:00Z');
    const lido = lerBackup(JSON.stringify(b));
    expect(lido.fotos).toHaveLength(4);
    const p = planejarImportacao(lido, vazio);
    expect(p.fotos.map((f) => f.id)).toEqual(['a1', 'a2', 'a3', 'd1']);
    expect(p.fotos[2].rotulo).toBe('outra');
    expect(deBase64(p.fotos[0].base64).length).toBe(70000);
    // Já no aparelho: a1 e d1 ficam como estão
    const p2 = planejarImportacao(lido, { ...vazio, fotos: [{ id: 'a1', sessao: 'antes', data: '2026-10-05' }, { id: 'd1', sessao: 'depois', data: '2026-12-01' }] });
    expect(p2.fotos.map((f) => f.id)).toEqual(['a2', 'a3']);
    expect(p2.ignoradas.fotos).toBe(2);
  });

  it('backup antigo (sessão + pose, sem id) continua importando, com o id estável da migração', () => {
    const lido = lerBackup(JSON.stringify({ versao: 3, exportado_em: '2026-11-01', aplicacoes: [], fotos: [antiga('antes', 'frente'), antiga('depois', 'costas', '2026-12-01')] }));
    const p = planejarImportacao(lido, vazio);
    expect(p.fotos.map((f) => [f.id, f.rotulo])).toEqual([
      ['antiga-antes-frente-2026-10-05', 'frente'],
      ['antiga-depois-costas-2026-12-01', 'costas'],
    ]);
    expect(p.fotos.every((f) => !('pose' in f))).toBe(true);
    // A mesma foto já migrada no aparelho (mesmo id estável): não duplica
    const p2 = planejarImportacao(lido, { ...vazio, fotos: [{ id: idLegado('antes', 'frente', '2026-10-05'), sessao: 'antes', data: '2026-10-05' }] });
    expect(p2.fotos.map((f) => f.id)).toEqual(['antiga-depois-costas-2026-12-01']);
    expect(p2.ignoradas.fotos).toBe(1);
  });

  it('a ordem de adição das importadas vem depois das do aparelho', () => {
    const r = separarFotosImportar([nova('x', 'antes', 'outra', '2026-10-05', 5), nova('y', 'antes', 'outra', '2026-10-05', 2)], [
      { id: 'z', sessao: 'antes', data: '2026-10-01', ordem: 40 },
    ]);
    expect(r.fotos.map((f) => [f.id, f.ordem])).toEqual([
      ['y', 41],
      ['x', 42],
    ]);
  });

  it('fotos estragadas e repetidas no arquivo; backup sem fotos', () => {
    const lista = [nova('a', 'antes', 'frente'), null, 42, { ...nova('b', 'antes', 'lado'), sessao: 'durante' }, { x: 1 }, nova('a', 'antes', 'frente')];
    expect(fotosParaImportar(lista, [])).toHaveLength(1);
    const lido = lerBackup(JSON.stringify(montarBackup({ perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [], fotos: lista as FotoBackup[] }, 'x')));
    expect(planejarImportacao(lido, vazio).ignoradas.fotos).toBe(1);
    expect(fotoBackupValida({ ...nova('a', 'antes', 'frente'), pose: undefined, rotulo: 'cima' })).toBe(false);
    expect(fotoBackupValida({ ...nova('a', 'antes', 'frente'), data: '05/10/2026' })).toBe(false);
    expect(fotoBackupValida({ ...nova('a', 'antes', 'frente'), base64: '' })).toBe(false);
    expect(fotoBackupValida({ ...nova('a', 'antes', 'frente'), id: 'com espaço / barra' })).toBe(false);
    expect(fotoBackupValida(antiga('antes', 'lado'))).toBe(true);
    expect(fotoBackupValida(null)).toBe(false);
    expect(normalizarFotoBackup({ ...nova('a', 'antes', 'outra'), tipo: '' }).tipo).toBe('image/jpeg');
    expect(() => lerBackup(JSON.stringify({ versao: 3, exportado_em: 'x', aplicacoes: [], fotos: 'x' }))).toThrow('não reconhecido');

    const b = montarBackup({ perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [] }, '2026-12-08T12:00:00Z');
    const texto = JSON.stringify(b);
    expect(texto).not.toContain('fotos');
    const p = planejarImportacao(lerBackup(texto), vazio);
    expect(p.fotos).toEqual([]);
    expect(p.ignoradas.fotos).toBe(0);
    expect(planejarImportacao(lerBackup(JSON.stringify({ ...b, versao: 1 })), vazio).fotos).toEqual([]);
  });

  it('foto que inverteria a ordem Antes/Depois com as do aparelho fica de fora', () => {
    const r = separarFotosImportar([nova('a', 'antes', 'frente', '2026-12-10'), nova('d', 'depois', 'frente', '2026-12-20')], [
      { id: 'x', sessao: 'depois', data: '2026-12-05' },
    ]);
    expect(r.fotos.map((f) => f.id)).toEqual(['d']);
    expect(r.conflito).toBe(1);
  });
});
