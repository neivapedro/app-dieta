// Regra da próxima dose para as Edge Functions (lembretes e calendário).
// Cópia enxuta de situacaoDoDegrau()/calcularCiclo() em src/lib/ciclo.ts:
// mantenha as duas em sincronia.
// A dose segue a dose REALMENTE aplicada: enquanto o degrau (semanas da fase
// com essa dose) não completa, a próxima é a mesma; ao completar, só sobe com
// a decisão "subir" registrada no app.

export interface Fase {
  nome: string;
  semanas: number;
  dose_mg: number;
}

export interface Decisao {
  apos_aplicacao: number;
  dose_mg: number;
  fase_indice: number | null;
  escolha: string;
  bloco_inicio?: string | null;
}

export type Estado = 'inicio' | 'em_curso' | 'pendente' | 'subir' | 'fim_plano' | 'fora_do_plano';

export interface DoseFutura {
  dose_mg: number;
  /** null = dose fora do plano */
  fase_indice: number | null;
  /** Depende de subir de fase (ainda não decidido) */
  hipotese: boolean;
}

const EPS = 1e-9;
const mesma = (a: number, b: number) => Math.abs(a - b) <= 0.01 + EPS;

function achar(fases: Fase[], dose: number, de: number, ate = fases.length): number | null {
  for (let i = Math.max(de, 0); i < ate; i++) if (mesma(fases[i].dose_mg, dose)) return i;
  return null;
}

interface Degrau {
  dose: number;
  aplicacoes: number;
  primeira: number | null;
  ultima: number | null;
  semanas: number;
  confirmada: boolean;
}

/** Blocos de doses iguais seguidas, cada um encaixado numa fase (ou fora do plano). */
export function degraus(fases: Fase[], aplicacoes: { data: string; dose_mg: number }[], decisoes: Decisao[] = []): Degrau[] {
  const blocos: { dose: number; aplicacoes: number; inicio: string }[] = [];
  for (const a of aplicacoes) {
    const d = Number(a.dose_mg);
    const ult = blocos[blocos.length - 1];
    if (ult && mesma(ult.dose, d)) ult.aplicacoes++;
    else blocos.push({ dose: d, aplicacoes: 1, inicio: a.data });
  }
  let busca = 0;
  return blocos.map((b) => {
    let i = achar(fases, b.dose, busca) ?? achar(fases, b.dose, 0, busca);
    let confirmada = false;
    if (i === null) {
      const c = [...decisoes].reverse().find((x) => x.escolha === 'confirmar_fase' && x.bloco_inicio === b.inicio && mesma(Number(x.dose_mg), b.dose));
      if (c && c.fase_indice !== null && c.fase_indice >= 0 && c.fase_indice < fases.length) {
        i = c.fase_indice;
        confirmada = true;
      }
    }
    if (i === null) return { dose: b.dose, aplicacoes: b.aplicacoes, primeira: null, ultima: null, semanas: 0, confirmada };
    let j = i;
    let semanas = fases[i].semanas;
    if (!confirmada) while (j + 1 < fases.length && mesma(fases[j + 1].dose_mg, fases[i].dose_mg)) semanas += fases[++j].semanas;
    busca = j;
    return { dose: b.dose, aplicacoes: b.aplicacoes, primeira: i, ultima: j, semanas, confirmada };
  });
}

/** Fase da p-ésima aplicação dentro do degrau (1 = primeira). */
export function faseNoDegrau(fases: Fase[], d: Degrau, p: number): number | null {
  if (d.primeira === null || d.ultima === null) return null;
  let acc = 0;
  for (let f = d.primeira; f <= d.ultima; f++) {
    acc += fases[f].semanas;
    if (p <= acc) return f;
  }
  return d.ultima;
}

/** Próxima dose oficial e as doses que o plano ainda tem (as que dependem de subir são hipótese). */
export function planoDeDoses(
  fases: Fase[],
  aplicacoes: { data: string; dose_mg: number }[],
  decisoes: Decisao[] = [],
): { estado: Estado; proxima: DoseFutura; resto: DoseFutura[] } {
  const resto: DoseFutura[] = [];
  const inteira = (f: number, hipotese: boolean) => {
    for (let p = 0; p < fases[f].semanas; p++) resto.push({ dose_mg: fases[f].dose_mg, fase_indice: f, hipotese });
  };
  const depois = (de: number) => {
    for (let f = de; f < fases.length; f++) inteira(f, true);
  };
  if (!aplicacoes.length) {
    inteira(0, false);
    depois(1);
    return { estado: 'inicio', proxima: resto[0], resto };
  }
  const lista = degraus(fases, aplicacoes, decisoes);
  const d = lista[lista.length - 1];
  if (d.ultima === null) {
    const conhecida = [...lista].reverse().find((x) => x.ultima !== null)?.ultima ?? -1;
    depois(conhecida + 1);
    return { estado: 'fora_do_plano', proxima: { dose_mg: d.dose, fase_indice: null, hipotese: false }, resto };
  }
  const doseDe = (f: number) => (d.confirmada ? d.dose : fases[f].dose_mg);
  if (d.aplicacoes < d.semanas) {
    for (let p = d.aplicacoes + 1; p <= d.semanas; p++) {
      const f = faseNoDegrau(fases, d, p)!;
      resto.push({ dose_mg: doseDe(f), fase_indice: f, hipotese: false });
    }
    depois(d.ultima + 1);
    return { estado: 'em_curso', proxima: resto[0], resto };
  }
  if (d.ultima === fases.length - 1) return { estado: 'fim_plano', proxima: { dose_mg: doseDe(d.ultima), fase_indice: d.ultima, hipotese: false }, resto };
  const n = aplicacoes.length;
  const subir = decisoes.some((x) => x.escolha === 'subir' && x.apos_aplicacao === n && mesma(Number(x.dose_mg), d.dose));
  if (subir) {
    inteira(d.ultima + 1, false);
    depois(d.ultima + 2);
    return { estado: 'subir', proxima: resto[0], resto };
  }
  depois(d.ultima + 1);
  return { estado: 'pendente', proxima: { dose_mg: doseDe(d.ultima), fase_indice: d.ultima, hipotese: false }, resto };
}
