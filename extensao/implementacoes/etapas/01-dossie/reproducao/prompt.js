// @ts-check
// Prompt da Reprodução do bug (claude -p): o passo a passo do relato vira cenários, registrados pelo bin reproducao-fluxo (BIN).
const path = require('path');
const fluxo = require('../../../../componentes/fluxo-passos');
const { evidenciasDoTicket, PASTA } = require('./evidencias-ticket');

const BIN = path.join(__dirname, '..', '..', '..', 'bin', 'reproducao-fluxo');

const REGRAS = (dir, gravar) =>
  `\n\nRegras: português; segundo plano, SEM ninguém para aprovar permissões (ação negada: use outra ferramenta ou registre como bloqueado). ` +
  `Registre TUDO por ${BIN} (a pasta vem em IMPLEMENTACAO_DIR): plano <<'FIM' [{"titulo":"...","texto":"o que fazer e o que esperar"}] FIM · iniciar Pnn · acao Pnn "<comando que repete>" · evidencia Pnn <arquivo> · concluir Pnn passou|falhou|bloqueado --nota "o que viu" · status. ` +
  `Em cada cenário: "falhou" significa que o ERRO RELATADO ACONTECEU (é o que queremos confirmar); "passou" = o comportamento estava correto; "bloqueado" = não deu para executar (diga o motivo na nota). ` +
  `Todo cenário "falhou" EXIGE evidência anexada (print, vídeo ou log) por ${BIN} evidencia: capture a sua (adb exec-out screencap -p > /tmp/repro-Pnn.png) ou reaproveite um arquivo de ${path.join(dir, PASTA)}. ` +
  `Proibido: alterar código, commit, push, INSERT/UPDATE/DELETE/DDL no banco, publicar na ferramenta de tickets. Consultas ao banco só por mapa-db (leitura). Não invente: o que não consta nas fontes é "não identificado". ` +
  `Se precisar perguntar ao usuário (ex.: falta o passo a passo), grave ${gravar} .pausa.md <<'FIM' com "motivo:", "pergunta:" e "opcoes:" (lista com "- ") e termine.`;

/** @param {{ dir: string, t: any, d: any, comandos: { nome: string, comando: string, pasta?: string }[], repos: { caminho: string, camada: string }[], gravar: string, retomada: boolean }} c */
function prompt(c) {
  const ev = evidenciasDoTicket(c.dir);
  return (
    `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] ETAPA · REPRODUÇÃO DO BUG (antes de qualquer desenvolvimento). Ticket ${c.t.link || c.t.chave}${c.t.titulo ? ` · ${c.t.titulo}` : ''} (tipo ${c.d?.tipoTicket || 'bug'}).\n` +
    `Pasta de trabalho: ${c.dir}\nLeia ${path.join(c.dir, 'dossie.md')}, ${path.join(c.dir, '.contexto-ticket.md')} (descrição e comentários, se existir), o diagnóstico/spec que o dossiê citar e os anexos do ticket na pasta ${path.dirname(c.dir)}.\n` +
    `Repositórios: ${c.repos.map((r) => `${r.camada}: ${r.caminho}`).join(' · ') || 'nenhum configurado'}\n` +
    `Comandos configurados nas Configurações > Comandos (use para subir a aplicação e o emulador; a skill de testes funcionais/Maestro cobre a jornada mobile): ${c.comandos.map((b) => `${b.nome} = ${b.comando}`).join(' | ') || '(nenhum)'}\n` +
    `Evidências já presentes no ticket, no pai ou nos irmãos (baixadas em ${path.join(c.dir, PASTA)}): ${ev.length ? ev.map((e) => `${e.arquivo}${e.de ? ` (de ${e.de})` : ''}`).join(', ') : 'nenhuma. Procure nas descrições/comentários do ticket, do pai e dos irmãos se há print, vídeo ou log citado'}.\n\n` +
    (c.retomada
      ? `RETOMADA: o fluxo já foi planejado; estado atual:\n${fluxo.estadoParaPrompt(c.dir)}\nRefaça rápido, pela ação registrada, o que já foi feito e siga do primeiro pendente. `
      : `1) Monte o passo a passo do relato (cada passo/condição relatada vira um cenário, com o resultado esperado) e registre com plano. `) +
    `2) Suba a aplicação (e o emulador, se for mobile) e execute os cenários na ordem, registrando iniciar, acao, evidencia e concluir. ` +
    `3) Ao final, o cenário em que o erro apareceu deve estar "falhou", com a evidência anexada. Se NENHUM cenário falhar, o erro NÃO foi confirmado: diga isso na nota do último cenário (não force falha).` +
    REGRAS(c.dir, c.gravar)
  );
}

module.exports = { REGRAS, prompt, BIN };
