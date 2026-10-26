// Textos curtos da lista de ajustes do Perfil (o valor à direita de cada linha)
import { idade } from './dieta';
import { num } from './formato';
import type { EstadoNotificacao } from './notificacoes';
import type { Perfil } from './tipos';

export type Tom = 'bom' | 'aviso' | 'ruim' | 'neutro';

/** Estado das notificações deste aparelho em uma ou duas palavras, com a cor do ponto. */
export function resumoNotificacao(estado: EstadoNotificacao | null): { texto: string; tom: Tom } {
  switch (estado) {
    case null:
      return { texto: 'Verificando…', tom: 'neutro' };
    case 'ativo':
      return { texto: 'Ativas', tom: 'bom' };
    case 'ativo-sem-servidor':
      return { texto: 'Permitidas', tom: 'aviso' };
    case 'pendente':
      return { texto: 'Desligadas', tom: 'neutro' };
    case 'negado':
      return { texto: 'Bloqueadas', tom: 'ruim' };
    case 'ios-instalar':
      return { texto: 'Instale o app', tom: 'aviso' };
    case 'sem-suporte':
      return { texto: 'Sem suporte', tom: 'neutro' };
  }
}

/** Lembrete de aplicação: o horário, ou "Desligado". */
export function resumoLembrete(perfil: Pick<Perfil, 'lembretes_ativos' | 'hora_lembrete'> | null | undefined): string {
  if (!perfil?.lembretes_ativos) return 'Desligado';
  return /^\d{2}:\d{2}/.test(perfil.hora_lembrete ?? '') ? perfil.hora_lembrete.slice(0, 5) : 'Ligado';
}

/** Lembrete das refeições: antecedência, ou "Desligado". */
export function resumoRefeicoes(perfil: Pick<Perfil, 'lembrete_refeicoes' | 'lembrete_refeicoes_antes'> | null | undefined, antes: number): string {
  if (perfil?.lembrete_refeicoes !== true) return 'Desligado';
  return antes === 0 ? 'No horário' : `${antes} min antes`;
}

/** Linha do cabeçalho: "181 cm · 31 anos · Masculino" (o que faltar fica de fora). */
export function linhaPerfil(perfil: Pick<Perfil, 'altura_cm' | 'data_nascimento' | 'sexo'> | null | undefined, hoje: string): string {
  if (!perfil) return '';
  const partes: string[] = [];
  if (perfil.altura_cm) partes.push(`${num(perfil.altura_cm, Number.isInteger(perfil.altura_cm) ? 0 : 1)} cm`);
  const anos = idade(perfil.data_nascimento, hoje);
  if (anos !== null && anos >= 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (perfil.sexo) partes.push(perfil.sexo);
  return partes.join(' · ');
}

/** Inicial do avatar (primeira letra do nome, maiúscula). */
export function inicial(nome: string | null | undefined): string {
  const letra = (nome ?? '').trim().match(/\p{L}|\p{N}/u)?.[0];
  return letra ? letra.toLocaleUpperCase('pt-BR') : '?';
}

/** De onde vem o ajuste do % de gordura. */
export function origemCalibracao(perfil: Pick<Perfil, 'ajuste_gordura' | 'exame_gordura_data' | 'exame_gordura_bf'> | null | undefined): string {
  if (perfil?.exame_gordura_data && perfil.exame_gordura_bf != null) return 'Por exame';
  return perfil?.ajuste_gordura === null || perfil?.ajuste_gordura === undefined ? 'Padrão' : 'Manual';
}
