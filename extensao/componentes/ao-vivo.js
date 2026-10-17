// @ts-check
const fs = require('fs');
const path = require('path');
const { IC } = require('./icones');

// Componente "Ao vivo": a caixa que mostra, em pilha (mais recente em cima), o que o Claude em segundo plano e os passos
// da própria extensão estão fazendo. Usado na aba Spec (refinamento/spec.js), nas Evidências do QA (janelas/qa/abas/evidencias/) e no Mergulho dos Incidentes (painel.js).
// O log fica em <pasta>/.ao-vivo.jsonl ({ em, tipo, texto, detalhe? }); a caixa expandida é marcada por .ao-vivo.expandido.
// Decisões do Claude (padrão do componente): linha tipo 'decisao' { texto: título, detalhe: motivo } também entra na aba Decisões da mesma pasta
// (.decisoes.json, origem 'claude'). O maestro converte as linhas "DECISÃO: título | motivo" do Claude nesse tipo (infra/agentes/maestro/).
// Conversas (padrão do componente): cada sessão do Claude que termina é anexada à aba Conversas do ticket/módulo da pasta (anexarConversa,
// chamada pelo maestro ao fim de cada execução e antes de iniciar a próxima).
// Pausar/retomar (padrão do componente): controle(rodando, { pausar, retomar }) → ⏸ enquanto o Claude trabalha, ▶ quando parado (ou nada, se o módulo
// não passar o comando). A caixa mostra o botão ao lado do estado; o cabeçalho do ticket usa o mesmo controle, então os dois nunca discordam.
// Conduzir em conversa (padrão do componente, DESLIGADO por padrão): c.conversa = true mostra, ao lado do estado, o botão que abre o chat do Claude
// neste ticket (data-acao="claude", a mesma ação do ícone do cabeçalho). Sem a flag o botão não existe; com ela aparece mesmo com o log vazio.
// Espelho (padrão do componente): espelhar(origem, destino, prefixo) repete no Ao vivo de `destino` cada linha anotada em `origem`, com o
// prefixo no texto (Implementações: o Ao vivo de cada grupo de subtarefas aparece no do ticket pai, "[G1] …"). Em memória: vale nesta janela.
// Para usar numa tela: CSS no <style>, caixa(dir, rodando, alvo) no corpo, script(chave) no <script> e redesenhar
// quando um dos ARQUIVOS mudar na pasta. O botão Ver tudo/Recolher manda data-painel="vivoExpandir" (painel.js).
// Várias caixas na mesma tela (Implementações: uma por grupo, lado a lado): caixa(..., id) com um id diferente em cada uma.
// Outra parte da tela que deve acompanhar a linha nova sem recarregar a página: marque com data-vivo-troca="<id único>".
const ARQ = '.ao-vivo.jsonl', EXPANDIDO = '.ao-vivo.expandido';
const ARQUIVOS = [ARQ, EXPANDIDO];
const RECENTES = 40; // linhas na caixa recolhida

