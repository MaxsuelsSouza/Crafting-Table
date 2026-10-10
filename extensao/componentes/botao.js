// @ts-check
const { esc } = require('../ticket')._teste;

// Componente "Botão": os botões da extensão, num só lugar. Usado nas Configurações (configuracao.js e card-config.js),
// no card de comando/emulador (card-comando.js), no Cofre e no cabeçalho do painel. O CSS já vem dentro do ESTILO_NOTAS (comandos.js),
// que toda tela usa; use botao(texto, opções) no corpo. Sem script: os cliques vão pelo data-acao/data-painel de sempre.
//   variante: 'principal' (azul sólido) · 'contorno' (borda, ações da tela) · 'fantasma' (só texto, fundo no hover) · 'ok' (aprovar, verde)
//             · 'link' (texto cinza que sublinha) · 'icone' (quadrado 28px) · 'executar' ▶ / 'parar' ■ (só o símbolo, verde/vermelho)
//   perigo: vermelho (no principal vira fundo vermelho) · grande: 34px (o botão do topo da tela) · desligado: disabled
//   acao | painel: data-acao (página do painel) ou data-painel (moldura do grupo.js) · id · dados: outros data-* ({ pid: 4 })
//   classe: classe extra (só para estado, como is-on/aberto) · titulo: dica
// As classes antigas seguem valendo para o HTML escrito à mão (painel, qa, notas…): .primario, .fb-btn e .ct-ico.

/**
 * @param {string} texto HTML do botão (texto ou ícone)
 * @param {{ variante?: string, acao?: string, id?: string, painel?: string, dados?: Record<string, string | number>, titulo?: string, classe?: string, perigo?: boolean, grande?: boolean, desligado?: boolean }} [o]
 */
const botao = (texto, { variante = 'fantasma', acao, id, painel, dados = {}, titulo, classe = '', perigo = false, grande = false, desligado = false } = {}) => {
  const attrs = { acao, painel, id, ...dados };
  const data = Object.entries(attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const cls = ['bt', `bt-${variante}`, perigo && 'bt-perigo', grande && 'bt-grande', classe].filter(Boolean).join(' ');
  return `<button class="${cls}"${data}${titulo ? ` title="${esc(titulo)}"` : ''}${desligado ? ' disabled' : ''}>${texto}</button>`;
};

// Ícones de traço (no lugar de emoji) para os botões de ícone.
const ICONES = {
  pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  limpar: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
};
const icone = (nome) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome]}</svg>`;

// Grupo de botões pequenos que aparece ao passar o mouse no card (@, ⋯, editar, remover).
const mini = (html) => `<span class="bt-mini">${html}</span>`;

const CSS = `
  .bt, .primario, .fb-btn, .ct-ico { font: inherit; cursor: pointer; }
  .bt { display: inline-flex; align-items: center; justify-content: center; gap: 5px; flex: none; height: 24px; padding: 0 9px; border: 1px solid transparent;
    border-radius: var(--r-md); background: none; color: var(--text); font-size: 11.5px; font-weight: 400; white-space: nowrap; }
  .bt:disabled { opacity: .45; cursor: not-allowed; }
  .bt-principal, .primario { background: var(--accent); color: var(--on-cor); font-weight: 600; border: 0; border-radius: var(--r-md); }
  .bt-principal:hover, .primario:hover { background: var(--accent-soft); }
  .bt-grande, .primario { height: 34px; padding: 0 12px; font-size: var(--fs-md, 12px); }
  .primario { flex: none; box-shadow: var(--sombra); }
  .bt-principal.bt-perigo { background: var(--danger); } .bt-principal.bt-perigo:hover { background: var(--perigo); }
  .bt-contorno { border-color: var(--border); font-size: 11px; }
  .bt-contorno:hover { border-color: var(--accent); }
  .bt-fantasma, .fb-btn { min-width: 24px; padding: 0 7px; border: 0; background: transparent; }
  .fb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 24px; border-radius: var(--r-md); color: var(--text);
    font-size: var(--fs-md, 12px); font-weight: 400; line-height: 1; }
  .bt-fantasma:hover, .fb-btn:hover { background: var(--surface-2); }
  .bt-fantasma.is-on, .fb-btn.is-on, .bt-fantasma.aberto { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .fb-btn svg { width: 13px; height: 13px; }
  .bt-ok { background: var(--ok); color: var(--on-cor); font-weight: 600; border: 0; }
  .bt-link { padding: 0; border: 0; color: var(--text-dim); }
  .bt-link:hover { color: var(--text); text-decoration: underline; }
  .bt-icone, .ct-ico { flex: none; width: 28px; height: 28px; padding: 0; border: 1px solid transparent; border-radius: var(--r-md); background: none; color: var(--text);
    display: inline-flex; align-items: center; justify-content: center; }
  .bt-icone:hover, .ct-ico:hover { background: var(--surface-2); border-color: var(--border); }
  .bt-icone svg, .ct-ico svg { width: 16px; height: 16px; }
  .bt-executar, .bt-parar { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 400; background: transparent; color: var(--ok); }
  .bt-executar:hover, .bt-parar:hover { background: var(--surface-2); }
  .bt-parar { color: var(--perigo); }
  .bt-perigo:not(.bt-principal) { color: var(--danger); }
  .bt-perigo:not(.bt-principal):hover { background: color-mix(in srgb, var(--danger) 14%, transparent); border-color: transparent; }
  .bt-mini { flex: none; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    opacity: 0; transition: opacity 140ms; }
  .cartoes > li:hover .bt-mini, .cartoes > li.com-procs .bt-mini { opacity: 1; }
  .bt-mini .bt { height: 22px; min-width: 22px; padding: 0 6px; }
`;

module.exports = { botao, mini, icone, CSS };
