// @ts-check
// Aba "Reprodução" da Implementação: veredito, ref/commit e ambiente (estado.repro), cenários (card do QA) com a prova de cada um (print e vídeo),
// as evidências já presentes no ticket e os quadros tirados dos vídeos. Lógica: etapas/01-dossie/ (subetapas 1.2 a 1.6 e reproducao/).
const path = require('path');
const fluxo = require('../../../componentes/fluxo-passos');
const cardCenario = require('../../../componentes/card-cenario');
const { esc } = require('../../../infra/texto');
const { ehBug } = require('../../../infra/dossie');
const { ROTULO, QUADROS } = require('../../../infra/reproducao');
const { resultado, provas } = require('../etapas/01-dossie/reproducao/resultado');
const { evidenciasDoTicket, PASTA } = require('../etapas/01-dossie/reproducao/evidencias-ticket');

const CSS = `<style>${cardCenario.CSS}
  .rp-res { font-size: 12.5px; line-height: 1.6; } .rp-res b { color: var(--text); }
  .rp-ok { color: var(--ok, #3fb950); } .rp-no { color: var(--warn, #d29922); }
  .rp-ev { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .rp-ev .cev { cursor: pointer; }
  .cens { margin: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
  .cen .cdet code { display: block; white-space: pre-wrap; font-size: 11px; margin: 4px 0; color: var(--text); }
</style>`;
const IMG = /\.(png|jpe?g|gif|webp)$/i;

/** Aba "Reprodução": cenários (card do QA), o que falhou e as evidências já presentes no ticket. d: { uri(arquivo) → URI da webview }. */
function corpo(t, d, dir) {
  const grav = (() => {
    try {
      return require('../../../infra/dossie').lerGravado(dir);
    } catch {
      return null;
    }
  })();
  const tipo = d?.jira?.tipo || grav?.tipoTicket || '';
  const r = resultado(dir),
    exige = ehBug(tipo) || grav?.exigeReproducao || r.passos.length > 0;
  if (!exige)
    return `${CSS}<div class="folha"><div class="vazio-aba">Esta etapa vale para tickets do tipo Bug, Defeito ou Incidente${tipo ? ` (este é ${esc(tipo)})` : ''}.</div></div>`;
  const uri = d?.uri || (() => ''),
    ctx = {
      dir,
      uri,
      arquivos: (x) => fluxo.arquivosDe(dir, x),
      acoes: { abrir: 'fluxoAbrir', pasta: 'fluxoPasta', copiar: 'fluxoCopiar', refazer: 'fluxoRefazer' }
    };
  const ev = evidenciasDoTicket(dir);
  const miniatura = (e) => {
    const f = path.join(dir, e.arquivo);
    return `<span class="cev" data-acao="fluxoAbrir" data-nome="${esc(f)}" title="${esc(e.nome)}${e.de ? ` · de ${esc(e.de)}` : ''}">${IMG.test(e.nome) && uri(f) ? `<img src="${esc(uri(f))}">` : esc(path.extname(e.nome).slice(1).toUpperCase() || 'ARQ')}</span>`;
  };
  const rp = require('../estado').estado(dir).repro || {}; // no corpo: estado → dependencias → reproducao → aqui
  const veredito = rp.veredito
    ? `Veredito: <b class="${rp.veredito === 'REPRODUZIDO' ? 'rp-ok' : 'rp-no'}">${esc(ROTULO[rp.veredito] || rp.veredito)}</b>${rp.motivo ? ` · ${esc(rp.motivo)}` : ''}<br>`
    : '';
  const refs = Object.entries(rp.refs || {})
    .map(
      ([repo, x]) =>
        `Código: <b>${esc(path.basename(repo))}</b> em <code>${esc(x.ref)}</code> (${esc(String(x.commit).slice(0, 10))})<br>`
    )
    .join('');
  const ambiente = rp.ambiente ? `Ambiente: <b>${esc(rp.ambiente)}</b><br>` : '';
  const prova = (p) => {
    if (!p.execucoes?.length) return '';
    const x = provas(dir, p);
    return `Prova: ${x.print ? 'print ✓' : 'sem print'} · ${x.video ? 'vídeo ✓' : 'sem vídeo'}`;
  };
  const quadros = (() => {
    try {
      const raiz = path.join(dir, PASTA, QUADROS);
      return require('fs')
        .readdirSync(raiz)
        .flatMap((v) =>
          require('fs')
            .readdirSync(path.join(raiz, v))
            .map((n) => ({ nome: `${v}/${n}`, arquivo: path.join(PASTA, QUADROS, v, n) }))
        );
    } catch {
      return [];
    }
  })();
  const resumo = !r.passos.length
    ? 'A reprodução ainda não rodou: ela acontece quando a esteira assume o ticket, antes do Entendimento.'
    : r.confirmou
      ? `<span class="rp-ok">Erro confirmado</span>: ${r.falhou.length} cenário(s) falharam${r.semEvidencia.length ? ` · <span class="rp-no">sem evidência: ${esc(r.semEvidencia.map((p) => p.id).join(', '))}</span>` : ''}.`
      : r.pendentes.length
        ? 'Reprodução em andamento.'
        : '<span class="rp-no">Erro não confirmado</span>: nenhum cenário falhou.';
  return `${CSS}<div class="caixa-t">Reprodução do bug<span>${r.passos.filter((p) => p.status !== 'pendente').length}/${r.passos.length} cenários</span></div>
  <div class="folha"><div class="rp-res">Tipo do ticket: <b>${esc(tipo || '—')}</b><br>${veredito}${refs}${ambiente}${resumo}${rp.midia?.length ? `<br><span class="rp-no">Vídeo não analisado: ${esc(rp.midia.join(', '))}</span>` : ''}</div></div>
  ${r.passos.length ? `<div class="cens">${r.passos.map((p) => cardCenario.card({ ...p, resumo: [p.texto, p.fonte && `Fonte: ${p.fonte}`, p.acao && `Ação: ${p.acao}`, prova(p)].filter(Boolean).join('\n') }, ctx)).join('')}</div>` : ''}
  <div class="caixa-t">Evidências do ticket, do pai e dos irmãos<span>${ev.length}</span></div>
  <div class="folha">${ev.length ? `<div class="rp-ev">${ev.map(miniatura).join('')}</div>` : '<div class="vazio-aba">Nenhum print, vídeo ou log encontrado nos anexos.</div>'}</div>
  ${quadros.length ? `<div class="caixa-t">Quadros dos vídeos<span>${quadros.length}</span></div><div class="folha"><div class="rp-ev">${quadros.map(miniatura).join('')}</div></div>` : ''}`;
}

module.exports = { corpo };