// Linha nova. Fila por pasta: uma linha a cada meio segundo, para dar tempo de ler (o Claude e o ▶ escrevem em rajada).
// Fila acima de 20 linhas acelera para não ficar minutos atrasada.
const INTERVALO = 500, INTERVALO_FILA_LONGA = 100;
// Decisão do Claude → histórico da aba Decisões (mesmo arquivo e formato do hooks/decisoes.py). Escrita atômica; falha não derruba o Ao vivo.
function registrarDecisao(dir, l) {
  try {
    const arq = path.join(dir, '.decisoes.json');
    let lista = []; try { lista = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch {}
    if (!Array.isArray(lista)) lista = [];
    lista.push({ id: require('crypto').randomBytes(6).toString('hex'), data: new Date().toISOString(), origem: 'claude', titulo: String(l.texto).slice(0, 90), resumo: String(l.detalhe || l.texto), detalhes: { etapa: l.etapa || '' } });
    fs.writeFileSync(`${arq}.tmp`, JSON.stringify(lista, null, 1));
    fs.renameSync(`${arq}.tmp`, arq);
  } catch {}
}
// Sessão do Claude (claude -p) → conversa do ticket na aba Conversas, com o título da etapa. Idempotente; fora de pasta de ticket não faz nada.
// O histórico da sessão (~/.claude/projects/<cwd>/<sid>.jsonl) é procurado em qualquer projeto: o claude -p grava no do seu cwd.
function anexarConversa(dir, sid, titulo) {
  try {
    if (!sid) return false;
    const ticket = require('../infra/ticket/tickets').vincularPorPasta(sid, dir);
    if (!ticket) { // fora de pasta de ticket (Mapear com IA etc.): a aba Conversas lê esta lista (modulos/conversas.js listar)
      const lista = path.join(require('../infra/agentes/area-ia').RAIZ, 'avulsas.txt');
      fs.mkdirSync(path.dirname(lista), { recursive: true });
      const ja = fs.existsSync(lista) && fs.readFileSync(lista, 'utf8').split('\n').includes(sid);
      if (!ja) fs.appendFileSync(lista, sid + '\n');
    }
    if (titulo) {
      const raiz = path.join(require('os').homedir(), '.claude', 'projects'), chave = require('../infra/ticket/tickets').abaDaPasta(dir)?.chave;
      const arq = fs.readdirSync(raiz).map((p) => path.join(raiz, p, `${sid}.jsonl`)).find((f) => fs.existsSync(f));
      if (arq) fs.appendFileSync(arq, (fs.readFileSync(arq, 'utf8').endsWith('\n') ? '' : '\n') + JSON.stringify({ type: 'custom-title', sessionId: sid, customTitle: chave ? `${chave} · ${titulo}` : titulo }) + '\n');
    }
    return true;
  } catch { return false; }
}
const filas = new Map(); // pasta -> { linhas, ultimo, timer }
const espelhos = new Map(); // pasta de origem -> { destino, prefixo }
const espelhar = (origem, destino, prefixo = '') => { espelhos.set(origem, { destino, prefixo }); };
function anotar(dir, l) {
  const f = filas.get(dir) || { linhas: [], ultimo: 0, timer: null };
  filas.set(dir, f);
  f.linhas.push(l);
  escoar(dir, f);
  const e = espelhos.get(dir);
  if (e && e.destino !== dir) anotar(e.destino, { ...l, texto: `${e.prefixo}${l.texto ?? ''}` });
}
function escoar(dir, f) {
  if (f.timer || !f.linhas.length) return;
  const passo = f.linhas.length > 20 ? INTERVALO_FILA_LONGA : INTERVALO;
  f.timer = setTimeout(() => {
    f.timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const l = f.linhas.shift();
      fs.appendFileSync(path.join(dir, ARQ), JSON.stringify({ em: new Date().toISOString(), ...l }) + '\n');
      if (l.tipo === 'decisao') registrarDecisao(dir, l);
    } catch {}
    f.ultimo = Date.now();
    escoar(dir, f);
  }, Math.max(0, f.ultimo + passo - Date.now()));
}

