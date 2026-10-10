// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const maestro = require('../painel/maestro');
const { esc } = require('../infra/ticket')._teste;
const { quando } = require('../componentes/formato');
const { dirSpec, IMPACTOS, impactosDe, ticketDe } = require('./locais');

// Mudança de escopo vinda de comentário do Jira: o impacto fica em .impactos.json com status "aguardando_decisao" até o
// humano escolher. Aqui moram as peças sem vscode: quais passos ficam em atenção e o snapshot que permite "Não prosseguir"
// depois de uma aplicação (desfazer), mais as caixas da aba Spec, as ações e o CSS. Roda em teste-mudancas.js (vscode simulado).

// Quem depende de quem (mesma tabela do sdd-state: DEPENDENTES).
const DEPENDENTES = { 0: [3, 4, 5, 6], 1: [2, 3, 4, 5, 6], 2: [3, 4, 5, 6], 3: [4, 5, 6], 4: [5, 6], 5: [6], 6: [] };
const TAREFAS = '.tarefas.json';

// Rótulo e cor de cada nível de impacto (aviso do orquestrador e caixas da aba Spec).
const NIVEL = { alto: ['ALTO', 'var(--danger)'], medio: ['MÉDIO', 'var(--warn)'], baixo: ['BAIXO', 'var(--ok)'], nenhum: ['SEM IMPACTO', 'var(--text-dim)'] };

const pendentes = (l) => l.filter((i) => i.status === 'aguardando_decisao');

// Passos que a mudança pode atingir: o primeiro afetado e todos que dependem dele.
const passosAfetados = (l) => new Set(pendentes(l).flatMap((i) => (Number.isInteger(i.passo) && DEPENDENTES[i.passo] ? [i.passo, ...DEPENDENTES[i.passo]] : [])));
const cardsAfetados = (l) => new Set(pendentes(l).flatMap((i) => i.cards || []));

// Snapshot do estado antes de aplicar: arquivos da pasta da spec (nível raiz, onde moram spec/plan/tasks/testes/sdd-state)
// e os cards do ticket. aprovados/ e subpastas não entram.
function snapshot(pastaTicket, dirSpec, id) {
  const dest = path.join(pastaTicket, 'snapshots', String(id));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'spec'), { recursive: true });
  for (const n of dirSpec && fs.existsSync(dirSpec) ? fs.readdirSync(dirSpec) : []) {
    if (fs.statSync(path.join(dirSpec, n)).isFile()) fs.copyFileSync(path.join(dirSpec, n), path.join(dest, 'spec', n));
  }
  if (fs.existsSync(path.join(pastaTicket, TAREFAS))) fs.copyFileSync(path.join(pastaTicket, TAREFAS), path.join(dest, TAREFAS));
  return dest;
}

// Volta ao snapshot: apaga os arquivos que surgiram depois, devolve os que existiam e os cards. false = sem snapshot.
function restaurar(pastaTicket, dirSpec, id) {
  const src = path.join(pastaTicket, 'snapshots', String(id));
  if (!fs.existsSync(path.join(src, 'spec'))) return false;
  const eram = new Set(fs.readdirSync(path.join(src, 'spec')));
  for (const n of fs.existsSync(dirSpec) ? fs.readdirSync(dirSpec) : []) {
    if (fs.statSync(path.join(dirSpec, n)).isFile() && !eram.has(n)) fs.rmSync(path.join(dirSpec, n));
  }
  for (const n of eram) fs.copyFileSync(path.join(src, 'spec', n), path.join(dirSpec, n));
  if (fs.existsSync(path.join(src, TAREFAS))) fs.copyFileSync(path.join(src, TAREFAS), path.join(pastaTicket, TAREFAS));
  else fs.rmSync(path.join(pastaTicket, TAREFAS), { force: true });
  return true;
}

// A análise é só leitura: confere se os arquivos da spec (menos o estado, que o status regrava) e os cards mudaram desde o snapshot.
function alterou(pastaTicket, dirSpec, id) {
  const src = path.join(pastaTicket, 'snapshots', String(id));
  if (!fs.existsSync(path.join(src, 'spec'))) return false;
  const igual = (a, b) => fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
  const estado = 'sdd-state.json';
  const eram = fs.readdirSync(path.join(src, 'spec')).filter((n) => n !== estado);
  const hoje = (fs.existsSync(dirSpec) ? fs.readdirSync(dirSpec) : []).filter((n) => n !== estado && fs.statSync(path.join(dirSpec, n)).isFile());
  return hoje.length !== eram.length || eram.some((n) => !igual(path.join(src, 'spec', n), path.join(dirSpec, n)))
    || (fs.existsSync(path.join(src, TAREFAS)) && !igual(path.join(src, TAREFAS), path.join(pastaTicket, TAREFAS)));
}

