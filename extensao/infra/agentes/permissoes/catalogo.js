// @ts-check
// Catálogo das permissões: cada chamada de ferramenta do Claude vira { bloco, modulo, comando, regra }, onde `regra` é o padrão do
// --allowedTools que libera aquele comando. Dois blocos, Leitura e Escrita; dentro de cada um, os módulos (Git, Banco, Shell, MCP, Arquivos,
// Web, Outras) e, dentro do módulo, os comandos. O que não é reconhecidamente só leitura vai para Escrita (na dúvida, pede permissão).
// Só regra, sem disco: contagem.js lê o histórico e index.js junta com o que o usuário marcou.

const fs = require('fs');
const path = require('path');

const BLOCOS = [
  { id: 'leitura', nome: 'Leitura' },
  { id: 'escrita', nome: 'Escrita' }
];
const MODULOS = ['Git', 'Banco', 'Shell', 'MCP', 'Arquivos', 'Web', 'Outras']; // ordem na tela

const LEITURA = ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'];
const WEB = ['WebFetch', 'WebSearch'];
const OUTRAS_LEITURA = ['ToolSearch', 'AskUserQuestion', 'TaskList', 'TaskGet', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool'];
// Ferramenta de MCP só de leitura, pelo nome (getJiraIssue, connections_list, browser_snapshot…); sql_run e o resto vão para Escrita.
const MCP_LEITURA = /^(get|list|search|read|fetch|find|lookup|describe|query|whoami|discover)|_list$|schema|information|status|userinfo|browser_(snapshot|take_screenshot|console_messages|network_requests?|tabs)$/i;
const ESCRITA = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const SH_LEITURA = ['cat', 'ls', 'head', 'tail', 'grep', 'rg', 'find', 'wc', 'du', 'df', 'stat', 'file', 'tree', 'pwd', 'jq', 'diff', 'which', 'realpath', 'basename', 'dirname', 'sort', 'uniq', 'cut', 'less'];
const SH_BANCO = ['sql', 'sqlplus', 'sqlcl', 'psql', 'mysql', 'sqlite3'];
const GIT_LE = ['status', 'log', 'diff', 'show', 'branch', 'fetch', 'rev-parse', 'rev-list', 'ls-remote', 'for-each-ref', 'merge-base', 'cherry', 'describe', 'blame', 'ls-files', 'cat-file', 'name-rev', 'grep', 'reflog', 'shortlog', 'ls-tree', 'check-ignore'];

// Programas com subcomando ("npm run", "docker ps"); nos outros, a 2ª palavra é argumento (ls pasta, which node) e não entra no nome.
const COM_SUB = ['npm', 'npx', 'yarn', 'pnpm', 'docker', 'kubectl', 'gh', 'glab', 'mvn', 'gradle', 'gradlew', 'adb', 'pip', 'pip3', 'cargo', 'go', 'dotnet', 'systemctl', 'code', 'claude', 'apt', 'flutter'];

// Palavras do próprio shell (não são programas): não viram comando.
const SINTAXE = ['cd', 'for', 'do', 'done', 'if', 'then', 'else', 'elif', 'fi', 'while', 'until', 'case', 'esac', 'in', 'true', 'false', 'exit', 'return', 'export', 'set', 'local', 'shift', 'break', 'continue', 'function', 'wait', 'source', '.'];

// Comando de shell → partes que o Claude Code confere uma a uma (&&, ||, ;, |, quebra de linha), fora de aspas; o corpo de um heredoc
// (<<EOF … EOF) não conta. Sem `cd` e sem VAR=valor na frente.
function partes(cmd) {
  const txt = String(cmd || '').replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(?=\n|$)/g, (m) => m.slice(0, m.indexOf('\n')));
  const out = [];
  let atual = '',
    aspa = '';
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspa) {
      if (c === aspa) aspa = '';
      else if (c === '\\' && aspa === '"') atual += c + (txt[++i] ?? '');
      if (c !== '\\' || aspa !== '"') atual += c;
      continue;
    }
    if (c === "'" || c === '"') aspa = c;
    if (c === ';' || c === '\n' || c === '|' || (c === '&' && txt[i + 1] === '&')) {
      out.push(atual);
      atual = '';
      if (txt[i + 1] === c) i++;
      continue;
    }
    atual += c;
  }
  out.push(atual);
  return out.map((p) => p.trim().replace(/^(\w+=\S*\s+)+/, '').replace(/^[({]\s*/, '')).filter((p) => /^[\w./~-]/.test(p) && !SINTAXE.includes(p.split(/\s/)[0]));
}

// Programas do PATH (lido uma vez): texto que sobra de um script com aspas quebradas não vira comando.
let binarios = null;
const existe = (prog) =>
  (binarios ||= new Set(
    String(process.env.PATH || '')
      .split(path.delimiter)
      .flatMap((d) => {
        try {
          return fs.readdirSync(d);
        } catch {
          return [];
        }
      })
  )).has(prog);

// Primeiras palavras que identificam o comando: "npm run", "python3", "git log" (sem o -C <pasta> do git).
const chave = (p) => {
  const t = p.split(/\s+/);
  if (t[0] === 'git') {
    const resto = t.slice(1);
    while (resto[0]?.startsWith('-')) resto.splice(0, resto[0] === '-C' || resto[0] === '-c' ? 2 : 1);
    return { prog: 'git', sub: resto[0] || '' };
  }
  const prog = t[0].split('/').pop() || t[0],
    seg = t[1];
  return { prog, sub: COM_SUB.includes(prog) && seg && /^[a-z][\w:-]*$/i.test(seg) ? seg : '' };
};

const item = (leitura, modulo, comando, regras) => ({ bloco: leitura ? 'leitura' : 'escrita', modulo, comando, regras });

// Uma parte de comando de shell → item do catálogo.
function deShell(p) {
  const { prog, sub } = chave(p),
    nome = sub ? `${prog} ${sub}` : prog;
  if (prog === 'git') return item(GIT_LE.includes(sub), 'Git', nome, [`Bash(${nome}:*)`, `Bash(git -C * ${sub}:*)`]);
  return item(SH_LEITURA.includes(prog), SH_BANCO.includes(prog) ? 'Banco' : 'Shell', nome, [`Bash(${nome}:*)`]);
}

// Ferramenta que não é shell → item do catálogo.
function deFerramenta(nome) {
  const m = nome.match(/^mcp__(.+?)__(.+)$/);
  if (m) return item(MCP_LEITURA.test(m[2]), /sql|oracle|postgres|mysql|banco/i.test(m[1]) ? 'Banco' : 'MCP', `${m[1]} · ${m[2]}`, [nome]);
  if (LEITURA.includes(nome) || ESCRITA.includes(nome)) return item(LEITURA.includes(nome), 'Arquivos', nome, [nome]);
  if (WEB.includes(nome)) return item(true, 'Web', nome, [nome]);
  return item(OUTRAS_LEITURA.includes(nome), 'Outras', nome, [nome]);
}

/** Uma chamada de ferramenta ({ name, input }) → itens do catálogo (Bash pode virar vários). */
const itens = (c) =>
  c.name === 'Bash'
    ? partes(c.input?.command)
        .filter((p) => /^(\.{0,2}|~)\/[\w./-]*[\w.+-]+(\s|$)/.test(p) || existe(p.split(/\s/)[0]))
        .map(deShell)
        .filter((it) => it.modulo !== 'Git' || /^git( [a-z][\w-]*)?$/.test(it.comando)) // git -C "pasta com espaço": sem subcomando legível
    : [deFerramenta(c.name)];

module.exports = { BLOCOS, MODULOS, itens, _teste: { partes, chave } };
