// Galeria de conquistas: a conta (a partir dos dados do app), a medalha em SVG e o
// atalho "Conquistas · N de M" usado no Início, na Análise e no Relatório final.
import '../estilos/conquistas.css';
import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { useMetaAgua, useTreino } from '../dados/useTreino';
import { montarGaleria, type ConquistaGaleria, type Galeria } from '../lib/conquistas-galeria';
import { num, pct } from '../lib/formato';
import { useTarefasHoje } from './inicio';
import { Icone } from './ui';

/** A galeria com os dados da conta (o checklist de hoje é o mesmo do cartão do Início). */
export function useGaleria(): Galeria {
  const { ciclo, aplicacoes, diario, medidas, treinos, perfil } = useDados();
  const { hoje, sexo, composicoes, resumo, fimRemedio } = useCalculos();
  const proj = useProjeto();
  const t = useTreino();
  const metaAguaDe = useMetaAgua();
  const p = resumo?.proxima ?? null;
  const h = useTarefasHoje(
    resumo && proj && !proj.pos ? { devida: !!p && (p.situacao === 'hoje' || p.situacao === 'atrasada'), feitaHoje: proj.ultimaDose === hoje, texto: '' } : null,
  );
  const feitas = h.progresso.feitas;
  const total = h.progresso.total;
  const comDieta = h.comDieta;
  return useMemo(
    () =>
      montarGaleria({
        hoje,
        sexo,
        ciclo,
        aplicacoes,
        diario,
        medidas,
        composicoes,
        metas: perfil?.metas_projeto ?? null,
        treinos: t ? treinos : null,
        periodosTreino: t ? [t.projeto, ...(t.placarPos ? [{ inicio: t.inicio, fim: t.fim }] : [])] : undefined,
        comDieta,
        metaAgua: (d) => metaAguaDe(d).meta,
        checklistHoje: { feitas, total },
        fimRemedio,
      }),
    [hoje, sexo, ciclo, aplicacoes, diario, medidas, composicoes, perfil, t, treinos, comDieta, metaAguaDe, feitas, total, fimRemedio],
  );
}

const centro = 36;

/** Hexágono com os vértices em cima e embaixo (os cantos arredondam pelo traço). */
function hexagono(r: number): string {
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return `${(centro + r * Math.cos(a)).toFixed(2)},${(centro + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
}

/**
 * Medalha: ganha = degradê da marca com brilho e aro; bloqueada = contorno apagado
 * com o anel de progresso em volta. O ícone (ou o selo "7", "5K") fica no centro.
 */
export function Medalha({ c, tamanho = 64 }: { c: ConquistaGaleria; tamanho?: number }) {
  const id = `md${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const hex = c.forma === 'hexagono';
  const rAnel = 33;
  const volta = 2 * Math.PI * rAnel;
  const f = c.progresso?.fracao ?? 0;
  return (
    <span className={`medalha ${c.ganha ? 'ganha' : 'bloqueada'} ${hex ? 'hex' : 'circ'}`} style={{ width: tamanho, height: tamanho, ['--tam' as string]: `${tamanho}px` }} aria-hidden="true">
      <svg viewBox="0 0 72 72">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--marca-a)' }} />
            <stop offset="0.52" style={{ stopColor: 'var(--marca-m)' }} />
            <stop offset="1" style={{ stopColor: 'var(--marca-b)' }} />
          </linearGradient>
        </defs>
        {c.ganha ? (
          <>
            <circle cx={centro} cy={centro} r={rAnel} fill="none" stroke={`url(#${id})`} strokeWidth="2" opacity="0.55" />
            {hex ? (
              <path d={hexagono(26)} fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth="6" strokeLinejoin="round" />
            ) : (
              <circle cx={centro} cy={centro} r="29" fill={`url(#${id})`} />
            )}
          </>
        ) : (
          <>
            <circle cx={centro} cy={centro} r={rAnel} className="medalha-trilho" />
            {f > 0 && <circle cx={centro} cy={centro} r={rAnel} className="medalha-progresso" strokeDasharray={`${Math.max(f * volta, 2)} ${volta}`} transform={`rotate(-90 ${centro} ${centro})`} />}
            {hex ? <path d={hexagono(25)} className="medalha-fundo" strokeLinejoin="round" /> : <circle cx={centro} cy={centro} r="28" className="medalha-fundo" />}
          </>
        )}
      </svg>
      <span className="medalha-centro">{c.selo ? <b className={`numero ${c.selo.length > 2 ? 'longo' : ''}`}>{c.selo}</b> : <Icone nome={c.icone} />}</span>
    </span>
  );
}

/** "3 de 7", "8 de 10" ou "39%" (metas): o progresso curto embaixo da medalha bloqueada. */
export function progressoCurto(c: ConquistaGaleria): string | null {
  const p = c.progresso;
  if (!p) return null;
  if (p.alvo === 1 && !Number.isInteger(p.atual)) return pct(p.fracao, 0);
  const a = Number.isInteger(p.atual) ? String(p.atual) : num(p.atual, 1);
  return `${a} de ${p.alvo}`;
}

/** Atalho para a galeria (Relatório final): uma linha com o troféu e "N de M conquistadas". */
export function LinhaConquistas() {
  const g = useGaleria();
  if (!g.total) return null;
  return (
    <Link to="/conquistas" className="atalho-conquistas-linha">
      <span className="atalho-conquistas-icone" aria-hidden="true">
        <Icone nome="trofeu" />
      </span>
      <span className="cresce atalho-conquistas-texto">
        <b>Galeria de conquistas</b>
        <span className="numero">
          {g.ganhas} de {g.total} conquistadas
        </span>
      </span>
      <span className="atalho-linha-seta" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/** Atalho compacto para a galeria (cabeçalho do "Seu resumo"): troféu + "N de M". */
export function ChipConquistas({ g }: { g: Galeria }) {
  if (!g.total) return null;
  return (
    <Link to="/conquistas" className="chip-conquistas" aria-label={`Conquistas: ${g.ganhas} de ${g.total}`}>
      <Icone nome="trofeu" />
      <span className="numero">
        {g.ganhas}
        <span className="chip-conquistas-de"> de {g.total}</span>
        <span className="chip-conquistas-barra">/{g.total}</span>
      </span>
    </Link>
  );
}
