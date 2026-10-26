import { describe, expect, it } from 'vitest';
import { inicial, linhaPerfil, origemCalibracao, resumoLembrete, resumoNotificacao, resumoRefeicoes } from './perfil-resumo';

describe('resumoNotificacao', () => {
  it('cada estado vira uma palavra com o tom', () => {
    expect(resumoNotificacao('negado')).toEqual({ texto: 'Bloqueadas', tom: 'ruim' });
    expect(resumoNotificacao('ativo')).toEqual({ texto: 'Ativas', tom: 'bom' });
    expect(resumoNotificacao('ativo-sem-servidor').texto).toBe('Permitidas');
    expect(resumoNotificacao('pendente').texto).toBe('Desligadas');
    expect(resumoNotificacao('sem-suporte').texto).toBe('Sem suporte');
    expect(resumoNotificacao('ios-instalar').texto).toBe('Instale o app');
    expect(resumoNotificacao(null).texto).toBe('Verificando…');
  });
});

describe('resumoLembrete', () => {
  it('horário quando ligado, Desligado quando não', () => {
    expect(resumoLembrete({ lembretes_ativos: true, hora_lembrete: '08:00:00' })).toBe('08:00');
    expect(resumoLembrete({ lembretes_ativos: false, hora_lembrete: '08:00' })).toBe('Desligado');
    expect(resumoLembrete({ lembretes_ativos: true, hora_lembrete: '' })).toBe('Ligado');
    expect(resumoLembrete(null)).toBe('Desligado');
  });
});

describe('resumoRefeicoes', () => {
  it('antecedência ou Desligado', () => {
    expect(resumoRefeicoes({ lembrete_refeicoes: true }, 0)).toBe('No horário');
    expect(resumoRefeicoes({ lembrete_refeicoes: true }, 30)).toBe('30 min antes');
    expect(resumoRefeicoes({ lembrete_refeicoes: false }, 30)).toBe('Desligado');
    expect(resumoRefeicoes({}, 0)).toBe('Desligado');
  });
});

describe('linhaPerfil', () => {
  it('altura, idade e sexo', () => {
    expect(linhaPerfil({ altura_cm: 181, data_nascimento: '1995-03-10', sexo: 'Masculino' }, '2026-11-02')).toBe('181 cm · 31 anos · Masculino');
  });
  it('aniversário ainda não chegou no ano', () => {
    expect(linhaPerfil({ altura_cm: 165.5, data_nascimento: '1990-12-01', sexo: 'Feminino' }, '2026-11-02')).toBe('165,5 cm · 35 anos · Feminino');
  });
  it('o que falta fica de fora', () => {
    expect(linhaPerfil({ altura_cm: null, data_nascimento: null, sexo: 'Masculino' }, '2026-11-02')).toBe('Masculino');
    expect(linhaPerfil(null, '2026-11-02')).toBe('');
  });
});

describe('inicial', () => {
  it('primeira letra maiúscula, com acento', () => {
    expect(inicial('pedro')).toBe('P');
    expect(inicial('  Ísis')).toBe('Í');
    expect(inicial('')).toBe('?');
    expect(inicial(undefined)).toBe('?');
  });
});

describe('origemCalibracao', () => {
  it('padrão, manual ou por exame', () => {
    expect(origemCalibracao({ ajuste_gordura: null })).toBe('Padrão');
    expect(origemCalibracao({ ajuste_gordura: 1.5 })).toBe('Manual');
    expect(origemCalibracao({ ajuste_gordura: 1.5, exame_gordura_data: '2026-10-01', exame_gordura_bf: 20 })).toBe('Por exame');
  });
});
