// @ts-check
const path = require('path');
const { esc } = require('../infra/ticket')._teste;
const sessao = require('../infra/sessao');
const { lerTexto } = require('../refinamento/locais');
const { IC } = require('./icones');
const { quando } = require('./formato');
const { LIDAS, ICONE_NOTIF, notifsDe, cmdsAberto } = require('../painel/notificacoes');
const acoesQa = require('../qa/acoes');
const { SEM_TICKET } = require('./card-ticket');
const { pastaAba } = require('../infra/pastas');

// Componente "Rodapé": a barra de baixo do ticket com Notificações (🔔), Comandos/Emuladores e, no QA, o Ambiente.
// Usado pela moldura do ticket (moldura.js): na página do painel (painel.js) e embaixo das outras seções (grupo.js, via provider.moldura).
// Para usar: CSS dentro do <style> da moldura; rodape(t, dentro) no fim do corpo (dentro = true na página do painel: cliques por data-acao;
// fora dela: data-painel, que o grupo.js repassa ao painel); CSS_FIXO só fora do painel (a página de outra seção rola o body, então o rodapé fica preso);
// script() no <script> da página para fechar a caixa aberta ao clicar fora. Redesenhar quando o ticket muda ou chega notificação (o painel ignora o arquivo LIDAS).
// Abrir o 🔔 marca como lidas (notifLidas): o contador some pelo CSS na hora e no próximo desenho pelo arquivo.
// O hook (Python) e o sdd-state (JS) escrevem a data ISO em formatos diferentes, por isso o Date.parse.
const ehNova = (n, lidas) => Date.parse(n.em) > lidas;

const CSS = `  .ct-rod { flex: none; height: 30px; display: flex; align-items: center; padding: 0 8px; border-top: 1px solid var(--border);
    background: var(--bg); font-family: var(--fc-font); font-size: 11.5px; color: var(--text-dim); }
  .ct-rod details { position: relative; display: flex; margin-top: 0; }
  .ct-rod summary, .ct-amb { line-height: 16px; height: 22px; box-sizing: border-box; }
  .ct-rod details[open] .ct-badge { display: none; }
  .ct-notif { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 11.5px; line-height: 1.45; }
  .ct-notif:last-child { border-bottom: 0; }
  .ct-notif small { color: var(--text-dim); }
  .ct-notif.nova .ct-ni { color: var(--accent); }
  .ct-ni { flex: none; width: 12px; text-align: center; }
  .ct-rod summary { list-style: none; cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11.5px; margin: 0; color: inherit; display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: var(--r-md); }
  .ct-rod summary::-webkit-details-marker { display: none; }
  .ct-rod summary:hover { background: var(--surface-2); color: var(--text); }
  .ct-rod summary svg { width: 14px; height: 14px; }
  .ct-cmd { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 4px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer;
    font: inherit; font-size: 11.5px; color: var(--text); text-align: left; }
  .ct-cmd:hover { background: var(--surface-2); }
  .ct-cmd .ct-ci { flex: none; display: flex; color: var(--ok); }
  .ct-cmd.on .ct-ci { color: var(--perigo, var(--danger)); }
  .ct-cmd svg { width: 12px; height: 12px; }
  .ct-cmd:disabled { opacity: .55; cursor: default; }
  .ct-cmd small { color: var(--text-dim); }
  .ct-cmd-grupo { margin: 8px 0 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); }
  .ct-cmd-vazio { color: var(--text-dim); padding: 2px 0; }
  .ct-amb { display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer;
    font: inherit; font-size: 11.5px; color: inherit; }
  .ct-amb:hover { background: var(--surface-2); color: var(--text); }
  .ct-luz { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
  .ct-luz.ok { background: var(--ok); }
  .ct-luz.prep { background: var(--ia); animation: ct-pisca 1.2s infinite; }
  .ct-luz.erro { background: var(--danger); box-shadow: 0 0 6px var(--danger); }
  .ct-luz.erro.pisca { animation: ct-pisca .8s infinite; }
  @keyframes ct-pisca { 50% { opacity: .2; } }
  .ct-badge-erro { background: var(--danger); }
  .ct-notifs { position: absolute; bottom: 30px; left: 0; width: min(320px, 90vw); max-height: 280px; overflow: auto; padding: 10px 12px; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 30px rgb(0 0 0 / 53%); }
`;

