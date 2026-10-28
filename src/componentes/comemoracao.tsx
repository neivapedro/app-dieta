// Comemorações: confete curto + aviso quando uma conquista acaba de acontecer
// (checklist do dia, recorde de corrida, meta atingida, fase concluída).
// Só reage a alterações feitas agora pelo usuário: abrir o app, recarregar ou
// receber dados do servidor nunca comemora, e cada conquista comemora uma vez.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDados } from '../dados/contexto';
import { useCalculos } from '../dados/useCalculos';
import { useProjeto } from '../dados/useProjeto';
import { useTreino } from '../dados/useTreino';
import { chaveMemoria, detectarConquistas, filtrarNovas, type Conquista, type RetratoConquistas, type TipoConquista } from '../lib/conquistas';
import { tarefasDoDia } from '../lib/inicio-hoje';
import { listarCorridas, segundaDaSemana } from '../lib/treino';
import { IconeChip } from './ui';

/** Alteração conta como "do usuário" se veio logo depois de um toque ou tecla. */
const JANELA_INTERACAO_MS = 15000;
const DURACAO_AVISO_MS = 3600;
const DURACAO_CONFETE_MS = 1300;

export function menosMovimento(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Retrato do que as comemorações acompanham (mesmas contas do Início e da Medidas). */
function useRetrato(): RetratoConquistas | null {
  const { perfil, ciclo, diario, medidas, dieta, treinos } = useDados();
  const { resumo, hoje, composicoes, sexo } = useCalculos();
  const proj = useProjeto();
  const t = useTreino();
  return useMemo(() => {
    if (!perfil || !ciclo || !resumo) return null;
    // Checklist do dia: as mesmas entradas do cartão do Início (só importa o que está feito)
    const pos = proj?.pos ?? null;
    const p = resumo.proxima;
    const dose = proj && !pos ? { devida: !!p && (p.situacao === 'hoje' || p.situacao === 'atrasada'), feitaHoje: proj.ultimaDose === hoje, texto: '' } : null;
    const segunda = segundaDaSemana(hoje);
    const tarefas = tarefasDoDia({
      reg: diario.find((r) => r.data === hoje) ?? null,
      pesoMedicao: medidas.find((m) => m.data === hoje && m.peso_kg > 0)?.peso_kg ?? null,
      dose,
      medicao: medidas.length && hoje === segunda ? { feita: medidas.some((m) => m.data >= segunda) } : null,
      comTreino: !!t && t.placar.iniciado && !t.placar.encerrado,
      treinoDia: t?.doDia(hoje) ?? null,
      comDieta: !!dieta?.refeicoes.some((r) => r.itens.length),
      metaAgua: 0,
    });
    const d = resumo.degrau;
    return {
      hoje,
      checklist: { feitas: tarefas.filter((x) => x.feito).length, total: tarefas.length },
      corridas: perfil.modulo_treino ? listarCorridas(treinos).map((c) => ({ data: c.data, km: c.km, segundos: c.segundos })) : [],
      medidas: composicoes,
      metas: perfil.metas_projeto ?? null,
      sexo,
      aplicacoes: resumo.aplicacoes_realizadas,
      fase: d.degrau
        ? {
            chave: `${d.degrau.bloco.data_inicio}|${d.degrau.bloco.dose_mg}`,
            nome: d.degrau.ultima_fase !== null ? (ciclo.fases[d.degrau.ultima_fase]?.nome ?? '') : '',
            feitas: d.feitas,
            previstas: d.previstas,
          }
        : null,
    };
  }, [perfil, ciclo, resumo, proj, t, diario, medidas, dieta, treinos, composicoes, sexo, hoje]);
}

function IconeConquista({ tipo }: { tipo: TipoConquista }) {
  // Traço 2 em 24×24, como os ícones de ui.tsx
  const d: Record<TipoConquista, ReactNode> = {
    checklist: <path d="M5 12.5l4.2 4.2L19 7" />,
    corrida: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />,
    meta: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.6" fill="currentColor" />
      </>
    ),
    fase: (
      <>
        <path d="M8 21h8M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
        <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4" />
      </>
    ),
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d[tipo]}
    </svg>
  );
}

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  giro: number;
  vg: number;
  w: number;
  h: number;
  cor: string;
  redonda: boolean;
}

function coresDaMarca(): string[] {
  const css = getComputedStyle(document.documentElement);
  const cores = ['--marca-a', '--marca-m', '--marca-b', '--c-rosa', '--c-ciano', '--c-laranja', '--c-indigo', '--c-roxo']
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
  return cores.length ? cores : ['#5b4ff0', '#7c3aed', '#c2255c'];
}

