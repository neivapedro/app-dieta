import { describe, expect, it } from 'vitest';
import { travarRolagem, travasAbertas } from './trava-rolagem';

describe('travarRolagem', () => {
  it('duas camadas soltas na ordem "errada" (a de fora primeiro) deixam a página rolar', () => {
    const corpo = { style: { overflow: '' } };
    const soltarFora = travarRolagem(corpo);
    const soltarDentro = travarRolagem(corpo);
    expect(corpo.style.overflow).toBe('hidden');
    soltarFora();
    expect(corpo.style.overflow).toBe('hidden');
    soltarDentro();
    expect(corpo.style.overflow).toBe('');
    expect(travasAbertas()).toBe(0);
  });
  it('soltar duas vezes não conta em dobro; um "hidden" esquecido não vira o original', () => {
    const corpo = { style: { overflow: 'hidden' } };
    const a = travarRolagem(corpo);
    const b = travarRolagem(corpo);
    a();
    a();
    expect(corpo.style.overflow).toBe('hidden');
    b();
    expect(corpo.style.overflow).toBe('');
  });
});
