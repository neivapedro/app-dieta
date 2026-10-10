import { describe, expect, it } from 'vitest';
import { ehErroDeRede, ehSessaoExpirada, traduzirErro } from './erros';

describe('Erros', () => {
  it('falha temporária do servidor espera na fila (não é erro de dados)', () => {
    expect(ehErroDeRede({ message: 'Could not query the database for the schema cache', code: 'PGRST002', status: 503 })).toBe(true);
    expect(ehErroDeRede(new Error('<html> <head><title>502 Bad Gateway</title></head></html>'))).toBe(true);
    expect(ehErroDeRede(new Error('error code: 522'))).toBe(true);
    expect(ehErroDeRede(new Error('duplicate key value violates unique constraint'))).toBe(false);
  });
  it('sessão vencida e mensagens sem HTML cru', () => {
    expect(ehSessaoExpirada(new Error('JWT expired'))).toBe(true);
    expect(traduzirErro(new Error('<!DOCTYPE html><p>erro</p>'))).not.toMatch(/</);
    expect(traduzirErro(new Error('invalid input syntax for type uuid: "pendente:2026-10-17"'))).not.toMatch(/uuid/);
  });
});