// Mudanças vindas de comentários do Jira: o vigia acha, o Claude mede (nível) e regride a spec; aqui você vê e dá ciência.
// Mudança pedida em comentário que espera você: a spec NÃO foi alterada. Uma por vez, a mais antiga primeiro.
function caixaDecisao(l) {
  const p = pendentes(l);
  if (!p.length) return '';
  const i = p[0], [rot, cor] = NIVEL[i.nivel] || [i.nivel, 'var(--perigo)'];
  const bt = (op, texto, cls = '') => `<button class="${cls}" data-acao="mudancaDecidir" data-id="${esc(i.id)}" data-op="${op}">${esc(texto)}</button>`;
  return `<div class="dec-caixa"><div class="dec-t"><span class="dec-ic">⚠</span><b>Mudança pedida no ticket</b>
      <span class="mud-niv" style="--cor:${cor}">${esc(rot)}</span>${p.length > 1 ? `<span class="dec-fila">+${p.length - 1} na fila</span>` : ''}</div>
    <div class="mud-l1"><b>${esc(i.autor || 'alguém')}</b><span class="mud-q">${esc(quando(i.data))}</span><a href="${esc(i.link)}">ver comentário</a></div>
    <div class="dec-cm">${esc((i.texto || '').slice(0, 300))}</div>
    <div class="mud-tx">${esc(i.resumo || '')}</div>
    <div class="mud-ef"><b>A spec ainda não foi alterada.</b> ${Number.isInteger(i.passo) ? `Passo afetado: ${esc(i.passo)} (e os que dependem dele). ` : ''}${(i.cards || []).length ? `Cards atingidos: ${esc(i.cards.join(', '))}.` : ''}</div>
    <div class="dec-op">${(i.opcoes || []).map((o, k) => bt(k, o.rotulo)).join('')}${bt('nao', 'Não prosseguir', 'dec-nao')}</div></div>`;
}

