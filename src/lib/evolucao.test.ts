import { describe, expect, it } from 'vitest';
import { analisarFases, analisarGeral, compararFases, composicaoPorFase, serieDePeso } from './analise';
import { calcularCiclo, cicloPadrao } from './ciclo';
import { chanceMeta, projecaoNoRitmo, qualidadePerda, reta, tendenciaMedidas, textoQualidade } from './conferencia';
import { somarDias } from './datas';
import { corVariacao } from './formato';
import {
  ajusteDoPerfil,
  cenariosPesoMeta,
  cinturaAlvoRca,
  cinturaNecessaria,
  composicao,
  faixaRca,
  historicoComposicao,
  MDC,
  percentualGordura,
  percentualGorduraBruto,
  rca,
  rfm,
  type Composicao,
} from './gordura';
import {
  acaoQualidade,
  diasCurtos,
  dietaNoPeriodo,
  efeitosNoPeriodo,
  faltasNoPeriodo,
  mostrarAtalhoResumo,
  sugestaoSemana,
  textoDietaSemana,
} from './semana';
import type { Aplicacao, Ciclo, Medida, RegistroDiario, TreinoDia } from './tipos';

const med = (data: string, cintura: number, peso: number, extra: Partial<Medida> = {}): Medida => ({
  id: data,
  data,
  altura_cm: 181,
  pescoco_cm: 41,
  cintura_cm: cintura,
  quadril_cm: null,
  peso_kg: peso,
  ...extra,
});

const comp = (dia: number, gorda: number, magra: number, extra: Partial<Composicao> = {}): Composicao => ({
  data: somarDias('2026-09-07', dia),
  peso_kg: gorda + magra,
  bf: (gorda / (gorda + magra)) * 100,
  massa_gorda_kg: gorda,
  massa_magra_kg: magra,
  cintura_cm: 97 - dia * 0.1,
  pescoco_cm: 41,
  quadril_cm: null,
  ...extra,
});

describe('Ajuste de calibração do % de gordura', () => {
  it('padrão mantém os números de hoje: +2 no masculino, 0 no feminino', () => {
    const bruto = percentualGorduraBruto('Masculino', 182, 41, 98, null)!;
    expect(percentualGordura('Masculino', 182, 41, 98, null)).toBeCloseTo(bruto + 2, 10);
    expect(percentualGordura('Feminino', 165, 33, 80, 100)).toBeCloseTo(percentualGorduraBruto('Feminino', 165, 33, 80, 100)!, 10);
    expect(ajusteDoPerfil({ sexo: 'Masculino', ajuste_gordura: null })).toBe(2);
    expect(ajusteDoPerfil({ sexo: 'Feminino' })).toBe(0);
    expect(ajusteDoPerfil({ sexo: 'Masculino', ajuste_gordura: -1.5 })).toBe(-1.5);
  });
  it('ajuste do perfil e altura do perfil entram na composição', () => {
    const m = med('2026-10-12', 98, 96.5, { altura_cm: 182 });
    const padrao = composicao(m, 'Masculino');
    const calibrado = composicao(m, 'Masculino', { ajuste: 0 });
    expect(padrao.bf! - calibrado.bf!).toBeCloseTo(2, 10);
    // Altura do perfil (181) vale sobre a gravada na medição (182)
    const comPerfil = composicao(m, 'Masculino', { altura_cm: 181 });
    expect(comPerfil.bf).toBeCloseTo(percentualGordura('Masculino', 181, 41, 98, null)!, 10);
    expect(historicoComposicao([m], 'Masculino', { altura_cm: 181, ajuste: 2 })[0].bf).toBeCloseTo(comPerfil.bf!, 10);
  });
});

