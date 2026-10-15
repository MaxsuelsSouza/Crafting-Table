// @ts-check
// Prompts das etapas com IA da esteira de Implementação (esteira.js): 2 Entendimento, 3 Varredura, 4 Plano de mudança, 5 Implementação,
// 7 Resumo. As etapas 1 (Dossiê) e 6 (Verificação) são da extensão, sem IA. Cada prompt cita o arquivo que o Claude deve gravar.
const path = require('path');

const PAUSA = '.pausa.json', PAUSA_MD = '.pausa.md', RESPOSTAS = '.respostas.md', CONTEXTO = '.contexto-ticket.md', GRAVAR = path.join(__dirname, 'implementacao-gravar');
const ARQ = { 2: 'entendimento.md', 3: 'varredura.md', 4: 'plano-mudanca.md', 5: 'implementacao.log.md', 6: 'verificacao.json', 7: 'implementacao.md' };

// Regras comuns: segundo plano sem aprovação, escrita só pelo implementacao-gravar, pausa por .pausa.json.
const REGRAS = (d, escreveCodigo) => `\n\nRegras: português; você roda em segundo plano, SEM ninguém para aprovar permissões: ação que pede aprovação é negada, então nunca diga que algo "precisa de aprovação" — use outra ferramenta ou registre a limitação no arquivo. `
  + `ESCRITA DOS ARTEFATOS: ${d} é bloqueada para Write/Edit; para gravar um arquivo dela ("Grave em ${d}/NOME") use ${GRAVAR} NOME <<'FIM' … FIM (texto pela entrada padrão, só o nome do arquivo, sem a pasta). `
  + `No Bash use um comando simples por vez (sem ; && | encadeados). Banco SOMENTE SELECT via mapa-db. Proibido: commit, push, merge, rebase, INSERT/UPDATE/DELETE/DDL, publicar na ferramenta de tickets. `
  + (escreveCodigo ? 'Edit/Write valem só nos repositórios listados, na branch de trabalho. ' : 'Nesta etapa NÃO altere código: só leia. ')
  + `Não invente nada que não esteja nas fontes: o que não consta fica como "não identificado". Grave o arquivo da etapa só quando ela estiver pronta. `
  + `Para PAUSAR e perguntar ao usuário (sem AskUserQuestion) grave ${d}/${PAUSA_MD} com ${GRAVAR} ${PAUSA_MD} <<'FIM' e este texto simples (SEM JSON: o verificador de comandos bloqueia chaves coladas em aspas):\n`
  + `motivo: <uma palavra ou frase curta>\npergunta: <a pergunta, em uma ou mais linhas>\nopcoes:\n- <opção recomendada primeiro>\n- <outra opção>\nFIM\n`
  + `(a lista "opcoes:" pode ser omitida se a resposta é livre). Depois NÃO grave o arquivo da etapa e termine em seguida. Em nenhum arquivo escreva chave seguida de aspas sem espaço (use "{ " com espaço ou um bloco de código indentado).`;

/**
 * @typedef {{ dir: string, t: any, d: any, repos: { caminho: string, camada: string, branchPrincipal?: string }[], banco: string,
 *   branches?: Record<string, string>, correcao?: boolean, falhas?: string, gitResumo?: string, verificacao?: string, ajuste?: boolean, mapa?: string }} Ctx
 */

