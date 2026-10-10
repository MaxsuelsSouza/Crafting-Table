// @ts-check
const os = require('os');
const { esc } = require('../ticket')._teste;
const { botao, mini, icone } = require('./botao');

// Componente "Card de comando": o card da lista de Comandos (nome, comando, pasta, ▶/■, @ ⋯ editar remover e a lista de processos).
// O mesmo molde (card + procs) serve o card do Emulador (emulador.js). Usado em Configurações → Comandos e Emuladores.
// Para usar numa tela: CSS no <style> (depois do ESTILO_NOTAS) e comando(b, rodando, procs) ou card({...}) dentro de <ul class="cartoes">.
// Sem script: cliques por data-acao (rodar, parar, mostrar, mencionar, processos, editar, remover, matar, matarTodos; comandos.js).
// Redesenhe quando um botão ou terminal mudar.
//   b: { id, nome, comando, pasta } · rodando: terminal aberto · procs: processos do terminal ({ pid, args }[]) ou undefined (lista fechada)
//   card({ estado, abertos, run, corpo, corpoAttr, mini, procs }): estado = 'rodando' | 'ligado' | 'ocupado' | '' (a borda do card)

const pastaCurta = (p) => { const partes = p.replace(os.homedir(), '~').split('/'); return partes.length > 3 ? '…/' + partes.slice(-2).join('/') : partes.join('/'); };

// Lista de processos do card; id = o do dono (botão ou AVD).
const procs = (lista, id) => `<div class="procs">${lista.length ? `
  ${lista.map((p) => `<div class="proc">
    <span class="pid">${p.pid}</span><span class="args" title="${esc(p.args)}">${esc(p.args)}</span>
    ${botao('✕', { perigo: true, acao: 'matar', id, dados: { pid: p.pid }, titulo: `Matar ${p.pid}` })}
  </div>`).join('')}
  ${botao(`Matar todos (${lista.length})`, { perigo: true, acao: 'matarTodos', id, classe: 'todos' })}`
  : '<p class="vazio">Nenhum processo rodando.</p>'}</div>`;

const card = ({ estado = '', abertos = false, run, corpo, corpoAttr = '', mini: botoes, procs: lista = '' }) => `<li class="${estado} ${abertos ? 'com-procs' : ''}"><div class="card">
  ${run}<div class="corpo"${corpoAttr}>${corpo}</div>${botoes}</div>${lista}</li>`;

const comando = (b, rodando, lista) => card({
  estado: rodando ? 'rodando' : '', abertos: Boolean(lista),
  run: rodando ? botao('■', { variante: 'parar', acao: 'parar', id: b.id, titulo: 'Parar' }) : botao('▶', { variante: 'executar', acao: 'rodar', id: b.id, titulo: 'Executar' }),
  corpoAttr: ` data-acao="${rodando ? 'mostrar' : 'rodar'}" data-id="${esc(b.id)}" title="${rodando ? 'Mostrar o terminal' : 'Executar'}"`,
  corpo: `<div class="nome">${esc(b.nome)}${rodando ? '<span class="vivo">rodando</span>' : ''}</div>
    <code class="cmd" title="${esc(b.comando)}">${esc(b.comando)}</code>
    <div class="pastinha" title="${esc(b.pasta)}">📁 ${esc(pastaCurta(b.pasta))}</div>`,
  mini: mini([
    botao('@', { acao: 'mencionar', id: b.id, titulo: 'Mencionar no Claude' }),
    botao('⋯', { acao: 'processos', id: b.id, titulo: 'Processos', classe: lista ? 'aberto' : '' }),
    botao(icone('editar'), { acao: 'editar', id: b.id, titulo: 'Editar' }),
    botao('✕', { perigo: true, acao: 'remover', id: b.id, titulo: 'Remover' })].join('')),
  procs: lista ? procs(lista, b.id) : ''
});

const CSS = `
  .cartoes > li.rodando, .cartoes > li.ligado { border-left: 3px solid var(--ok); }
  .cartoes > li.ocupado { border-left: 3px solid var(--warn); }
  .cartoes > li.rodando:hover, .cartoes > li.ligado:hover { border-left-color: var(--ok); }
  .cartoes > li.ocupado:hover { border-left-color: var(--warn); }
  .card { display: flex; align-items: center; gap: 10px; }
  .corpo { flex: 1; min-width: 0; }
  .corpo[data-acao] { cursor: pointer; }
  .corpo .nome { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; }
  .vivo { font-size: 10px; font-weight: 500; color: var(--ok); }
  .vivo::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--ok); margin-right: 4px; vertical-align: 1px; animation: pulso 1.6s infinite; }
  @keyframes pulso { 50% { opacity: .3; } }
  .cmd { display: inline-block; max-width: 100%; margin-top: 4px; padding: 1px 6px; border-radius: var(--r-md); font-family: var(--fc-mono); font-size: 11px;
    background: var(--surface-2); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; }
  .pastinha { font-size: 10.5px; color: var(--text-dim); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .procs { margin: 8px 0 0 38px; padding: 6px 8px; border-radius: var(--r-md); background: var(--surface-2); font-size: 12px; }
  .proc { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .proc .pid { padding: 0 6px; border-radius: var(--r-pill); font-family: var(--fc-mono); font-size: 10.5px; background: var(--surface); color: var(--accent); }
  .proc .args { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); }
  .procs .bt { padding: 2px 6px; height: auto; } .procs .todos { margin-top: 6px; font-size: 11px; }
  .procs .vazio { margin: 2px 0; }
  .vazio { color: var(--text-dim); }
  .centro code { font-size: 11px; }
`;

module.exports = { card, comando, procs, CSS, _teste: { pastaCurta } };