describe('Réguas de conferência', () => {
  it('relação cintura/altura e faixas', () => {
    expect(rca(96.4, 181)).toBeCloseTo(0.5326, 3);
    expect(faixaRca(0.49)).toBe('saudavel');
    expect(faixaRca(0.5)).toBe('aumentada');
    expect(faixaRca(0.59)).toBe('aumentada');
    expect(faixaRca(0.6)).toBe('alta');
    expect(cinturaAlvoRca(181)).toBe(90.5);
    expect(rca(null, 181)).toBeNull();
  });
  it('RFM homem e mulher', () => {
    expect(rfm('Masculino', 181, 96.4)).toBeCloseTo(64 - (20 * 181) / 96.4, 10);
    expect(rfm('Feminino', 165, 80)).toBeCloseTo(76 - (20 * 165) / 80, 10);
  });
  it('cintura necessária inverte a US Navy (com o ajuste) e arredonda a 0,5 cm', () => {
    for (const bf of [15, 18, 24]) {
      const c = cinturaNecessaria('Masculino', 181, 41, bf)!;
      expect((c * 2) % 1).toBe(0);
      expect(Math.abs(percentualGordura('Masculino', 181, 41, c, null)! - bf)).toBeLessThan(0.4);
    }
    // Conta do Pedro: pescoço 41, 24% ≈ 96,4 cm e 15% ≈ 84,3 cm
    expect(cinturaNecessaria('Masculino', 181, 41, 24)).toBe(96.5);
    expect(cinturaNecessaria('Masculino', 181, 41, 15)).toBe(84.5);
    // Sem o +2 a mesma meta pede cintura maior
    expect(cinturaNecessaria('Masculino', 181, 41, 15, 0)!).toBeGreaterThan(84.5);
    // Feminino usa o quadril informado
    const cf = cinturaNecessaria('Feminino', 165, 33, 28, 0, 100)!;
    expect(Math.abs(percentualGordura('Feminino', 165, 33, cf, 100)! - 28)).toBeLessThan(0.4);
    expect(cinturaNecessaria('Feminino', 165, 33, 28, 0, null)).toBeNull();
  });
  it('cenários do peso da meta: 0%, 25% e 40% da perda em massa magra', () => {
    const [c0, c25, c40] = cenariosPesoMeta(72.6, 95.5, 15);
    expect(c0.peso_kg).toBeCloseTo(85.4, 1);
    expect(c25.peso_kg).toBeCloseTo(81.2, 1);
    expect(c40.peso_kg).toBeCloseTo(76.4, 1);
    expect(c25.massa_magra_kg).toBeCloseTo(69.0, 1);
  });
});

describe('Mínima mudança detectável', () => {
  it('variação menor que o limiar fica neutra', () => {
    expect(corVariacao(-2.0, true, MDC.cintura_cm)).toBe('');
    expect(corVariacao(-2.5, true, MDC.cintura_cm)).toBe('bom');
    expect(corVariacao(-0.8, false, MDC.massa_magra_kg)).toBe('');
    expect(corVariacao(-3, false, MDC.massa_magra_kg)).toBe('ruim');
    expect(corVariacao(0.1, true)).toBe('ruim');
  });
});

describe('Tendências sem medições atípicas', () => {
  it('a medição atípica sai da tendência', () => {
    const lista = [0, 7, 14, 21, 28].map((d) => comp(d, 23 - (d / 7) * 0.5, 72.5));
    lista.push(comp(35, 28, 72.5, { atipica: true }));
    expect(tendenciaMedidas(lista)!.gorda_semana).toBeCloseTo(-0.5, 6);
  });
  it('reta() devolve as médias, Sxx e o desvio dos resíduos', () => {
    const r = reta([0, 7, 14], [10, 9, 8.5]);
    expect(r.n).toBe(3);
    expect(r.mx).toBe(7);
    expect(r.sxx).toBe(98);
    expect(r.inclinacao).toBeCloseTo(-1.5 / 14, 10);
    expect(r.s).toBeGreaterThan(0);
  });
});

