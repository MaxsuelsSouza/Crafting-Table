// @ts-check
// Prompts das etapas com IA da esteira de Implementação (orquestrador/rodar-etapa.js): 2 Entendimento, 3 Varredura, 4 Plano de mudança, 5 Implementação,
// 7 Resumo. As etapas 1 (Dossiê) e 6 (Verificação) são da extensão, sem IA. Cada prompt cita o arquivo que o Claude deve gravar.
// A tarefa de cada etapa mora no arquivo dela (etapas/02-entendimento.js … 07-resumo.js); aqui ficam o cabeçalho, as regras comuns e o ajuste.
const path = require('path');
const { ARQ } = require('./etapas');
const { PAUSA, PAUSA_MD, RESPOSTAS, CONTEXTO } = require('./estado');

const GRAVAR = path.join(__dirname, 'bin', 'implementacao-gravar');

// Regras comuns: segundo plano sem aprovação, escrita só pelo implementacao-gravar, pausa por .pausa.json.
const REGRAS = (d, escreveCodigo) =>
  `\n\nRegras: português; você roda em segundo plano, SEM ninguém para aprovar permissões: ação que pede aprovação é negada, então nunca diga que algo "precisa de aprovação" — use outra ferramenta ou registre a limitação no arquivo. ` +
  `ESCRITA DOS ARTEFATOS: ${d} é bloqueada para Write/Edit; para gravar um arquivo dela ("Grave em ${d}/NOME") use ${GRAVAR} NOME <<'FIM' … FIM (texto pela entrada padrão, só o nome do arquivo, sem a pasta). ` +
  `No Bash use um comando simples por vez (sem ; && | encadeados). Banco SOMENTE SELECT via mapa-db. Proibido: commit, push, merge, rebase, INSERT/UPDATE/DELETE/DDL, publicar na ferramenta de tickets. ` +
  (escreveCodigo
    ? 'Edit/Write valem só nos repositórios listados, na branch de trabalho. '
    : 'Nesta etapa NÃO altere código: só leia. ') +
  `Não invente nada que não esteja nas fontes: o que não consta fica como "não identificado". Grave o arquivo da etapa só quando ela estiver pronta. ` +
  `Para PAUSAR e perguntar ao usuário (sem AskUserQuestion) grave ${d}/${PAUSA_MD} com ${GRAVAR} ${PAUSA_MD} <<'FIM' e este texto simples (SEM JSON: o verificador de comandos bloqueia chaves coladas em aspas):\n` +
  `motivo: <uma palavra ou frase curta>\npergunta: <a pergunta, em uma ou mais linhas>\nopcoes:\n- <opção recomendada primeiro>\n- <outra opção>\nFIM\n` +
  `(a lista "opcoes:" pode ser omitida se a resposta é livre). Depois NÃO grave o arquivo da etapa e termine em seguida. Em nenhum arquivo escreva chave seguida de aspas sem espaço (use "{ " com espaço ou um bloco de código indentado).`;

/**
 * @typedef {{ dir: string, t: any, d: any, repos: { caminho: string, camada: string, branchPrincipal?: string }[], banco: string,
 *   branches?: Record<string, string>, correcao?: boolean, falhas?: string, gitResumo?: string, verificacao?: string, ajuste?: boolean, mapa?: string }} Ctx
 */

const TAREFA = {
  2: require('./etapas/02-entendimento').tarefa,
  3: require('./etapas/03-varredura').tarefa,
  4: require('./etapas/04-plano-mudanca').tarefa,
  5: require('./etapas/05-implementacao').tarefa,
  7: require('./etapas/07-resumo').tarefa
};

/** @param {number} n @param {Ctx} c */
function prompt(n, c) {
  const t = c.t,
    resp =
      c.dir && require('fs').existsSync(path.join(c.dir, RESPOSTAS))
        ? `\nRespostas do usuário a perguntas anteriores (use-as): ${path.join(c.dir, RESPOSTAS)}`
        : '';
  const cab =
    `[segundo plano] [Crafting Table · Implementação ${t.chave}] Esteira de implementação do ticket ${t.link || t.chave}${t.titulo ? ` · ${t.titulo}` : ''}.\n` +
    `Pasta de trabalho: ${c.dir}\nDossiê: ${path.join(c.dir, 'dossie.md')} (modo ${c.d?.modo || '?'}, prontidão ${c.d?.prontidao || '?'})\n` +
    `Repositórios de código: ${c.repos.map((r) => `${r.camada}: ${r.caminho}${r.branchPrincipal ? ` (principal: ${r.branchPrincipal})` : ''}`).join(' · ') || 'nenhum configurado'}\nBanco: ${c.banco}${resp}\n\n`;
  const ajuste = c.ajuste
    ? `\n\nAJUSTE: ${path.join(c.dir, ARQ[n])} já existe e o usuário pediu mudança: leia a ÚLTIMA entrada de ${path.join(c.dir, RESPOSTAS)}, aplique o pedido e regrave o arquivo completo, sem refazer o que já está certo.`
    : '';
  return cab + TAREFA[n](c) + ajuste + REGRAS(c.dir, n === 5);
}

module.exports = { prompt, ARQ, PAUSA, PAUSA_MD, RESPOSTAS, CONTEXTO, GRAVAR, REGRAS };