/** Explosão de confete (canvas por cima de tudo, sem receber toques); some sozinha. */
export function Confete({ aoTerminar }: { aoTerminar: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const terminar = useRef(aoTerminar);
  terminar.current = aoTerminar;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      terminar.current();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);
    const cores = coresDaMarca();
    // Sai de perto do aviso (alto da tela) e se abre em leque, caindo com a gravidade
    const ox = W / 2;
    const oy = Math.min(150, H * 0.2);
    const n = W < 380 ? 70 : 90;
    const ps: Particula[] = Array.from({ length: n }, () => {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const vel = 5 + Math.random() * 7;
      return {
        x: ox + (Math.random() - 0.5) * 40,
        y: oy,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel - 2,
        giro: Math.random() * Math.PI,
        vg: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        cor: cores[Math.floor(Math.random() * cores.length)],
        redonda: Math.random() < 0.3,
      };
    });
    const inicio = performance.now();
    let anterior = inicio;
    let quadro = 0;
    const passo = (agora: number) => {
      const dt = Math.min((agora - anterior) / 16.67, 3);
      anterior = agora;
      const t = (agora - inicio) / DURACAO_CONFETE_MS;
      ctx.clearRect(0, 0, W, H);
      if (t >= 1) {
        terminar.current();
        return;
      }
      // Some no último terço
      ctx.globalAlpha = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);
      for (const p of ps) {
        p.vx *= Math.pow(0.985, dt);
        p.vy = p.vy * Math.pow(0.985, dt) + 0.32 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.giro += p.vg * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.cor;
        if (p.redonda) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h / 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Achatado pelo giro: parece papel virando
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro * 1.7)) + 1);
        }
        ctx.restore();
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, []);
  return <canvas ref={ref} className="confete" aria-hidden="true" />;
}

/** Aviso curto da conquista (toque fecha). */
export function AvisoConquista({ itens, saindo, aoFechar }: { itens: Conquista[]; saindo: boolean; aoFechar: () => void }) {
  const [primeira, ...resto] = itens;
  return (
    <div className={`aviso-conquista${saindo ? ' saindo' : ''}`} role="status" onClick={aoFechar}>
      <IconeChip cor="marca">
        <IconeConquista tipo={primeira.tipo} />
      </IconeChip>
      <div className="aviso-conquista-texto">
        <b>{primeira.titulo}</b>
        {primeira.detalhe && <span>{primeira.detalhe}</span>}
        {resto.map((c) => (
          <b key={c.id} className="aviso-conquista-mais">
            {c.titulo}
          </b>
        ))}
      </div>
    </div>
  );
}

/** Uma comemoração na tela: confete (se o aparelho permite movimento) e o aviso. */
export function Comemoracao({ itens, aoTerminar }: { itens: Conquista[]; aoTerminar: () => void }) {
  const [confete, setConfete] = useState(() => !menosMovimento());
  const [saindo, setSaindo] = useState(false);
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;
  useEffect(() => {
    const t1 = setTimeout(() => setSaindo(true), DURACAO_AVISO_MS);
    const t2 = setTimeout(() => fim.current(), DURACAO_AVISO_MS + 260);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <>
      {confete && <Confete aoTerminar={() => setConfete(false)} />}
      <AvisoConquista itens={itens} saindo={saindo} aoFechar={() => fim.current()} />
    </>
  );
}

/**
 * Acompanha os dados e comemora conquistas novas. Montado uma vez na estrutura do
 * app: as telas não precisam saber dele.
 */
export function Comemoracoes() {
  const { carregando, usuario } = useDados();
  const retrato = useRetrato();
  const anterior = useRef<RetratoConquistas | null>(null);
  const ultimaInteracao = useRef(0);
  const [fila, setFila] = useState<Conquista[][]>([]);

  useEffect(() => {
    const marcar = () => (ultimaInteracao.current = Date.now());
    document.addEventListener('pointerdown', marcar, { capture: true, passive: true });
    document.addEventListener('keydown', marcar, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', marcar, { capture: true });
      document.removeEventListener('keydown', marcar, { capture: true });
    };
  }, []);

  useEffect(() => {
    // Recarregando (puxar para atualizar, volta da internet): o que chegar vira a nova base
    if (carregando || !retrato) {
      anterior.current = null;
      return;
    }
    const antes = anterior.current;
    anterior.current = retrato;
    // Primeiro retrato (app abrindo, dados do servidor ou da cópia offline): só a base
    if (!antes || Date.now() - ultimaInteracao.current > JANELA_INTERACAO_MS) return;
    const novas = filtrarNovas(detectarConquistas(antes, retrato), chaveMemoria(usuario?.id));
    if (novas.length) setFila((f) => [...f, novas]);
  }, [retrato, carregando, usuario]);

  if (!fila.length) return null;
  // key: cada comemoração recomeça o confete e o tempo do aviso
  return <Comemoracao key={fila[0][0].id} itens={fila[0]} aoTerminar={() => setFila((f) => f.slice(1))} />;
}