describe('Qualidade da perda', () => {
  it('fração da perda em gordura e massa magra pelas últimas 4 medições', () => {
    // 0,7 kg/sem de gordura e 0,3 kg/sem de magra
    const lista = [0, 7, 14, 21, 28].map((d) => comp(d, 23 - (d / 7) * 0.7, 72.5 - (d / 7) * 0.3));
    const q = qualidadePerda(lista)!;
    expect(q.medicoes).toBe(4);
    expect(q.gordura).toBeCloseTo(0.7, 6);
    expect(q.magra).toBeCloseTo(0.3, 6);
    expect(q.aviso).toBe(true);
    expect(textoQualidade(q)).toBe('70% gordura · 30% massa magra');
  });
  it('perda boa e no ritmo: sem aviso', () => {
    const lista = [0, 7, 14, 21].map((d) => comp(d, 23 - (d / 7) * 0.6, 72.5 - (d / 7) * 0.05));
    const q = qualidadePerda(lista)!;
    expect(q.aviso).toBe(false);
    expect(q.ritmo_pct).toBeLessThan(1);
  });
  it('ritmo acima de 1%/sem avisa mesmo com perda toda de gordura', () => {
    const lista = [0, 7, 14, 21].map((d) => comp(d, 30 - (d / 7) * 1.2, 70 + (d / 7) * 0.05));
    const q = qualidadePerda(lista)!;
    expect(q.ritmo_pct).toBeGreaterThan(1);
    expect(q.aviso).toBe(true);
    expect(textoQualidade(q)).toMatch(/toda a perda foi gordura/);
  });
  it('peso parado não divide nada; poucos dados = null', () => {
    const parado = [0, 7, 14, 21].map((d) => comp(d, 23, 72));
    expect(qualidadePerda(parado)!.sem_perda).toBe(true);
    expect(qualidadePerda(parado)!.aviso).toBe(false);
    expect(qualidadePerda([0, 7].map((d) => comp(d, 23, 72)))).toBeNull();
    expect(qualidadePerda([0, 3, 6].map((d) => comp(d, 23, 72)))).toBeNull();
  });
});

describe('Projeção "No ritmo"', () => {
  const lista = [0, 7, 14, 21, 28, 35, 42].map((d) => comp(d, 23 - (d / 7) * 0.5, 72.5 - (d / 7) * 0.1));
  const hoje = somarDias('2026-09-07', 42);
  it('só a partir da semana 6, com 5 medições cobrindo 28 dias', () => {
    expect(projecaoNoRitmo(lista, hoje, '2027-03-01', 5)).toBeNull();
    expect(projecaoNoRitmo(lista.slice(0, 4), hoje, '2027-03-01', 8)).toBeNull();
    expect(projecaoNoRitmo(lista, hoje, '2027-03-01', 6)).not.toBeNull();
  });
  it('horizonte: hoje + 8 semanas ou o fim, o que vier antes; parte da reta', () => {
    const p = projecaoNoRitmo(lista, hoje, '2027-03-01', 7)!;
    expect(p.ate_o_fim).toBe(false);
    expect(p.horizonte).toBe(somarDias(hoje, 56));
    // Reta perfeita: 8 semanas × −0,5 kg de gordura, faixa de largura zero
    expect(p.valores.massa_gorda_kg.valor).toBeCloseTo(23 - 3 - 4, 6);
    expect(p.valores.massa_gorda_kg.max - p.valores.massa_gorda_kg.min).toBeCloseTo(0, 6);
    const curto = projecaoNoRitmo(lista, hoje, somarDias(hoje, 14), 7)!;
    expect(curto.ate_o_fim).toBe(true);
    expect(curto.horizonte).toBe(somarDias(hoje, 14));
  });
  it('faixa com ruído e chance em três estados', () => {
    const ruido = lista.map((c, i) => ({ ...c, cintura_cm: c.cintura_cm + (i % 2 ? 0.8 : -0.8) }));
    const p = projecaoNoRitmo(ruido, hoje, '2027-03-01', 7)!;
    const v = p.valores.cintura_cm;
    expect(v.max).toBeGreaterThan(v.valor);
    expect(chanceMeta(v, v.max + 1, true)).toBe('provavel');
    expect(chanceMeta(v, v.min - 1, true)).toBe('improvavel');
    expect(chanceMeta(v, v.valor, true)).toBe('possivel');
    expect(chanceMeta(v, v.min - 1, false)).toBe('provavel');
  });
});

