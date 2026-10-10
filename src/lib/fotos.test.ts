import { describe, expect, it } from 'vitest';
import { lerBackup, montarBackup, planejarImportacao } from './backup';
import {
  dataDaSessao,
  deBase64,
  fotoBackupValida,
  fotosParaImportar,
  medicaoProxima,
  montarSecoesFotos,
  numerosDaMedicao,
  paraBase64,
  tamanhoBackupFotos,
  textoTamanho,
  type FotoBackup,
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
});

describe('Fotos: números e seções do PDF', () => {
  const lista = [comp('2026-09-07', 96, 98, 25, { quadril_cm: 104 }), comp('2026-12-07', 90, 92, 21, { quadril_cm: 100 })];
  const fotos = [
    { sessao: 'antes' as const, pose: 'lado' as const, data: '2026-09-08' },
    { sessao: 'antes' as const, pose: 'frente' as const, data: '2026-09-07' },
    { sessao: 'depois' as const, pose: 'frente' as const, data: '2026-12-07' },
  ];
  it('data da sessão: a da foto de frente', () => {
    expect(dataDaSessao(fotos, 'antes')).toBe('2026-09-07');
    expect(dataDaSessao([fotos[0]], 'antes')).toBe('2026-09-08');
    expect(dataDaSessao(fotos.slice(0, 2), 'depois')).toBeNull();
  });
  it('peso, cintura e % de gordura; quadril só no feminino; variação contra o Antes', () => {
    expect(numerosDaMedicao(lista[0], false).map((n) => n.rotulo)).toEqual(['Peso', 'Cintura', '% de gordura']);
    const fem = numerosDaMedicao(lista[1], true, lista[0]);
    expect(fem.map((n) => n.rotulo)).toEqual(['Peso', 'Cintura', '% de gordura', 'Quadril']);
    expect(fem[0].variacao).toBe('− 6,0 kg');
    expect(fem[2].variacao).toBe('− 4,0 p.p.');
    expect(fem[3].delta).toBe(-4);
    expect(numerosDaMedicao(null, false)).toEqual([]);
  });
  it('uma seção por pose com foto, na ordem frente, lado, costas', () => {
    const s = montarSecoesFotos(fotos, lista, false);
    expect(s.map((x) => x.pose)).toEqual(['frente', 'lado']);
    expect(s[0].antes?.data).toBe('07/09/26');
    expect(s[0].antes?.linhas).toEqual(['Peso: 96,0 kg', 'Cintura: 98,0 cm', '% de gordura: 25,0%']);
    expect(s[0].depois?.linhas[0]).toBe('Peso: 90,0 kg');
    expect(s[0].variacao).toEqual(['Peso: − 6,0 kg', 'Cintura: − 6,0 cm', '% de gordura: − 4,0 p.p.']);
    // Lado: medição de outro dia aparece com a data; sem Depois, sem variação
    expect(s[1].antes?.linhas[0]).toBe('Medição de 07/09/26');
    expect(s[1].depois).toBeNull();
    expect(s[1].variacao).toEqual([]);
  });
  it('foto sem medição por perto avisa', () => {
    const s = montarSecoesFotos([{ sessao: 'depois', pose: 'costas', data: '2026-10-20' }], lista, true);
    expect(s[0].depois?.linhas).toEqual(['Sem medição até 7 dias da foto.']);
    expect(montarSecoesFotos([], lista, false)).toEqual([]);
  });
});

describe('Fotos: backup', () => {
  const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
  const foto = (sessao: 'antes' | 'depois', pose: 'frente' | 'lado' | 'costas'): FotoBackup => ({
    sessao,
    pose,
    data: '2026-10-05',
    tipo: 'image/jpeg',
    largura: 960,
    altura: 1280,
    salva_em: '2026-10-05T10:00:00Z',
    base64: paraBase64(bytes),
  });
  it('base64 vai e volta sem perder bytes (foto grande)', () => {
    const volta = deBase64(paraBase64(bytes));
    expect(volta.length).toBe(bytes.length);
    expect(volta.every((b, i) => b === bytes[i])).toBe(true);
    expect(tamanhoBackupFotos([foto('antes', 'frente')])).toBe(Math.ceil(70000 / 3) * 4);
    expect(textoTamanho(2.5 * 1024 * 1024)).toBe('2,5 MB');
    expect(textoTamanho(300 * 1024)).toBe('300 KB');
  });
  it('backup com fotos: lê e importa só os lugares vazios', () => {
    const b = montarBackup({ perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [], fotos: [foto('antes', 'frente'), foto('depois', 'lado')] }, '2026-12-08T12:00:00Z');
    const lido = lerBackup(JSON.stringify(b));
    expect(lido.fotos).toHaveLength(2);
    const vazio = { aplicacoes: [], medidas: [], diario: [], treinos: [] };
    expect(planejarImportacao(lido, vazio).fotos).toHaveLength(2);
    const p = planejarImportacao(lido, { ...vazio, fotos: [{ sessao: 'antes', pose: 'frente' }] });
    expect(p.fotos.map((f) => `${f.sessao} ${f.pose}`)).toEqual(['depois lado']);
    expect(p.ignoradas.fotos).toBe(1);
    expect(deBase64(p.fotos[0].base64).length).toBe(70000);
  });
  it('backup sem fotos e backup antigo continuam funcionando', () => {
    const b = montarBackup({ perfil: null, ciclo: null, aplicacoes: [], diario: [], medidas: [] }, '2026-12-08T12:00:00Z');
    const texto = JSON.stringify(b);
    expect(texto).not.toContain('fotos');
    const p = planejarImportacao(lerBackup(texto), { aplicacoes: [], medidas: [], diario: [], treinos: [] });
    expect(p.fotos).toEqual([]);
    expect(p.ignoradas.fotos).toBe(0);
    expect(planejarImportacao(lerBackup(JSON.stringify({ ...b, versao: 1 })), { aplicacoes: [], medidas: [], diario: [], treinos: [] }).fotos).toEqual([]);
  });
  it('recusa fotos que não são lista e ignora itens estranhos', () => {
    expect(() => lerBackup(JSON.stringify({ versao: 3, exportado_em: 'x', aplicacoes: [], fotos: 'x' }))).toThrow('não reconhecido');
    expect(fotoBackupValida({ ...foto('antes', 'frente'), pose: 'cima' })).toBe(false);
    expect(fotoBackupValida({ ...foto('antes', 'frente'), data: '05/10/2026' })).toBe(false);
    expect(fotoBackupValida({ ...foto('antes', 'frente'), base64: '' })).toBe(false);
    expect(fotoBackupValida(null)).toBe(false);
    // Duas fotos do mesmo lugar no arquivo: entra só a primeira
    expect(fotosParaImportar([foto('antes', 'frente'), { x: 1 }, foto('antes', 'frente')], [])).toHaveLength(1);
  });
});
