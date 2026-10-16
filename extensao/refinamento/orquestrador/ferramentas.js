// @ts-check
// Ferramentas do claude -p do refinamento (allowlist): sdd-state, plugin mapa e o gravador. Sem Write/Edit em nenhuma execução.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sddState } = require('../../configuracao/configuracao');
const vagas = require('../../agentes/etapas');

// Marketplace de pasta (directory): o Claude resolve ${CLAUDE_PLUGIN_ROOT} para a pasta de origem, não para a cópia em plugins/cache
// (installPath). A allowlist precisa dos dois caminhos, senão o sdd-state é negado no claude -p e a spec nunca nasce.
const origensSdd = () => {
  const id = require('../../agentes/etapas').escolha('refinamento.sdd');
  if (id.tipo !== 'plugin') return [];
  const [nome, mercado] = String(id.id).split('@');
  try {
    const m = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), '.claude', 'plugins', 'known_marketplaces.json'), 'utf8')
    )[mercado];
    return m?.source?.source === 'directory'
      ? [path.join(m.source.path, 'plugins', nome, 'bin', 'sdd-state')].filter((b) => fs.existsSync(b))
      : [];
  } catch {
    return [];
  }
};
const binsSdd = () => [
  ...new Set(
    [
      sddState(),
      ...origensSdd(),
      path.join(os.homedir(), '.claude', 'plugins-locais', 'crafting', 'plugins', 'sdd', 'bin', 'sdd-state')
    ].filter(Boolean)
  )
];
// Plugins de cada etapa (Configurações > Plugins, agentes/etapas.js). Padrão: "mapa" (mapeamento do código do passo 3) e "foco" (texto curto
// em tudo que o Claude escreve: regras + medição dos .md) moram na extensão e só o maestro carrega (--plugin-dir).
const MAPA = () => vagas.raiz('refinamento.mapa') || '';
// Sem Write/Edit em nenhuma execução: o que o Claude grava passa pelo refinamento-gravar (só .md da spec, constituição e memória do passo).
// `escreve` false = só lê (início da spec, triagem e impacto de comentário: a análise não pode mexer na spec).
const GRAVAR = path.join(__dirname, '..', 'bin', 'refinamento-gravar');
const FERRAMENTAS = (escreve = true) => [
  ...binsSdd().map((b) => `Bash(${b}:*)`),
  `Bash(${MAPA()}/bin/mapa-git:*)`,
  `Bash(${MAPA()}/bin/mapa-conferir:*)`,
  `Bash(${MAPA()}/bin/mapa-db:*)`,
  ...(escreve ? [`Bash(${GRAVAR}:*)`] : []),
  'Read',
  'Glob',
  'Grep',
  'Skill',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(git diff:*)'
];

module.exports = { binsSdd, MAPA, GRAVAR, FERRAMENTAS };
