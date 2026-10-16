// @ts-check
// Argumentos do claude -p para uma sessão em segundo plano só com o que a etapa usa: sem servidores MCP, sem skills nem plugins
// (e os hooks e agentes deles), e só as ferramentas da etapa. O --allowedTools libera permissão mas não tira nada do contexto; estes tiram.
// Medido no QA do WMS-14752: ~44k tokens fixos por turno, dos quais ~30k eram ferramentas, lista de skills, agentes de plugin e MCP.
// Usado por: janelas/qa/orquestrador/claude.js. O --bare faria o mesmo, mas exige ANTHROPIC_API_KEY (não funciona com a assinatura).
const fs = require('fs');
const os = require('os');
const path = require('path');

// Todo plugin ligado no ~/.claude/settings.json (e no .local), desligado só nesta sessão.
function pluginsDesligados(home = os.homedir()) {
  const r = {};
  for (const f of ['settings.json', 'settings.local.json']) {
    try {
      for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(home, '.claude', f), 'utf8')).enabledPlugins || {}))
        r[k] = false;
    } catch {
      /* sem arquivo */
    }
  }
  return r;
}

/**
 * @param {string[]} ferramentas a lista do --allowedTools (com padrões como Bash(git log:*)); vira a lista de ferramentas da sessão
 * @param {{ modelo?: string, esforco?: string, home?: string }} [o]
 */
function argsEnxutos(ferramentas, { modelo = '', esforco = '', home } = {}) {
  const nomes = [...new Set(ferramentas.map((f) => f.replace(/\(.*$/, '').trim()))].filter(
    (n) => n && n !== 'Skill' && !n.startsWith('mcp__')
  );
  return [
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--tools',
    nomes.join(','),
    '--settings',
    JSON.stringify({ enabledPlugins: pluginsDesligados(home) }),
    ...(modelo ? ['--model', modelo] : []),
    ...(esforco ? ['--effort', esforco] : [])
  ];
}

module.exports = { argsEnxutos, pluginsDesligados };