// n = Infinity: o log inteiro (caixa expandida). Linha corrompida não derruba a caixa.
const ler = (dir) => { try { return fs.readFileSync(path.join(dir, ARQ), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
const linhas = (dir, n = RECENTES) => ler(dir).slice(-n).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const expandido = (dir) => fs.existsSync(path.join(dir, EXPANDIDO));
const alternarExpandido = (dir) => (expandido(dir) ? fs.rmSync(path.join(dir, EXPANDIDO), { force: true }) : fs.writeFileSync(path.join(dir, EXPANDIDO), ''));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Tipos antigos (antes da padronização) caem no equivalente novo.
const TIPO = { texto: 'fala', ferramenta: 'acao', bloqueio: 'aviso', inicio: 'etapa' };
const ICONE = { voce: '', decisao: '⚖', fala: '✦', acao: '›', aviso: '⛔', erro: '⚠', fim: '✓', etapa: '▶' };
const hora = (em) => new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// Mais recente em cima: blocos por etapa (a etapa mais nova primeiro), o título da etapa no topo do bloco e as linhas dele da mais nova para a mais antiga.
const recentesPrimeiro = (l) => l.reduce((g, x) => ((TIPO[x.tipo] || x.tipo) === 'etapa' || !g.length ? g.push([x]) : g.at(-1).push(x), g), [])
  .reverse().flatMap(([cab, ...resto]) => ((TIPO[cab.tipo] || cab.tipo) === 'etapa' ? [cab, ...resto.reverse()] : [...resto.reverse(), cab]));

// Caixa pronta para a tela: últimas 40 linhas (ou tudo, se expandida), o botão Ver tudo/Recolher (alvo: 'qa' | 'spec' | 'mergulho') e o ⏸/▶ (controles).
// c: { pausar?: data-acao do ⏸, retomar?: data-acao do ▶, dicaPausar?, dicaRetomar? }; b(acao) monta o atributo (padrão data-acao; o cabeçalho passa o seu).
const controle = (rodando, c, b = (acao) => `data-acao="${acao}"`) => (c?.retomar && require('../infra/agentes/vigia').registrarPlay(c.retomar), !c ? '' : rodando
  ? (c.pausar ? `<button class="ct-ico ct-pausa" ${b(c.pausar)} title="${esc(c.dicaPausar || 'Pausar: o Claude para e a etapa recomeça ao retomar')}">${IC.pausa}</button>` : '')
  : (c.retomar ? `<button class="ct-ico ct-play" ${b(c.retomar)} title="${esc(c.dicaRetomar || 'Retomar de onde parou')}">${IC.play}</button>` : ''));

const conversa = (c) => (c?.conversa === true ? `<button class="vivo-exp vivo-conversa" data-acao="claude" title="${esc(c.dicaConversa || 'Abre o chat do Claude neste ticket, com o contexto e os artefatos já citados')}">Conduzir em conversa</button>` : '');

const caixa = (dir, rodando, alvo, controles, id = 'aoVivo') => {
  const exp = expandido(dir), total = ler(dir).length, l = linhas(dir, exp ? Infinity : RECENTES);
  if (!l.length) return controles?.conversa === true // só com a flag: o botão existe antes de o Claude falar
    ? `<div class="caixa-t">Ao vivo<span>${rodando ? '<span class="vivo-bola"></span>Claude trabalhando' : 'parado'}${conversa(controles)}${controle(rodando, controles)}</span></div>
  <div class="folha"><div class="vazio-aba">Nada ao vivo ainda.</div></div>` : '';
  const botao = alvo && (exp || total > l.length) ? `<button class="vivo-exp" data-painel="vivoExpandir" data-id="${esc(alvo)}"
    title="${exp ? `Voltar às últimas ${RECENTES} linhas` : 'Mostrar o log inteiro, do primeiro ao mais recente'}">${exp ? 'Recolher' : `Ver tudo (${total})`}</button>` : '';
  return `<div class="caixa-t">Ao vivo<span>${rodando ? '<span class="vivo-bola"></span>Claude trabalhando' : 'parado'}${botao}${conversa(controles)}${controle(rodando, controles)}</span></div>
  <div class="folha ao-vivo ${exp ? 'expandido' : ''}" id="${esc(id)}">${recentesPrimeiro(l).map((x) => {
    const tipo = TIPO[x.tipo] || x.tipo;
    // Sua mensagem foi a última coisa do log e o Claude está rodando: ele ainda está lendo/analisando, então 3 pontinhos (some com a 1ª linha dele).
    const digitando = tipo === 'voce' && rodando && l.slice(l.lastIndexOf(x) + 1).every((y) => ['aviso', 'etapa'].includes(TIPO[y.tipo] || y.tipo)) && x === l.findLast((y) => y.tipo === 'voce') ? '<div class="vivo v-digitando" title="O Claude está analisando a sua mensagem"><span class="vp"></span><span class="vp"></span><span class="vp"></span></div>' : '';
    return digitando + (tipo === 'voce' ? `<div class="vivo v-voce"><span class="vq">${esc(hora(x.em))}</span><span class="vt">${esc(String(x.texto ?? '').slice(0, 600))}</span></div>`
      : tipo === 'etapa' ? `<div class="vivo v-etapa"><span class="vt">${esc(x.texto)}</span><span class="vq">${esc(hora(x.em))}</span></div>`
      : `<div class="vivo v-${esc(tipo)}" ${x.detalhe ? `title="${esc(x.detalhe)}"` : ''}><span class="vi">${ICONE[tipo] || '·'}</span>
        <span class="vt">${esc(String(x.texto ?? '').slice(0, 220))}</span><span class="vq">${esc(hora(x.em))}</span></div>`);
  }).join('')}</div>`;
};

// Script da webview: a tela é redesenhada a cada linha nova; a caixa volta para a rolagem em que estava.
// chave: nome no vscode.getState() (cada webview tem o seu). Espera `vscode` (acquireVsCodeApi) já definido.
const script = (chave = 'vivo') => `{
  const st = () => vscode.getState() || {}, rolagens = () => st()[${JSON.stringify(chave)}] || {};
  document.querySelectorAll('.ao-vivo[id]').forEach((av) => {
    av.scrollTop = rolagens()[av.id] || 0;
    av.addEventListener('scroll', () => vscode.setState({ ...st(), [${JSON.stringify(chave)}]: { ...rolagens(), [av.id]: av.scrollTop } }), { passive: true });
  });
  // Linha nova: o host manda só a tela nova ({ tipo: 'vivo', html }) e cada caixa (e cada [data-vivo-troca]) é trocada no lugar, sem recarregar
  // a página (a rolagem da página e a de cada caixa ficam onde a pessoa deixou). Caixa que surgiu ou sumiu: pede o redesenho completo.
  addEventListener('message', (e) => {
    if (e.data?.tipo !== 'vivo') return;
    const doc = new DOMParser().parseFromString(e.data.html, 'text/html');
    const ids = (d) => [...d.querySelectorAll('.ao-vivo[id]')].map((x) => x.id).join('|');
    if (!document.querySelector('.ao-vivo[id]') || ids(doc) !== ids(document)) return vscode.postMessage({ acao: 'vivoRecarregar' });
    doc.querySelectorAll('.ao-vivo[id]').forEach((novo) => {
      const box = document.getElementById(novo.id), topo = box.scrollTop, altura = box.scrollHeight;
      box.className = novo.className; box.innerHTML = novo.innerHTML;
      if (topo > 0) box.scrollTop = topo + box.scrollHeight - altura; // linha nova entra em cima: quem lê mais abaixo não é empurrado
      const cab = box.previousElementSibling, ncab = novo.previousElementSibling;
      if (cab?.classList.contains('caixa-t') && ncab) cab.innerHTML = ncab.innerHTML;
    });
    doc.querySelectorAll('[data-vivo-troca]').forEach((novo) => {
      const el = document.querySelector('[data-vivo-troca="' + novo.dataset.vivoTroca + '"]');
      if (el && el.innerHTML !== novo.innerHTML) el.innerHTML = novo.innerHTML;
    });
    document.dispatchEvent(new Event('vivo-trocado'));
  });
}`;

const CSS = `
  .ao-vivo { max-height: 260px; overflow: auto; font-size: 11.5px; line-height: 1.45; padding: 8px 10px; }
  .ao-vivo.expandido { max-height: 70vh; }
  .caixa-t .ct-ico { width: 20px; height: 20px; margin-left: 6px; vertical-align: middle; } .caixa-t .ct-ico svg { width: 12px; height: 12px; }
  .vivo-exp { margin-left: 8px; height: 18px; padding: 0 7px; border: 1px solid var(--border); border-radius: var(--r-md); background: none; color: var(--text);
    font: inherit; font-size: 10.5px; cursor: pointer; }
  .vivo-exp:hover { background: var(--surface-2); }
  .vivo { display: flex; gap: 6px; padding: 2px 0; }
  .vivo .vi { flex: none; width: 12px; text-align: center; color: var(--text-dim); }
  .vivo .vt { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
  .vivo .vq { flex: none; color: var(--text-dim); font-size: 10px; }
  .v-etapa { margin: 8px 0 2px; padding: 3px 6px; border-radius: var(--r-md); background: color-mix(in srgb, var(--ia) 14%, transparent);
    color: var(--ia); font-weight: 600; font-size: 11.5px; }
  .v-etapa:first-child { margin-top: 0; }
  .v-acao { padding-left: 8px; } .v-acao .vt { color: var(--text-dim); }
  .v-voce { justify-content: flex-end; } .v-voce .vt { flex: none; max-width: 80%; padding: 3px 9px; border-radius: 10px 10px 2px 10px;
    background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .v-digitando { padding: 4px 0 4px 18px; }
  .vp { display: inline-block; width: 5px; height: 5px; margin-right: 4px; border-radius: 50%; background: var(--text-dim); animation: pontos 1.2s infinite; }
  .vp:nth-child(2) { animation-delay: .2s; } .vp:nth-child(3) { animation-delay: .4s; }
  @keyframes pontos { 0%, 60%, 100% { opacity: .25; transform: none; } 30% { opacity: 1; transform: translateY(-2px); } }
  .v-voce .vq { align-self: flex-end; }
  .v-fala .vt { font-style: italic; }
  .v-decisao .vi { color: var(--accent); } .v-decisao .vt { font-weight: 600; }
  .v-aviso .vt { color: var(--warn); } .v-erro .vt { color: var(--danger); }
  .v-fim .vi { color: var(--ok); }
  .vivo-bola { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--ia); animation: pulsa 1.2s infinite; }
  @keyframes pulsa { 50% { opacity: .3; } }
`;

// Pasta do Ao vivo do ticket que pode receber o ⚡: a que está rodando, senão a que já rodou nesta janela.
const alvoRaio = (s, t) => {
  const maestro = require('../infra/agentes/maestro');
  const dirs = [s.pasta(t.chave), s.pastaAba(t.id)].filter(Boolean);
  return dirs.find((d) => maestro.rodando(d) && maestro.podeInstruir(d)) || dirs.find((d) => maestro.podeInstruir(d));
};

// Ver tudo / Recolher (Evidências do QA ou aba Spec); servicos vem do painel.js.
const acoes = (s) => ({
  // ⚡ do cabeçalho: pede a instrução e a injeta na sessão do Claude que o Ao vivo está mostrando (infra/agentes/maestro/ instruir).
  // Sem sessão no Ao vivo, abre uma nova (maestro.rodar) na pasta do Ao vivo do módulo aberto, com a instrução como prompt.
  async raio() {
    const t = s.ticketAberto(), maestro = require('../infra/agentes/maestro'), vscode = require('vscode');
    if (!t) return;
    const dir = alvoRaio(s, t);
    const texto = await vscode.window.showInputBox({ title: '⚡ Instrução direta ao Claude',
      prompt: dir ? 'Vai para a sessão aberta no Ao vivo; se ele estiver rodando, é interrompido e retoma com isto.' : 'Não há sessão no Ao vivo: abre uma nova com esta instrução.', ignoreFocusOut: true });
    if (!texto?.trim()) return;
    if (dir) {
      if (!(await maestro.instruir(dir, texto))) vscode.window.showWarningMessage('Não consegui enviar: o Claude deste ticket foi iniciado em outra janela.');
    } else {
      const novo = require('../infra/ticket/pastas').naRaiz() ? s.pasta(t.chave) : s.pastaAba(t.id);
      if (!novo || !maestro.rodar(novo, { prompt: `[segundo plano · Crafting Table · ticket ${t.chave}] Instrução direta do usuário:\n${texto.trim()}`, titulo: 'Nova sessão · instrução', aoMudar: () => s.render() }))
        vscode.window.showWarningMessage('Não consegui abrir a sessão: já há um Claude rodando neste ticket em outra janela.');
      else anotar(novo, { tipo: 'voce', texto: texto.trim() });
    }
    s.render();
  },
  vivoRecarregar() { s.render(); },
  vivoExpandir({ id }) {
    const t = s.ticketAberto();
    if (!t || !['qa', 'spec', 'mergulho', 'esteira'].includes(id)) return;
    alternarExpandido(id === 'spec' ? s.pasta(t.chave) : s.pastaAba(t.id));
    s.render();
  }
});

module.exports = { acoes, alvoRaio, anotar, espelhar, controle, anexarConversa, registrarDecisao, linhas, caixa, expandido, alternarExpandido, script, CSS, ARQUIVOS, _teste: { recentesPrimeiro } };
