// @ts-check
// Aba "Teste" da Implementação (etapa 7, Teste na aplicação): a pill do score contra o mínimo (com o porquê do mínimo), os tetos que
// derrubaram a nota, os CTs (card do QA, componentes/card-cenario.js) com print e vídeo, e o link para o plano (teste/plano-cts.md).
// Também o rótulo da etapa 7 na caixa de etapas (rotuloEtapa: "subindo a aplicação", "CT03 de 9", "score 4/5 · mín 4").
const fs = require('fs');
const path = require('path');
const fluxo = require('../../../componentes/fluxo-passos');
const cardCenario = require('../../../componentes/card-cenario');
const pill = require('../../../componentes/pill');
const { esc } = require('../../../infra/texto');
const { dirTeste, lerResultado, PLANO } = require('../etapas/07-teste/arquivos');

const CSS = `<style>${cardCenario.CSS}${pill.CSS}
  .ts-res { font-size: 12.5px; line-height: 1.6; } .ts-res b { color: var(--text); } .ts-res ul { margin: 4px 0 0 18px; padding: 0; }
  .ts-no { color: var(--warn, #d29922); }
  .cens { margin: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
</style>`;
const VID = /\.(mp4|webm|mov)$/i;

/** Rótulo da linha da etapa 7 na caixa de etapas (abas/esteira.js). */
function rotuloEtapa(dir, e, rodando) {
  const r = lerResultado(dir);
  if (rodando && e.etapa === 7) {
    if (e.testeSub === 2) return 'subindo a aplicação';
    if (e.testeSub === 3) {
      const ps = fluxo.ler(dirTeste(dir)).passos,
        i = ps.findIndex((p) => p.status === 'executando');
      const atual = i >= 0 ? ps[i] : ps.find((p) => p.status === 'pendente');
      return atual ? `${atual.id} de ${ps.length}` : 'executando os CTs';
    }
    return e.testeSub >= 4 ? 'calculando o score' : 'montando o plano de CTs';
  }
  if (r?.pulado) return 'no ticket pai';
  return r && typeof r.score === 'number'
    ? `score ${r.score}/5 · mín ${r.minimo}${r.entregavel === false ? ' · abaixo do mínimo' : ''}`
    : undefined;
}

const explicaMinimo = (r) => {
  const m = r.minimoDetalhe;
  if (!m) return '';
  const partes = [
    `base ${m.base} pelo tipo do ticket`,
    ...m.ajustes.map((a) => `${a.delta > 0 ? '+' : ''}${a.delta} ${a.motivo}`)
  ];
  return `Mínimo <b>${r.minimo}/5</b>: ${esc(partes.join(', '))} (sempre entre 2 e 5).${m.exigeRegressao ? ' Diff grande: exige ao menos 1 CT de regressão.' : ''}`;
};

/** d: { uri(arquivo) → URI da webview } */
function corpo(t, d, dir) {
  const dt = dirTeste(dir),
    r = lerResultado(dir),
    passos = fluxo.ler(dt).passos,
    plano = path.join(dir, PLANO);
  if (!r && !passos.length)
    return `${CSS}<div class="folha"><div class="vazio-aba">O teste na aplicação roda na etapa 7, depois da Verificação: sobe a aplicação, executa os casos de teste e dá um score de 0 a 5 contra o mínimo desta atividade.</div></div>`;
  if (r?.pulado) return `${CSS}<div class="folha"><div class="vazio-aba">${esc(r.motivo)}.</div></div>`;
  const uri = d?.uri || (() => ''),
    ctx = {
      dir: dt,
      uri,
      arquivos: (x) => fluxo.arquivosDe(dt, x),
      acoes: { abrir: 'fluxoAbrir', pasta: 'fluxoPasta', copiar: 'fluxoCopiar', refazer: 'testeRefazer' }
    };
  const meta = new Map((r?.cts || []).map((c) => [c.id, c]));
  const sessao = ['video', 'capturas'].flatMap((p) => {
    try {
      return fs
        .readdirSync(path.join(dt, p))
        .filter((n) => VID.test(n))
        .map((n) => path.join(dt, p, n));
    } catch {
      return [];
    }
  });
  const score = r && typeof r.score === 'number';
  const res = score
    ? `${pill.pill(`Score ${r.score}/5`, { cor: r.score >= r.minimo ? 'ok' : 'pausada', grande: true })}
      ${r.entregavel === false ? ' <span class="ts-no">entregue abaixo do mínimo</span>' : ''}<br>${explicaMinimo(r)}
      ${r.erroAmbiente ? `<br><span class="ts-no">A aplicação não subiu: ${esc(r.erroAmbiente)}</span>` : ''}
      ${r.tetos?.length ? `<ul>${r.tetos.map((x) => `<li>até ${x.nota}: ${esc(x.motivo)}</li>`).join('')}</ul>` : '<br>Nenhuma regra derrubou a nota.'}
      <br>Ambiente: <b>${esc(r.ambiente || '—')}</b> · tentativa ${esc(r.tentativa || 1)}${r.cobertura ? ` · critérios de aceite cobertos ${r.cobertura.cobertos}/${r.cobertura.total}` : ''}`
    : 'Teste em andamento.';
  const linkPlano = fs.existsSync(plano)
    ? `<div class="format-bar arquivo"><button class="fb-btn" data-acao="fluxoAbrir" data-nome="${esc(plano)}" title="${esc(plano)}">Abrir plano-cts.md</button>${sessao.map((v) => `<button class="fb-btn" data-acao="fluxoAbrir" data-nome="${esc(v)}">Vídeo da sessão: ${esc(path.basename(v))}</button>`).join('')}</div>`
    : '';
  const resumo = (p) => {
    const c = meta.get(p.id),
      s = p.execucoes.at(-1)?.sinais;
    return [
      c &&
        `Criticidade: ${c.criticidade} · Tipo: ${c.tipo} · ${c.print ? 'print ✓' : 'sem print'} · ${c.video ? 'vídeo ✓' : 'sem vídeo'}`,
      p.texto,
      p.acao && `Ação: ${p.acao}`,
      s && (s.console || s.rede)
        ? `Erros novos: console ${s.console}, rede ${s.rede}${s.resumo ? ` (${s.resumo})` : ''}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');
  };
  return `${CSS}<div class="caixa-t">Teste na aplicação<span>${passos.filter((p) => !['pendente', 'executando'].includes(p.status)).length}/${passos.length} CTs</span></div>
  <div class="folha"><div class="ts-res">${res}</div>${linkPlano}</div>
  ${passos.length ? `<div class="cens">${passos.map((p) => cardCenario.card({ ...p, resumo: resumo(p) }, ctx)).join('')}</div>` : ''}`;
}

module.exports = { corpo, rotuloEtapa };