const VISIVEIS = ['na_fila', 'triagem', 'triando', 'analisando', 'aplicando', 'aplicado', 'erro', 'analisado']; // os demais já foram decididos
function caixaMudancas(l) {
  const vis = l.filter((i) => VISIVEIS.includes(i.status) && !(i.status === 'analisado' && i.nivel === 'nenhum')).slice().reverse().slice(0, 5);
  if (!vis.length) return '';
  return `<div class="caixa-t">Mudanças por comentário<span>${vis.length}</span></div><div class="mudancas">${vis.map((i) => {
    const [rot, cor] = NIVEL[i.nivel] || ['ANALISANDO', 'var(--ia)'];
    return `<div class="mud" style="--cor:${cor}">
      <div class="mud-l1"><span class="mud-niv">${i.status === 'analisado' ? rot : i.status === 'aplicado' ? 'APLICADA' : i.status === 'erro' ? 'NÃO CONCLUÍDO' : `<span class="vivo-bola"></span>${i.status === 'aplicando' ? 'APLICANDO' : i.status === 'triagem' || i.status === 'triando' ? 'TRIANDO' : 'ANALISANDO'}`}</span>
        <b>${esc(i.autor || 'alguém')}</b><span class="mud-q">${esc(quando(i.data))}</span><a href="${esc(i.link)}">ver comentário</a></div>
      <div class="mud-tx">${esc(i.resumo || (i.texto || '').slice(0, 220))}</div>
      ${['analisado', 'aplicado'].includes(i.status) && i.nivel !== 'nenhum' ? `<div class="mud-ef">${i.passo !== null && i.passo !== undefined ? `Spec voltou ao passo ${esc(i.passo)}. ` : ''}${(i.cards || []).length ? `Cards atingidos: ${esc(i.cards.join(', '))} (revise na aba Tarefas).` : ''}</div>` : ''}
      ${!['na_fila', 'triagem', 'triando', 'analisando', 'aplicando'].includes(i.status) ? `<button class="mud-ok" data-acao="impactoCiente" data-id="${esc(i.id)}">Ciente</button>` : ''}
      ${['aplicado', 'erro'].includes(i.status) && i.snapshot ? `<button class="mud-ok" data-acao="mudancaDesfazer" data-id="${esc(i.id)}" title="Volta a spec e os cards ao estado de antes da aplicação">Desfazer</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// Decisão sobre a mudança pedida em comentário (ver teste-acoes.js: formato do `acoes`).
const acoes = (s) => ({
  // Decisão sobre a mudança pedida em comentário. "Não prosseguir" descarta (a spec nunca foi tocada); manter só registra;
  // consultar vira uma dúvida para o PO; aplicar guarda um snapshot e manda o Claude regredir ([aplicar]).
  async mudancaDecidir({ id, op }) {
    const t = s.ticketAberto();
    if (!t) return;
    const l = impactosDe(s.pasta(t.chave)), i = l.find((x) => x.id === id && x.status === 'aguardando_decisao');
    const o = op === 'nao' ? null : (i?.opcoes || [])[Number(op)];
    if (!i || (op !== 'nao' && !o)) return;
    if (o?.tipo === 'aplicar' && maestro.rodando(s.pasta(t.chave))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar para aplicar.');
    const ok = await vscode.window.showWarningMessage(`${o ? o.rotulo : 'Não prosseguir'}?`, { modal: true, detail: !o ? 'A mudança do comentário é descartada e a spec segue como estava (nada foi alterado).'
      : o.tipo === 'aplicar' ? `O Claude vai regredir a spec: ${o.instrucao || o.rotulo}
Um snapshot é guardado: dá para desfazer depois.`
      : o.tipo === 'consultar' ? 'Vira uma dúvida (aba Dúvidas) para você enviar ao ticket; a spec espera a resposta.' : 'Nada muda na spec.' }, 'Confirmar');
    if (!ok) return;
    i.decisao = { opcao: o ? o.rotulo : 'Não prosseguir', tipo: o ? o.tipo : 'nao_prosseguir', por: os.userInfo().username, em: new Date().toISOString() };
    if (!o) i.status = 'descartado';
    else if (o.tipo === 'aplicar') {
      snapshot(s.pasta(t.chave), dirSpec(ticketDe(t.chave) || t), i.id);
      Object.assign(i, { snapshot: true, status: 'aplicando' });
    } else i.status = 'decidido';
    s.gravar(t.chave, IMPACTOS, l);
    if (o?.tipo === 'consultar') await s.orq.sdd(['duvida', 'add', '--ref', s.pasta(t.chave), '--texto', o.instrucao || o.rotulo, '--contexto', `Comentário de ${i.autor}: ${i.resumo}`]);
    if (o?.tipo === 'aplicar') s.orq.etapa(ticketDe(t.chave), `[aplicar] Mudança escolhida no ticket ${t.chave}. Siga a seção "Aplicar a mudança escolhida" da skill sdd.\n`
      + `Opção escolhida: ${o.rotulo}\nInstrução: ${o.instrucao || o.rotulo}\nImpacto: ${i.nivel} — ${i.resumo} (passo ${i.passo ?? '?'}; cards ${(i.cards || []).join(', ') || 'nenhum'})\n`
      + `Comentário id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`, false, undefined, `Aplicando mudança de ${i.autor}`);
    s.render();
  },
  // "Não prosseguir" depois de aplicar: volta a spec e os cards ao snapshot de antes da aplicação.
  async mudancaDesfazer({ id }) {
    const t = s.ticketAberto();
    if (!t) return;
    const l = impactosDe(s.pasta(t.chave)), i = l.find((x) => x.id === id && ['aplicado', 'erro'].includes(x.status) && x.snapshot);
    if (!i) return;
    if (maestro.rodando(s.pasta(t.chave))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
    const ok = await vscode.window.showWarningMessage('Desfazer a mudança?', { modal: true, detail: 'A spec e os cards voltam ao estado de antes de aplicar. Subtarefas já atualizadas no Jira não são mexidas.' }, 'Desfazer');
    if (!ok) return;
    if (!restaurar(s.pasta(t.chave), dirSpec(ticketDe(t.chave) || t), i.id)) return vscode.window.showErrorMessage('Snapshot não encontrado: nada foi desfeito.');
    i.status = 'desfeito';
    s.gravar(t.chave, IMPACTOS, l);
    vscode.window.showInformationMessage('Mudança desfeita: spec e cards voltaram ao estado anterior.');
    s.render();
  },
  async impactoCiente({ id }) {
    const l = impactosDe(s.pasta(s.aberto)), i = l.find((x) => x.id === id);
    if (!i) return;
    i.status = 'ciente';
    s.gravar(s.aberto, IMPACTOS, l);
    s.render();
  }
});

const CSS = `
  .mudancas { display: flex; flex-direction: column; gap: 8px; margin: 0 12px 12px; }
  .mud { position: relative; padding: 9px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--cor); font-size: 12px; }
  .mud-l1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; }
  .mud-niv { display: inline-flex; align-items: center; padding: 0 6px; border-radius: var(--r-sm); font-size: 10px; font-weight: 700; color: var(--on-cor); background: var(--cor); }
  .mud-q { color: var(--text-dim); } .mud-l1 a { color: var(--accent-soft); margin-left: auto; }
  .mud-tx { margin-top: 4px; line-height: 1.45; }
  .mud-ef { margin-top: 4px; font-size: 11px; color: var(--text-dim); }
  .dec-caixa { margin: 0 12px 12px; padding: 10px 12px; border-radius: var(--r-lg); border: 2px solid var(--perigo); background: color-mix(in srgb, var(--perigo) 7%, var(--surface)); font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
  .dec-t { display: flex; align-items: center; gap: 8px; font-size: 12.5px; } .dec-ic { color: var(--perigo); }
  .dec-fila { margin-left: auto; font-size: 10.5px; color: var(--text-dim); }
  .dec-cm { padding: 6px 8px; border-radius: var(--r-md); background: var(--surface-2); font-style: italic; line-height: 1.45; word-break: break-word; }
  .dec-op { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .dec-op button { padding: 4px 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .dec-op button:first-child { background: var(--accent) !important; color: var(--on-cor); border-color: transparent !important; }
  .dec-op .dec-nao { margin-left: auto; color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 50%, transparent) !important; }
  .mud-ok { margin-top: 6px; padding: 2px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 11px; }
`;

module.exports = { NIVEL, CSS, acoes, alterou, pendentes, passosAfetados, cardsAfetados, snapshot, restaurar, caixaDecisao, caixaMudancas };
