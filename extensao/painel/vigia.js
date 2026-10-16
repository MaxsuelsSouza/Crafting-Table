// @ts-check
// Vigia (conceito global): um observador que olha toda execução em segundo plano (painel/maestro.js) e fala quando algo está estranho.
//   1. Busca longa: o Claude passou mais de 2 min só lendo/procurando (Read, Glob, Grep…) sem produzir nada (Write, Edit, Bash, resposta)
//      → abre uma caixa explicando o que está acontecendo, com 3 opções e o campo "Outra resposta"; a escolha vira instrução para ele.
//   2. Play repetido: mais de 3 cliques no ▶ da mesma pasta em 1 min sem o Ao vivo andar → caixa de "parece travado", com saídas.
// Usado em: maestro.rodar (iniciar/atividade/encerrar), ao-vivo.controle (registrarPlay) e o despacho de cliques do painel.js (clique).
// Para um módulo novo não precisa fazer nada: tudo que roda por maestro.rodar e usa aoVivo.controle já é vigiado.
// Ajustes por ambiente (testes): CRAFTING_VIGIA_BUSCA_MS (padrão 120000), CRAFTING_VIGIA_CLIQUE_MS (padrão 60000).
const BUSCA_MS = Number(process.env.CRAFTING_VIGIA_BUSCA_MS) || 120000;
const JANELA_CLIQUES_MS = Number(process.env.CRAFTING_VIGIA_CLIQUE_MS) || 60000;
const MAX_CLIQUES = 3; // o 4º clique dispara
const SO_BUSCA = new Set(['Read', 'Glob', 'Grep', 'ToolSearch', 'TodoWrite', 'Skill']); // não produzem nada: contam como "procurando"

const execucoes = new Map(); // pasta -> { desde, ultimas: string[], perguntando }
const cliques = new Map(); // pasta -> [instantes]
const plays = new Set(); // nomes das ações de ▶ (registrados por ao-vivo.controle)
const cfg = { render: () => {}, perguntar: /** @type {null | ((p: any) => Promise<string | null>)} */ (null), agora: () => Date.now() };
let timer = null;

/** Troca dependências (render do painel, pergunta, relógio) — o painel.js e os testes usam. */
const configurar = (o) => { Object.assign(cfg, o); };
const registrarPlay = (acao) => { if (acao) plays.add(acao); };

function iniciar(dir) {
  execucoes.set(dir, { desde: cfg.agora(), ultimas: [], perguntando: false });
  if (!timer) { timer = setInterval(vigiar, Math.max(200, Math.min(10000, BUSCA_MS / 4))); timer.unref?.(); }
}
function encerrar(dir) {
  execucoes.delete(dir);
  if (!execucoes.size && timer) { clearInterval(timer); timer = null; }
}
/** Uma ferramenta foi usada. Só leitura/busca não é progresso; qualquer outra coisa zera o relógio. */
function atividade(dir, ferramenta, texto = '') {
  const e = execucoes.get(dir);
  if (!e) return;
  cliques.delete(dir); // o Ao vivo anda: não está travado
  if (SO_BUSCA.has(ferramenta)) { e.ultimas = [...e.ultimas, texto].filter(Boolean).slice(-4); return; }
  e.desde = cfg.agora(); e.ultimas = [];
}
/** O Claude falou (resposta/decisão): também é progresso. */
const progresso = (dir) => { const e = execucoes.get(dir); if (e) { e.desde = cfg.agora(); e.ultimas = []; } };

function vigiar() {
  for (const [dir, e] of execucoes) {
    const ms = cfg.agora() - e.desde;
    if (ms < BUSCA_MS || e.perguntando) continue;
    e.perguntando = true;
    perguntarBusca(dir, e, ms).finally(() => { const x = execucoes.get(dir); if (x) { x.perguntando = false; x.desde = cfg.agora(); } });
  }
}

