import { describe, expect, it } from 'vitest';
import alimentosJson from '../dados/alimentos.json';
import { ALIMENTOS } from '../../supabase/functions/_shared/alimentos';
import {
  avisosDaJanela,
  corpoDoAviso,
  instanteNoFuso,
  lerAntes,
  pluralPorcao,
  textoItem,
  tituloDoAviso,
  type MapaAlimentos,
} from '../../supabase/functions/_shared/refeicoes';
import type { LinhaAlimento } from './dieta';

// Lembrete das refeições (supabase/functions/_shared/refeicoes.ts, o mesmo
// arquivo que a função "enviar-lembretes" usa)

const SP = 'America/Sao_Paulo';
const em = (iso: string) => Date.parse(iso);
const item = (alimento_id = 'x', quantidade = 100, unidade = 'g') => ({ alimento_id, quantidade, unidade });
const ref = (id: string, horario: string | null, itens = [item()]) => ({ id, nome: id, horario, itens });

const PLANO = [ref('Café', '07:00'), ref('Refeição 2', '10:30'), ref('Almoço', '13:00'), ref('Lanche', null), ref('Vazia', '16:00', []), ref('Ceia', '23:50')];

function quais(agoraIso: string, extra: Partial<Parameters<typeof avisosDaJanela>[0]> = {}) {
  return avisosDaJanela({ refeicoes: PLANO, agora: em(agoraIso), fuso: SP, antes: 0, ...extra }).map((a) => `${a.dia} ${a.nome}`);
}

describe('Qual refeição avisar nesta execução', () => {
  it('no horário: a execução das 10:30 (ou logo depois) avisa a Refeição 2', () => {
    expect(quais('2026-10-15T10:30:00-03:00')).toEqual(['2026-10-15 Refeição 2']);
    expect(quais('2026-10-15T10:30:40-03:00')).toEqual(['2026-10-15 Refeição 2']);
    expect(quais('2026-10-15T10:44:59-03:00')).toEqual(['2026-10-15 Refeição 2']);
    // Antes do horário, ainda não
    expect(quais('2026-10-15T10:29:00-03:00')).toEqual([]);
  });

  it('janela de 15 min + 5 de folga: a execução atrasada ainda avisa; depois disso, não', () => {
    expect(quais('2026-10-15T10:49:59-03:00')).toEqual(['2026-10-15 Refeição 2']);
    expect(quais('2026-10-15T10:50:00-03:00')).toEqual([]);
    expect(quais('2026-10-15T12:00:00-03:00')).toEqual([]);
  });

  it('"antes": o aviso é horário − antes, com o título "em N min"', () => {
    expect(quais('2026-10-15T10:15:00-03:00', { antes: 15 })).toEqual(['2026-10-15 Refeição 2']);
    expect(quais('2026-10-15T10:00:00-03:00', { antes: 30 })).toEqual(['2026-10-15 Refeição 2']);
    expect(quais('2026-10-15T10:30:00-03:00', { antes: 30 })).toEqual([]);
    const [a] = avisosDaJanela({ refeicoes: PLANO, agora: em('2026-10-15T10:15:00-03:00'), fuso: SP, antes: 15 });
    expect(tituloDoAviso(a, em('2026-10-15T10:15:00-03:00'))).toBe('Refeição 2 · 10:30 · em 15 min');
    // Execução que chega depois do horário: sem "em N min"
    expect(tituloDoAviso(a, em('2026-10-15T10:31:00-03:00'))).toBe('Refeição 2 · 10:30');
    // Antecedência fora das opções vale "no horário"
    expect(lerAntes(20)).toBe(0);
    expect(lerAntes('15')).toBe(15);
    expect(lerAntes(null)).toBe(0);
  });

  it('sem horário, sem itens ou plano vazio: sem aviso', () => {
    expect(quais('2026-10-15T16:00:00-03:00')).toEqual([]);
    expect(avisosDaJanela({ refeicoes: [], agora: em('2026-10-15T10:30:00-03:00'), fuso: SP, antes: 0 })).toEqual([]);
    expect(avisosDaJanela({ refeicoes: null, agora: em('2026-10-15T10:30:00-03:00'), fuso: SP, antes: 0 })).toEqual([]);
    // Item com quantidade zero não conta como alimento
    expect(avisosDaJanela({ refeicoes: [ref('A', '10:30', [item('x', 0)])], agora: em('2026-10-15T10:30:00-03:00'), fuso: SP, antes: 0 })).toEqual([]);
  });

  it('virada do dia: o aviso de uma refeição de 00:10 com 30 min antes sai na véspera, com o dia da refeição', () => {
    const plano = [ref('Madrugada', '00:10')];
    const r = avisosDaJanela({ refeicoes: plano, agora: em('2026-10-15T23:45:00-03:00'), fuso: SP, antes: 30 });
    expect(r.map((a) => a.dia)).toEqual(['2026-10-16']);
    // Ceia às 23:50, execução às 00:00 do dia seguinte: ainda avisa, com o dia da ceia
    expect(quais('2026-10-16T00:00:00-03:00')).toEqual(['2026-10-15 Ceia']);
  });

  it('fusos: o horário é o do relógio do perfil', () => {
    const plano = [ref('Almoço', '12:00')];
    const agora = em('2026-10-15T12:00:00+01:00'); // 12:00 em Lisboa (horário de verão)
    expect(avisosDaJanela({ refeicoes: plano, agora, fuso: 'Europe/Lisbon', antes: 0 })).toHaveLength(1);
    expect(avisosDaJanela({ refeicoes: plano, agora, fuso: SP, antes: 0 })).toHaveLength(0);
    // Fuso inválido ou vazio: São Paulo
    expect(avisosDaJanela({ refeicoes: plano, agora: em('2026-10-15T12:00:00-03:00'), fuso: 'Lua/Base', antes: 0 })).toHaveLength(1);
    expect(avisosDaJanela({ refeicoes: plano, agora: em('2026-10-15T12:00:00-03:00'), fuso: '', antes: 0 })).toHaveLength(1);
    // Troca do horário de verão (Nova York, 1º/11/2026): antes e depois da troca
    expect(instanteNoFuso('2026-10-31', 12 * 60, 'America/New_York')).toBe(em('2026-10-31T12:00:00-04:00'));
    expect(instanteNoFuso('2026-11-01', 12 * 60, 'America/New_York')).toBe(em('2026-11-01T12:00:00-05:00'));
  });

  it('duplicidade: o que já foi avisado (ou repetido no plano) não volta', () => {
    const ja = new Set(['2026-10-15|Refeição 2']);
    expect(quais('2026-10-15T10:30:00-03:00', { jaEnviados: ja })).toEqual([]);
    // Execução seguinte (10:45) também cai na janela, mas a reserva do dia impede o 2º aviso
    expect(quais('2026-10-15T10:45:00-03:00', { jaEnviados: ja })).toEqual([]);
    // Duas refeições com o mesmo id no plano: um aviso só
    expect(avisosDaJanela({ refeicoes: [ref('A', '10:30'), ref('A', '10:30')], agora: em('2026-10-15T10:30:00-03:00'), fuso: SP, antes: 0 })).toHaveLength(1);
    // Mesmo horário em refeições diferentes: um aviso para cada
    expect(avisosDaJanela({ refeicoes: [ref('A', '10:30'), ref('B', '10:30')], agora: em('2026-10-15T10:30:00-03:00'), fuso: SP, antes: 0 })).toHaveLength(2);
  });

  it('horário "7:05" e "07:05:00" valem; inválido é ignorado', () => {
    const plano = [ref('A', '7:05'), ref('B', '07:05:00'), ref('C', '25:00'), ref('D', 'manhã')];
    const r = avisosDaJanela({ refeicoes: plano, agora: em('2026-10-15T07:15:00-03:00'), fuso: SP, antes: 0 });
    expect(r.map((a) => `${a.nome} ${a.horario}`)).toEqual(['A 07:05', 'B 07:05']);
  });
});