const TAREFA = {
  2: (c) => `ETAPA 2 · ENTENDIMENTO. Leia ${c.dir}/dossie.md, cada arquivo que ele cita nos eixos (spec, diagnóstico, cenários, documento…), ${c.dir}/${CONTEXTO} (se existir) e o briefing do dev (${c.dir}/.briefing.md, se existir). `
    + `Grave em ${c.dir}/${ARQ[2]}, seções: "Objetivo" (o que tem que mudar, em uma ou duas frases), "Critério de pronto" (como saber que acabou; se o dossiê não traz um, PROPONHA e marque "(proposto)"), `
    + `"Escopo" e "Fora de escopo", "Origem das afirmações" (cada afirmação com a fonte e a confiança: aprovado, gerado, bruto, verbal ou inferido) e "Lacunas". `
    + `Se há lacuna crítica que muda o rumo e nenhuma fonte responde, PAUSE e pergunte exatamente o que falta.`,
  3: (c) => `ETAPA 3 · VARREDURA DO CÓDIGO (somente leitura). Leia ${c.dir}/${ARQ[2]} e ${c.dir}/dossie.md. Se o dossiê trouxer mapa do código (mapa-*.md) ou plano técnico, use-os como ponto de partida e confira se ainda batem com o código atual (mapa-conferir). `
    + `Nos repositórios, responda COM EVIDÊNCIA (arquivo:linha) e grave em ${c.dir}/${ARQ[3]}: "Onde isso entra" (camada, módulos, pontos de entrada), "O que já existe" (funções, telas e regras que cobrem total ou parcialmente o pedido), `
    + `"Parecido" (algo equivalente já feito: reutilizar, estender ou criar separado, e por quê), "O que pode quebrar" (chamadores, contratos, dados, fluxos e testes que cobrem o trecho), `
    + `"Conflito com as regras" (constituição e convenções do repositório) e "Sem resposta" (o que o código não resolve). `
    + `Se achar algo parecido e a decisão muda o rumo, PAUSE com as opções (ex.: "Reutilizar X", "Estender X", "Criar separado").`,
  4: (c) => `ETAPA 4 · PLANO DE MUDANÇA (não implemente). Leia ${c.dir}/${ARQ[2]} e ${c.dir}/${ARQ[3]}. Planeje a MENOR mudança que cumpre o critério de pronto sem quebrar o que a varredura marcou. `
    + `Grave em ${c.dir}/${ARQ[4]}. Logo após o título, uma linha exata: "Repositórios afetados: <camadas separadas por vírgula, ex.: backend, mobile>" (só as camadas que serão alteradas). `
    + `Seções: "Mudanças" (por arquivo: o que muda e por quê), "Ordem", "O que não pode quebrar" (da varredura), "Testes a rodar ou criar" e "Riscos". `
    + `Se houver mais de um caminho viável e a escolha muda o comportamento, PAUSE com as opções.`,
  5: (c) => `ETAPA 5 · IMPLEMENTAÇÃO. Leia ${c.dir}/${ARQ[4]} (siga a ordem), ${c.dir}/${ARQ[3]} (o que não pode quebrar) e ${c.dir}/${ARQ[2]} (critério de pronto). `
    + `Branch de trabalho já criada em cada repositório: ${Object.entries(c.branches || {}).map(([r, b]) => `${r} → ${b}`).join(' · ') || '(nenhuma)'}. `
    + `Implemente SÓ o que está no plano, seguindo o estilo do código existente; não refatore fora do escopo, não adicione o que não foi pedido. `
    + (c.correcao ? `ESTA É UMA CORREÇÃO: a verificação automática falhou. Leia ${c.dir}/${ARQ[6]}${c.falhas ? ` e as falhas:\n${c.falhas}\n` : ''} Corrija a causa, sem enfraquecer nem apagar testes. ` : '')
    + `Ao terminar grave em ${c.dir}/${ARQ[5]}: por arquivo o que mudou e por quê, desvios do plano (com o motivo) e pendências. `
    + `Se descobrir ambiguidade que muda o comportamento, PAUSE sem gravar o log.`,
  7: (c) => `ETAPA 7 · RESUMO. Leia ${c.dir}/${ARQ[4]}, ${c.dir}/${ARQ[5]} e ${c.dir}/${ARQ[6]}. Resumo do que mudou nos repositórios (git diff --stat):\n${c.gitResumo || '(sem alterações detectadas)'}\n`
    + `Grave em ${c.dir}/${ARQ[7]}, seções: "O que mudou" (arquivo e motivo), "Como validar" (liste os cenários do QA e a reprodução do incidente que o dossiê cita, e os passos manuais), `
    + `"Verificação automática" (resultado de ${ARQ[6]}), "Riscos residuais" e "Pendências". Curto e direto: este arquivo é a entrada do QA.`
};

/** @param {number} n @param {Ctx} c */
function prompt(n, c) {
  const t = c.t, resp = c.dir && require('fs').existsSync(path.join(c.dir, RESPOSTAS)) ? `\nRespostas do usuário a perguntas anteriores (use-as): ${path.join(c.dir, RESPOSTAS)}` : '';
  const cab = `[segundo plano] [Crafting Table · Implementação ${t.chave}] Esteira de implementação do ticket ${t.link || t.chave}${t.titulo ? ` · ${t.titulo}` : ''}.\n`
    + `Pasta de trabalho: ${c.dir}\nDossiê: ${path.join(c.dir, 'dossie.md')} (modo ${c.d?.modo || '?'}, prontidão ${c.d?.prontidao || '?'})\n`
    + `Repositórios de código: ${c.repos.map((r) => `${r.camada}: ${r.caminho}${r.branchPrincipal ? ` (principal: ${r.branchPrincipal})` : ''}`).join(' · ') || 'nenhum configurado'}\nBanco: ${c.banco}${resp}\n\n`;
  const ajuste = c.ajuste ? `\n\nAJUSTE: ${path.join(c.dir, ARQ[n])} já existe e o usuário pediu mudança: leia a ÚLTIMA entrada de ${path.join(c.dir, RESPOSTAS)}, aplique o pedido e regrave o arquivo completo, sem refazer o que já está certo.` : '';
  return cab + TAREFA[n](c) + ajuste + REGRAS(c.dir, n === 5);
}

module.exports = { prompt, ARQ, PAUSA, PAUSA_MD, RESPOSTAS, CONTEXTO, GRAVAR, REGRAS };