/** @param {any} t ticket aberto (ou null) */
const rodape = (t, dentro = false) => {
  const dir = t && pastaAba(t.id);
  const l = notifsDe(dir), lidas = Date.parse((dir && lerTexto(path.join(dir, LIDAS))) || '') || 0;
  const nova = (n) => ehNova(n, lidas);
  const novas = l.filter(nova).length;
  const cmds = require('../modulos/comandos').api?.lista() || [], emus = require('../modulos/emulador').api?.lista() || [];
  const acao = dentro ? 'data-acao' : 'data-painel';
  const caixaCmds = `<details class="ct-cmds"${cmdsAberto() ? ' open' : ''}><summary ${acao}="cmdsAlternar">${IC.play} Comandos</summary>
    <div class="ct-notifs">${cmds.length ? cmds.map((c) => `<button class="ct-cmd ${c.rodando ? 'on' : ''}" ${acao}="cmdAlternar" data-id="${esc(c.id)}"
      title="${c.rodando ? 'Parar' : 'Executar'}"><span class="ct-ci">${c.rodando ? IC.parar : IC.play}</span>${esc(c.nome)}</button>`).join('') : '<div class="ct-cmd-vazio">Nenhum comando. Cadastre em Configurações → Comandos.</div>'}
    ${emus.length ? `<div class="ct-cmd-grupo">Emuladores</div>${emus.map((c) => `<button class="ct-cmd ${c.rodando ? 'on' : ''}" ${acao}="emuAlternar" data-id="${esc(c.id)}" ${c.ocupado ? 'disabled' : ''}
      title="${esc(c.ocupado || (c.rodando ? 'Desligar' : 'Ligar'))}"><span class="ct-ci">${c.rodando ? IC.parar : IC.play}</span>${esc(c.nome)}${c.ocupado ? ` <small>${esc(c.ocupado)}</small>` : ''}</button>`).join('')}` : ''}</div></details>`;
  // QA: ambiente depois de Comandos. Preparando → abre o log ao vivo; erro → luz vermelha piscando e bolinha até abrir a análise (Evidências).
  const caixaAmb = t && t.id !== SEM_TICKET && sessao.focoLista() === 'qa' ? acoesQa.caixaAmbiente(dir, acao) : '';
  return `<footer class="ct-rod"><details><summary ${acao}="notifLidas">${IC.sino} Notificações
    ${novas ? `<span class="ct-badge">${novas}</span>` : ''}</summary>
  <div class="ct-notifs">${l.length ? l.map((n) => `<div class="ct-notif ${nova(n) ? 'nova' : ''}"><span class="ct-ni">${ICONE_NOTIF[n.tipo] || '•'}</span>
    <span>${esc(n.texto)}<br><small>${esc(quando(n.em))}</small></span></div>`).join('') : 'Nenhuma notificação ainda.'}</div></details>${caixaCmds}${caixaAmb}</footer>`;
};

// Fora do painel o rodapé fica preso embaixo.
// !important: a seção de dentro pode zerar o padding do body depois (Evidências usa ESTILO_NOTAS no corpo) e o rodapé fixo cobriria o fim da página.
const CSS_FIXO = '<style>body { margin: 0; padding-bottom: 42px !important; } .ct-rod { position: fixed; left: 0; right: 0; bottom: 0; z-index: 100; }</style>';

// Clique fora de uma caixa aberta do rodapé (notificações, comandos) fecha: o clique no <summary> alterna e avisa o painel, como um clique do usuário.
const script = () => `document.addEventListener('click', (e) => {
      document.querySelectorAll('.ct-rod details[open]').forEach((d) => { if (!d.contains(e.target)) d.querySelector('summary').click(); });
    }, true);`;

module.exports = { rodape, CSS, CSS_FIXO, script, _teste: { ehNova } };