describe('Execuções seguidas do agendador (atrasadas e repetidas)', () => {
  // Simula o pg_cron a cada 15 min por 2 dias, com atraso de até 4 min e algumas
  // execuções em dobro, guardando o que foi enviado como a tabela de controle
  function simular(fuso: string, antes: number, inicioIso: string) {
    const plano = ['00:00', '00:05', '01:30', '07:30', '10:20', '23:55'].map((h) => ref(h, h));
    const enviados = new Map<string, number>();
    const inicio = em(inicioIso);
    for (let k = 0; k < 2 * 96; k++) {
      for (let v = 0; v < (k % 13 === 0 ? 2 : 1); v++) {
        const agora = inicio + k * 15 * 60_000 + ((k * 7919) % 240) * 1000 + v * 1000;
        for (const a of avisosDaJanela({ refeicoes: plano, agora, fuso, antes, jaEnviados: new Set(enviados.keys()) })) {
          expect(agora).toBeGreaterThanOrEqual(a.instante_aviso);
          expect(agora - a.instante_aviso).toBeLessThanOrEqual(20 * 60_000);
          enviados.set(`${a.dia}|${a.refeicao_id}`, (enviados.get(`${a.dia}|${a.refeicao_id}`) ?? 0) + 1);
        }
      }
    }
    return { plano, enviados };
  }

  it('São Paulo, 30 min antes: cada refeição do dia inteiro uma vez só, inclusive na virada', () => {
    const { plano, enviados } = simular(SP, 30, '2026-10-14T23:00:00-03:00');
    expect([...enviados.values()].every((n) => n === 1)).toBe(true);
    for (const r of plano) expect(enviados.has(`2026-10-15|${r.id}`), r.id).toBe(true);
    // 00:00 e 00:05 do dia 16 saem na noite do dia 15 (23:30 e 23:35)
    expect(enviados.has('2026-10-16|00:05')).toBe(true);
  });

  it('Nova York na volta do horário de verão (01:30 acontece duas vezes): um aviso só', () => {
    const { plano, enviados } = simular('America/New_York', 10, '2026-10-31T12:00:00Z');
    expect([...enviados.values()].every((n) => n === 1)).toBe(true);
    for (const r of plano) expect(enviados.has(`2026-11-01|${r.id}`), r.id).toBe(true);
  });
});

