// @ts-check
// Prompt da 1.5 Reproduzir (claude -p): executa no ambiente, já de pé na ref certa, os cenários que a 1.3 planejou, registrando pelo bin
// reproducao-fluxo (BIN). Cada cenário que falha precisa de PRINT e VÍDEO (a tela é gravada pela extensão; o print, a IA tira).
// REGRAS: o que vale para todos os claude -p da Reprodução.
const path = require('path');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { EVIDENCIAS_MD } = require('./evidencias-ticket');

const BIN = path.join(__dirname, '..', '..', '..', 'bin', 'reproducao-fluxo');

const REGRAS = (dir, gravar) =>
  `\n\nRegras: português; segundo plano, SEM ninguém para aprovar permissões (ação negada: use outra ferramenta ou registre como bloqueado). ` +
  `Registre TUDO por ${BIN} (a pasta vem em IMPLEMENTACAO_DIR): plano <<'FIM' [{"titulo":"...","texto":"o que fazer e o que esperar","fonte":"de onde veio"}] FIM · iniciar Pnn · acao Pnn "<comando que repete>" · evidencia Pnn <arquivo> · concluir Pnn passou|falhou|bloqueado --nota "o que viu" · status. ` +
  `Em cada cenário: "falhou" significa que o ERRO RELATADO ACONTECEU (é o que queremos confirmar); "passou" = o comportamento estava correto; "bloqueado" = não deu para executar (diga o motivo na nota). ` +
  `Proibido: alterar código, commit, push, checkout, INSERT/UPDATE/DELETE/DDL no banco, publicar na ferramenta de tickets. Consultas ao banco só por mapa-db (leitura). Não invente: o que não consta nas fontes é "não identificado". ` +
  `Se precisar perguntar ao usuário, grave ${gravar} .pausa.md <<'FIM' com "motivo:", "pergunta:" e "opcoes:" (lista com "- ") e termine.`;

/**
 * @param {{ dir: string, t: any, d: any, repos: { caminho: string, camada: string }[], gravar: string, retomada: boolean,
 *   a: any, pronto: any, refs: Record<string, { ref: string, commit: string }> }} c  a: o ambiente (infra/ambientes); pronto: o que o subir devolveu
 */
function prompt(c) {
  const print = c.a.comoPrint('/tmp/repro-Pnn.png', c.pronto),
    refs = Object.entries(c.refs || {})
      .map(([r, x]) => `${path.basename(r)} em ${x.ref} (${String(x.commit).slice(0, 10)})`)
      .join(' · ');
  return (
    `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] REPRODUÇÃO 1.5 · REPRODUZIR (antes de qualquer desenvolvimento). Ticket ${c.t.link || c.t.chave}${c.t.titulo ? ` · ${c.t.titulo}` : ''} (tipo ${c.d?.tipoTicket || 'bug'}).\n` +
    `Pasta de trabalho: ${c.dir}. Leia ${path.join(c.dir, EVIDENCIAS_MD)} (massa de dados, fluxo, esperado × obtido) antes de começar.\n` +
    `Ambiente PRONTO no ${c.a.rotulo} (${c.a.texto(c.pronto)}), com o código em: ${refs || 'checkout atual'}. Não suba nada nem troque de branch.\n` +
    `Como olhar a aplicação: ${c.a.guia()}.\n` +
    `A tela está sendo GRAVADA EM VÍDEO pela extensão (o vídeo é anexado aos cenários no fim). ` +
    (c.retomada
      ? `RETOMADA: alguns cenários já rodaram; refaça rápido, pela ação registrada, o que já foi feito e siga do primeiro pendente. `
      : '') +
    `Estado do roteiro:\n${fluxo.estadoParaPrompt(c.dir)}\n` +
    `Para cada cenário pendente, na ordem: iniciar Pnn; execute com a massa de dados; acao Pnn "<a ação exata que repete o passo>"; ` +
    `tire um PRINT do resultado (${print}) e guarde com evidencia Pnn /tmp/repro-Pnn.png; concluir Pnn passou|falhou|bloqueado --nota "o que viu". ` +
    `Todo cenário "falhou" EXIGE o print (sem print e vídeo o erro não conta como reproduzido). Se NENHUM cenário falhar, o erro NÃO foi confirmado: não force falha.` +
    REGRAS(c.dir, c.gravar)
  );
}

module.exports = { REGRAS, prompt, BIN };