describe('Fases por regressão', () => {
  const ciclo: Ciclo = { id: 'c1', ...cicloPadrao('2026-10-08') };
  const ap = (data: string): Aplicacao => ({ id: data, ciclo_id: 'c1', data, dose_mg: 1.25, local: null, observacoes: null });

  it('menos de 3 pontos ou de 14 dias: poucos dados, sem kg/sem', () => {
    const medidas = [med('2026-10-07', 98, 96.5), med('2026-10-20', 97, 95.2)];
    const r = calcularCiclo(ciclo, ['2026-10-08', '2026-10-15'].map(ap), [], '2026-10-21');
    const f = analisarFases(r, serieDePeso([], medidas), [], '2026-10-21');
    expect(f[0].poucos_dados).toBe(true);
    expect(f[0].kg_por_semana).toBeNull();
    expect(f[0].variacao_kg).toBeCloseTo(-1.3, 6);
  });
  it('medição atípica sai do ritmo da fase', () => {
    const seg = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
    const medidas = seg.map((d, i) => med(d, 98, 96 - 0.5 * i, i === 3 ? { peso_kg: 99, atipica: true } : {}));
    const r = calcularCiclo(ciclo, ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'].map(ap), [], '2026-11-03');
    const f = analisarFases(r, serieDePeso([], medidas), [], '2026-11-03');
    expect(f[0].kg_por_semana).toBeCloseTo(-0.5, 6);
    expect(f[0].erro_semana).toBeGreaterThan(0);
  });
  it('comparação entre fases pela diferença mínima detectável', () => {
    expect(compararFases({ kg_por_semana: -0.9, erro_semana: 0.2 }, { kg_por_semana: -0.5, erro_semana: 0.2 })!.estado).toBe('parecida');
    expect(compararFases({ kg_por_semana: -0.3, erro_semana: 0.05 }, { kg_por_semana: -0.9, erro_semana: 0.05 })!.estado).toBe('mais_rapida');
    expect(compararFases({ kg_por_semana: -0.9, erro_semana: 0.05 }, { kg_por_semana: -0.3, erro_semana: 0.05 })!.estado).toBe('mais_lenta');
    expect(compararFases({ kg_por_semana: null, erro_semana: null }, { kg_por_semana: -0.3, erro_semana: 0.05 })).toBeNull();
  });
  it('composição por fase: % magra pela regressão; poucos dados sem gordura/sem', () => {
    const seg = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
    // A cintura cai 1 cm/sem e o peso 1 kg/sem
    const medidas = seg.map((d, i) => med(d, 98 - i, 96 - i));
    const comps = historicoComposicao(medidas, 'Masculino');
    const r = calcularCiclo(ciclo, ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'].map(ap), [], '2026-11-03');
    const fases = analisarFases(r, serieDePeso([], medidas), [], '2026-11-03');
    const c = composicaoPorFase(fases, comps, null, '2026-11-03');
    expect(c[0].poucos_dados).toBe(false);
    expect(c[0].magra_pct).not.toBeNull();
    expect(c[0].magra_pct!).toBeGreaterThan(0);
    expect(c[0].magra_pct!).toBeLessThan(0.5);
    const poucos = composicaoPorFase(fases, comps.slice(0, 2), null, '2026-11-03');
    expect(poucos[0].gorda_semana).toBeNull();
    expect(poucos[0].poucos_dados).toBe(true);
  });
});

describe('Peso atual de uma fonte só', () => {
  it('com 2+ medições, início e agora vêm das medições (não do Diário)', () => {
    const medidas = [med('2026-10-05', 98, 96.5), med('2026-10-26', 96, 94)];
    const diario: RegistroDiario[] = [{ id: 'd', data: '2026-10-28', peso_kg: 95.4, nausea: null, observacoes: null }];
    const g = analisarGeral('2026-10-08', serieDePeso(diario, medidas), historicoComposicao(medidas, 'Masculino'), '2026-10-29');
    expect(g.peso_inicial!.peso_kg).toBe(96.5);
    expect(g.peso_atual!.peso_kg).toBe(94);
    expect(g.variacao_kg).toBeCloseTo(-2.5, 6);
  });
  it('medição atípica não vira o "agora"', () => {
    const medidas = [med('2026-10-05', 98, 96.5), med('2026-10-19', 96, 94.5), med('2026-10-26', 99, 95.5, { atipica: true })];
    const g = analisarGeral('2026-10-08', serieDePeso([], medidas), historicoComposicao(medidas, 'Masculino'), '2026-10-29');
    expect(g.medida_atual!.data).toBe('2026-10-19');
    expect(g.peso_atual!.peso_kg).toBe(94.5);
  });
  it('com menos de 2 medições, usa as pesagens do Diário', () => {
    const medidas = [med('2026-10-05', 98, 96.5)];
    const diario: RegistroDiario[] = [{ id: 'd', data: '2026-10-28', peso_kg: 95.4, nausea: null, observacoes: null }];
    const g = analisarGeral('2026-10-08', serieDePeso(diario, medidas), historicoComposicao(medidas, 'Masculino'), '2026-10-29');
    expect(g.peso_atual!.peso_kg).toBe(95.4);
  });
});

describe('Resumo da semana', () => {
  const reg = (data: string, extra: Partial<RegistroDiario>): RegistroDiario => ({ id: data, data, peso_kg: null, nausea: null, observacoes: null, ...extra });

  it('"segui o plano?" mostra os "não" e os dias sem resposta', () => {
    const diario = [
      reg('2026-10-05', { dieta_seguida: 'parcial' }),
      reg('2026-10-06', { dieta_seguida: 'nao' }),
      reg('2026-10-07', { dieta_seguida: 'nao' }),
      reg('2026-10-08', { nausea: 2 }),
    ];
    const d = dietaNoPeriodo(diario, '2026-10-05', '2026-10-11');
    expect(textoDietaSemana(d)).toBe('0 sim · 1 em parte · 2 não (3 de 7)');
  });
  it('efeitos na semana', () => {
    const diario = [reg('2026-10-05', { nausea: 1, vomito: true }), reg('2026-10-06', { nausea: 3, intestino_preso: true }), reg('2026-10-07', { diarreia: false })];
    const e = efeitosNoPeriodo(diario, '2026-10-05', '2026-10-11');
    expect(e).toMatchObject({ registros: 3, nausea_media: 2, nausea_max: 3, vomito: 1, intestino_preso: 1, diarreia: 0 });
  });
  it('dias em que faltou treino ou cardio, só dentro do projeto', () => {
    const t = (data: string, treino: boolean, cardio: boolean): TreinoDia => ({ id: data, data, treino, cardio, corrida_km: null, corrida_seg: null });
    const treinos = [t('2026-10-07', true, true), t('2026-10-08', false, true), t('2026-10-09', true, false)];
    const f = faltasNoPeriodo(treinos, '2026-10-05', '2026-10-11', '2026-10-07', '2026-12-31');
    expect(f.dias).toBe(5);
    expect(diasCurtos(f.treino)).toBe('Qui, Sáb e Dom');
    expect(diasCurtos(f.cardio)).toBe('Sex, Sáb e Dom');
  });
  it('atalho do resumo no Início: segunda e terça, com a medição da semana feita', () => {
    expect(mostrarAtalhoResumo('2026-10-12', '2026-10-12', '2026-10-12')).toBe(true);
    expect(mostrarAtalhoResumo('2026-10-13', '2026-10-12', '2026-10-12')).toBe(true);
    expect(mostrarAtalhoResumo('2026-10-14', '2026-10-12', '2026-10-12')).toBe(false);
    expect(mostrarAtalhoResumo('2026-10-12', '2026-10-05', '2026-10-12')).toBe(false);
    expect(mostrarAtalhoResumo('2026-10-12', null, '2026-10-12')).toBe(false);
  });
});

describe('Sugestão da semana', () => {
  const tend = (peso_semana: number, magra_semana: number) => ({
    de: '2026-09-07',
    ate: '2026-10-05',
    medicoes: 5,
    gorda_semana: peso_semana - magra_semana,
    magra_semana,
    peso_semana,
    cintura_semana: -0.5,
    bf_semana: -0.3,
    deficit_dia: 500,
    ic95_dia: 100,
  });
  // 28 dias da janela, todos respondidos
  const dias = (valor: 'sim' | 'parcial' | 'nao', n = 28, resto: 'sim' | 'parcial' | 'nao' = 'sim'): RegistroDiario[] =>
    Array.from({ length: 28 }, (_, i) => ({ id: String(i), data: somarDias('2026-09-07', i), peso_kg: null, nausea: null, observacoes: null, dieta_seguida: i < n ? valor : resto }));

  it('sem tendência ou com poucos dias respondidos: sem sugestão', () => {
    expect(sugestaoSemana(null, 95, []).tipo).toBe('sem_dados');
    expect(sugestaoSemana(tend(-0.5, 0), 95, dias('sim').slice(0, 20)).tipo).toBe('sem_dados');
  });
  it('seguiu menos de 80%: seguir o plano antes de mexer', () => {
    expect(sugestaoSemana(tend(-0.2, 0), 95, dias('nao', 10)).tipo).toBe('seguir_plano');
  });
  it('rápido com massa magra caindo: reduzir; lento seguindo bem: aumentar; senão manter', () => {
    expect(sugestaoSemana(tend(-1.2, -0.2), 95, dias('sim')).tipo).toBe('reduzir');
    expect(sugestaoSemana(tend(-1.2, 0.05), 95, dias('sim')).tipo).toBe('manter');
    expect(sugestaoSemana(tend(-0.3, 0), 95, dias('sim')).tipo).toBe('aumentar');
    expect(sugestaoSemana(tend(-0.7, -0.1), 95, dias('sim')).tipo).toBe('manter');
    // Metade "em parte" = 50% seguido
    expect(sugestaoSemana(tend(-0.7, 0), 95, dias('parcial', 28)).tipo).toBe('seguir_plano');
  });
});

describe('Ação ligada à qualidade da perda', () => {
  const q = qualidadePerda([0, 7, 14, 21].map((d) => comp(d, 23 - (d / 7) * 0.6, 72.5 - (d / 7) * 0.4)))!;
  const base = { refeicoesAbaixo: [] as string[], alvoRefeicao: 29, ptnPlano: 150, ptnMeta: 150, treino: null };
  it('refeições abaixo do alvo de proteína → Abrir Dieta', () => {
    const a = acaoQualidade(q, { ...base, refeicoesAbaixo: ['Café', 'Lanche'] })!;
    expect(a.texto).toBe('Café e Lanche abaixo de 29 g de proteína animal');
    expect(a.para).toBe('/dieta');
  });
  it('proteína do dia, depois treino', () => {
    expect(acaoQualidade(q, { ...base, ptnPlano: 120 })!.texto).toMatch(/120 g de 150 g/);
    expect(acaoQualidade(q, { ...base, treino: 0.6 })!.para).toBe('/treino');
  });
  it('sem aviso, sem ação', () => {
    const boa = qualidadePerda([0, 7, 14, 21].map((d) => comp(d, 23 - (d / 7) * 0.6, 72.5)))!;
    expect(acaoQualidade(boa, { ...base, refeicoesAbaixo: ['Café'] })).toBeNull();
  });
});