describe('Texto da notificação', () => {
  const mapa: MapaAlimentos = {
    uva: ['Uva, Rubi', []],
    banana: ['Banana, prata', [['unidade', 40]]],
    pao: ['Pão, de forma, integral', [['fatia', 25]]],
    azeite: ['Azeite, de oliva', [['colher de sopa', 8]]],
    longo: ['Alimento com um nome muito comprido, com várias vírgulas e detalhes que não acabam nunca mais, de verdade, mesmo, sério, cozido, sem sal, sem óleo, em pedaços pequenos, servido frio, com casca, ralado na hora, conforme a receita da avó', []],
  };

  it('itens na unidade do plano', () => {
    expect(textoItem(item('uva', 100), mapa)).toBe('Uva, Rubi 100 g');
    expect(textoItem(item('banana', 2, 'unidade'), mapa)).toBe('Banana, prata 2 un');
    expect(textoItem(item('pao', 2, 'fatia'), mapa)).toBe('Pão, de forma, integral 2 fatias');
    expect(textoItem(item('pao', 1, 'fatia'), mapa)).toBe('Pão, de forma, integral 1 fatia');
    expect(textoItem(item('azeite', 1.5, 'colher de sopa'), mapa)).toBe('Azeite, de oliva 1,5 colheres de sopa');
    // Porção que não existe mais no banco: gramas; alimento desconhecido: "Alimento"
    expect(textoItem(item('uva', 80, 'cacho'), mapa)).toBe('Uva, Rubi 80 g');
    expect(textoItem(item('sumiu', 30), mapa)).toBe('Alimento 30 g');
    expect(corpoDoAviso([item('uva', 100), item('banana', 2, 'unidade')], mapa)).toBe('Uva, Rubi 100 g · Banana, prata 2 un');
  });

  it('corpo longo: os itens que cabem inteiros e "+N itens", até 180 caracteres', () => {
    const itens = Array.from({ length: 12 }, (_, i) => item(i % 2 ? 'pao' : 'azeite', i + 1, i % 2 ? 'fatia' : 'colher de sopa'));
    const c = corpoDoAviso(itens, mapa);
    expect(c.length).toBeLessThanOrEqual(180);
    expect(c).toMatch(/ · \+\d+ itens$/);
    expect(c.split(' · ')[0]).toBe('Azeite, de oliva 1 colher de sopa');
    // Um item só, longo demais: cortado no fim de uma palavra, com reticências
    const um = corpoDoAviso([item('longo', 100)], mapa);
    expect(um.length).toBeLessThanOrEqual(180);
    expect(um.endsWith('…')).toBe(true);
    // Primeiro item longo e mais itens: cortado, com o "+N" no fim
    const dois = corpoDoAviso([item('longo', 100), item('uva', 100)], mapa);
    expect(dois.length).toBeLessThanOrEqual(180);
    expect(dois).toMatch(/… · \+1 item$/);
  });

  it('plural da porção', () => {
    expect(pluralPorcao('unidade')).toBe('unidades');
    expect(pluralPorcao('colher de sopa')).toBe('colheres de sopa');
    expect(pluralPorcao('porção')).toBe('porções');
    expect(pluralPorcao('filé')).toBe('filés');
    expect(pluralPorcao('2 ovos')).toBe('2 ovos');
    expect(pluralPorcao('colher de sopa cheia')).toBe('colheres de sopa cheias');
    expect(pluralPorcao('lata drenada')).toBe('latas drenadas');
    expect(pluralPorcao('colher de sopa (ralado)')).toBe('colheres de sopa (ralado)');
  });
});

describe('Banco enxuto da função (supabase/functions/_shared/alimentos.ts)', () => {
  it('está em sincronia com src/dados/alimentos.json (senão: node scripts/gerar_alimentos_funcao.mjs)', () => {
    const esperado = Object.fromEntries((alimentosJson as LinhaAlimento[]).map((l) => [l[0], [l[1], l[8]]]));
    expect(ALIMENTOS).toEqual(esperado);
  });
});