async function perguntarBusca(dir, e, ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  const p = {
    tipo: 'busca', dir, titulo: `O Claude está há ${min} min só procurando e analisando`,
    detalhe: `Ele não gravou nem executou nada nesse tempo. Últimas ações: ${e.ultimas.length ? e.ultimas.join(' → ') : 'leitura e busca de arquivos'}. Pode ser que não ache o que precisa. O que prefere?`,
    opcoes: [
      { rotulo: 'Continuar procurando', instrucao: null },
      { rotulo: 'Prosseguir com o que já tem', instrucao: 'Pare de procurar. Prossiga com o que já encontrou; registre como DECISÃO a premissa que assumiu e o que ficou sem confirmação.' },
      { rotulo: 'Pular esse ponto', instrucao: 'Pule o que está te travando e siga o resto da etapa; no fim, liste o que ficou pendente e por quê.' }
    ]
  };
  await responder(p);
}

/** Registra um clique em ▶; devolve true se disparou a caixa. dir pode ser null (sem ticket aberto). */
function clique(acao, dir) {
  if (!dir || !plays.has(acao)) return false;
  const agora = cfg.agora(), l = [...(cliques.get(dir) || []).filter((t) => agora - t < JANELA_CLIQUES_MS), agora];
  cliques.set(dir, l);
  if (l.length <= MAX_CLIQUES) return false;
  cliques.delete(dir);
  const p = {
    tipo: 'cliques', dir, titulo: `Você clicou em ▶ ${l.length} vezes e nada mudou`,
    detalhe: 'Parece que a etapa está travada ou ainda iniciando. O que prefere?',
    opcoes: [
      { rotulo: 'Esperar mais um pouco', instrucao: null },
      { rotulo: 'Mandar o Claude seguir de onde parou', instrucao: 'Continue de onde parou. Se algo te impede de avançar, diga o que é em uma frase e siga com o que for possível.' },
      { rotulo: 'Parar o Claude', parar: true }
    ]
  };
  responder(p);
  return true;
}

async function responder(p) {
  const r = await (cfg.perguntar || perguntarNoVSCode)(p); // { opcao } | { texto } | null
  if (!r) return;
  const maestro = require('./maestro');
  const op = r.opcao != null ? p.opcoes[r.opcao] : null;
  if (op?.parar) maestro.parar(p.dir);
  else {
    const texto = op ? op.instrucao : String(r.texto || '').trim();
    if (texto) {
      if (maestro.podeInstruir(p.dir)) await maestro.instruir(p.dir, texto);
      else {
        try { require('vscode').window.showWarningMessage('Não há sessão desta janela para receber a resposta: use o ⚡ do cabeçalho para abrir uma nova.'); } catch { /* fora do VS Code */ }
      }
    }
  }
  try { require('../componentes/ao-vivo').anotar(p.dir, { tipo: 'voce', texto: `Vigia: ${p.titulo} → ${op ? op.rotulo : r.texto}` }); } catch { /* sem Ao vivo */ }
  cfg.render();
}

// Caixa padrão: a mensagem com as 3 opções + "Outra resposta…" (abre um campo de texto). Fechar sem escolher = não faz nada.
async function perguntarNoVSCode(p) {
  const vscode = require('vscode'), OUTRA = 'Outra resposta…';
  const escolha = await vscode.window.showWarningMessage(`${p.titulo}`, { modal: true, detail: p.detalhe }, ...p.opcoes.map((o) => o.rotulo), OUTRA);
  if (!escolha) return null;
  if (escolha === OUTRA) {
    const texto = await vscode.window.showInputBox({ title: p.titulo, prompt: 'Diga ao Claude o que fazer', ignoreFocusOut: true });
    return texto?.trim() ? { texto } : null;
  }
  return { opcao: p.opcoes.findIndex((o) => o.rotulo === escolha) };
}

module.exports = { configurar, registrarPlay, iniciar, encerrar, atividade, progresso, clique, vigiar, BUSCA_MS, _teste: { execucoes, cliques, plays } };
