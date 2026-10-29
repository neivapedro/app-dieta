// Galeria de conquistas (estilo prêmios do Apple Fitness): medalhas ganhas com a data
// e as bloqueadas com o progresso. Tudo calculado do histórico (lib/conquistas-galeria.ts).
import '../estilos/conquistas.css';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Medalha, progressoCurto, useGaleria } from '../componentes/conquistas';
import { Folha, IconeChip } from '../componentes/ui';
import { dataPorExtenso, formatarData } from '../lib/datas';
import { CATEGORIAS_GALERIA, type ConquistaGaleria } from '../lib/conquistas-galeria';
import { pct } from '../lib/formato';

function rotuloAcessivel(c: ConquistaGaleria): string {
  if (c.ganha) return `${c.titulo}: conquistada em ${dataPorExtenso(c.data!)}`;
  const p = progressoCurto(c);
  return `${c.titulo}: ainda não conquistada${p ? `, ${p}` : ''}${c.falta ? `, ${c.falta}` : ''}`;
}

function ItemMedalha({ c, aoAbrir }: { c: ConquistaGaleria; aoAbrir: () => void }) {
  return (
    <button type="button" className={`medalha-item ${c.ganha ? 'ganha' : 'bloqueada'}`} onClick={aoAbrir} aria-label={rotuloAcessivel(c)}>
      <Medalha c={c} />
      <span className="medalha-titulo">{c.titulo}</span>
      <span className="medalha-sub numero">{c.ganha ? formatarData(c.data!, true) : (progressoCurto(c) ?? 'bloqueada')}</span>
    </button>
  );
}

function DetalheMedalha({ c }: { c: ConquistaGaleria }) {
  const p = c.progresso;
  return (
    <div className="pilha medalha-detalhe">
      <div className="medalha-detalhe-topo">
        <Medalha c={c} tamanho={112} />
        <div className={`medalha-detalhe-status ${c.ganha ? 'ganha' : ''}`}>
          {c.ganha ? `Conquistada em ${dataPorExtenso(c.data!)}` : 'Ainda não conquistada'}
        </div>
      </div>
      {!c.ganha && (p || c.falta) && (
        <div className="medalha-detalhe-progresso">
          {p && (
            <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fracao * 100)} aria-label="Progresso">
              <div style={{ width: `${Math.max(p.fracao * 100, p.fracao > 0 ? 3 : 0)}%` }} />
            </div>
          )}
          <div className="linha entre medalha-detalhe-numeros">
            <span className="numero">{p ? `${progressoCurto(c)}${p.alvo !== 1 ? ` · ${pct(p.fracao, 0)}` : ''}` : ''}</span>
            {c.falta && <span>{c.falta}</span>}
          </div>
        </div>
      )}
      {c.detalhe && <p className="medalha-detalhe-info">{c.detalhe}</p>}
      <div>
        <div className="sobretitulo">Como conta</div>
        <p className="medalha-detalhe-criterio">{c.criterio}</p>
      </div>
    </div>
  );
}

export default function Conquistas() {
  const g = useGaleria();
  const [aberta, setAberta] = useState<string | null>(null);
  const sel = g.itens.find((i) => i.id === aberta) ?? null;
  const fracao = g.total ? g.ganhas / g.total : 0;
  const r = 30;
  const volta = 2 * Math.PI * r;

  return (
    <div className="pilha pagina-conquistas">
      <section className="cartao hero conquistas-hero" aria-label="Resumo das conquistas">
        <div className="conquistas-hero-topo">
          <div className="conquistas-anel" role="img" aria-label={`${g.ganhas} de ${g.total} conquistas`}>
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <defs>
                <linearGradient id="conquistas-anel-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--marca-a)' }} />
                  <stop offset="0.52" style={{ stopColor: 'var(--marca-m)' }} />
                  <stop offset="1" style={{ stopColor: 'var(--marca-b)' }} />
                </linearGradient>
              </defs>
              <circle cx="36" cy="36" r={r} className="conquistas-anel-trilho" />
              {fracao > 0 && (
                <circle cx="36" cy="36" r={r} className="conquistas-anel-valor" stroke="url(#conquistas-anel-grad)" strokeDasharray={`${fracao * volta} ${volta}`} transform="rotate(-90 36 36)" />
              )}
            </svg>
            <span className="conquistas-anel-centro numero">{pct(fracao, 0)}</span>
          </div>
          <div className="cresce">
            <div className="sobretitulo">Galeria</div>
            <div className="conquistas-hero-titulo numero">
              {g.ganhas} de {g.total} conquistas
            </div>
            <div className="hero-sub">Calculadas de todo o seu histórico. Toque numa medalha para ver como conta.</div>
          </div>
        </div>
        {g.recentes.length > 0 && (
          <div className="conquistas-recentes">
            <div className="sobretitulo">Mais recentes</div>
            <div className="conquistas-recentes-lista">
              {g.recentes.map((c) => (
                <ItemMedalha key={c.id} c={c} aoAbrir={() => setAberta(c.id)} />
              ))}
            </div>
          </div>
        )}
        {g.ganhas === 0 && <p className="mudo conquistas-vazio">Nenhuma conquista ainda: a primeira aplicação, a primeira medição e o primeiro checklist completo já contam.</p>}
      </section>

      {g.categorias.map((cat) => {
        const info = CATEGORIAS_GALERIA.find((x) => x.chave === cat.chave)!;
        const itens = g.itens.filter((i) => i.categoria === cat.chave);
        return (
          <section key={cat.chave} className="cartao conquistas-categoria" aria-labelledby={`cq-${cat.chave}`}>
            <div className="secao-cab">
              <IconeChip nome={info.icone} cor={info.cor} />
              <div className="cresce">
                <h2 id={`cq-${cat.chave}`}>{cat.titulo}</h2>
                <div className="secao-sub numero">
                  {cat.ganhas} de {cat.total} conquistadas
                </div>
              </div>
            </div>
            <div className="medalhas-grade">
              {itens.map((c) => (
                <ItemMedalha key={c.id} c={c} aoAbrir={() => setAberta(c.id)} />
              ))}
            </div>
          </section>
        );
      })}

      <p className="mudo conquistas-rodape">
        Só registros contam: nada aqui é orientação de dose ou de dieta. As medições atípicas ficam fora das metas. Veja também o <Link to="/analise">resumo na Análise</Link>.
      </p>

      {sel && (
        <Folha titulo={sel.titulo} aoFechar={() => setAberta(null)}>
          <DetalheMedalha c={sel} />
        </Folha>
      )}
    </div>
  );
}
