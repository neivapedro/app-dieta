// Gera supabase/functions/_shared/alimentos.ts: o banco enxuto que a função
// "enviar-lembretes" usa no texto do lembrete das refeições (só nome e porções,
// ~30 KB, em vez do alimentos.json inteiro com macros e apelidos, ~65 KB).
// Rode depois de mudar src/dados/alimentos.json:
//   node scripts/gerar_alimentos_funcao.mjs
// O teste src/lib/lembreteRefeicoes.test.ts falha se os dois saírem de sincronia.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const linhas = JSON.parse(readFileSync(resolve(raiz, 'src/dados/alimentos.json'), 'utf8'));

// Linha do JSON: [id, nome, grupo, prot, carb, gord, fibra, animal, porcoes, fonte, apelidos, oculto]
// Os ocultos (versões cruas) ficam: planos antigos ainda podem usá-los.
const corpo = linhas.map(([id, nome, , , , , , , porcoes]) => `  ${JSON.stringify(id)}: [${JSON.stringify(nome)}, ${JSON.stringify(porcoes)}],`).join('\n');

const saida = `// GERADO por scripts/gerar_alimentos_funcao.mjs a partir de src/dados/alimentos.json: não edite à mão.
// Banco enxuto da função "enviar-lembretes" (texto do lembrete das refeições): id → [nome, porções [nome, g]].
export const ALIMENTOS: Record<string, readonly [string, readonly (readonly [string, number])[]]> = {
${corpo}
};
`;
writeFileSync(resolve(raiz, 'supabase/functions/_shared/alimentos.ts'), saida);
console.log(`${linhas.length} alimentos em supabase/functions/_shared/alimentos.ts`);
