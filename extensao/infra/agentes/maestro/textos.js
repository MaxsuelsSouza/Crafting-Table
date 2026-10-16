// @ts-check
// Textos do Ao vivo: o que o usuário lê de cada ferramenta do Claude e de cada comando do sdd-state (padronize/ajuste só aqui).
const os = require('os');
const path = require('path');

const curto = (s) => String(s || '').replaceAll(os.homedir(), '~').replace(/\s+/g, ' ').trim();
const nome = (p) => path.basename(String(p || ''));

// ── Textos do Ao vivo: tudo o que o usuário lê sai daqui (padronize/ajuste só neste bloco) ──
// Tipos: etapa (título da execução), fala (o que o Claude diz), acao (o que ele faz), aviso (bloqueio), erro, fim.
const PASSOS = ['Constituição', 'Especificação', 'Clarificação', 'Plano técnico', 'Tarefas', 'Análise de qualidade', 'Implementação'];
/** @type {[RegExp, string][]} */
const DOCS = [ // caminho → nome que o usuário entende
  [/constitution\.md$/, 'a constituição'],
  [/constituicao-wms-mapeamento\.md$/, 'o mapeamento do código (base da constituição)'],
  [/spec\.md$/, 'a especificação'], [/plan\.md$/, 'o plano técnico'], [/tasks\.md$/, 'as tarefas'],
  [/analise\.md$/, 'a análise de consistência'], [/\.ticket\.json$/, 'os dados do ticket'], [/SKILL\.md$/, 'o método SDD'],
  [/\.notas\.html$/, 'as notas do ticket'], [/\.handoff-backend\.md$/, 'a análise do backend'], [/\.handoff-mobile\.md$/, 'a análise do mobile']
];
/** @type {[RegExp, string][]} */
const REPOS = [[/novo-wms-backend/, 'backend'], [/wms-mobile/, 'mobile'], [/WMS\/specs/, 'specs']];
const doc = (p) => {
  const achado = DOCS.find(([r]) => r.test(p || ''));
  if (achado) return achado[1];
  const repo = REPOS.find(([r]) => r.test(p || ''));
  return `${nome(p)}${repo ? ` (${repo[1]})` : ''}`;
};
const STATUS_TAREFA = { pendente: 'pendente', em_andamento: 'em andamento', feita: 'feita' };
// Comandos do sdd-state → frase. a = { sub, n, opt }.
const SDD = {
  init: () => 'Criando a pasta da spec no repositório de specs',
  status: () => 'Conferindo onde a spec parou', json: () => 'Conferindo onde a spec parou',
  check: () => 'Conferindo se algum arquivo da spec mudou',
  iniciar: (a) => `Começando o passo ${a.n} · ${PASSOS[a.n] || ''}`,
  concluir: (a) => `Passo ${a.n} · ${PASSOS[a.n] || ''} pronto para sua revisão`,
  ajuste: (a) => `Reabrindo o passo ${a.n} para ajuste`,
  aprovar: () => 'Tentou aprovar um passo (só você aprova)',
  pergunta: (a) => (a.sub === 'add' ? `Pergunta para você: “${a.opt.texto || ''}”` : a.sub === 'responder' ? 'Registrando sua resposta' : 'Descartando uma pergunta'),
  comentario: (a) => `Comentário classificado: ${({ resposta: 'responde uma pergunta', mudanca: 'pede mudança', ruido: 'sem ação' })[a.opt.tipo] || ''}`,
  impacto: (a) => (a.sub === 'aplicado' ? 'Mudança aplicada na spec' : `Análise do comentário registrada (impacto ${a.opt.nivel || ''})`),
  duvida: (a) => `Dúvida registrada: “${a.opt.texto || ''}”`,
  achado: (a) => (a.sub === 'add' ? `Achado ${a.opt.severidade || ''}: ${a.opt.descricao || ''}` : a.sub === 'resolver' ? 'Achado resolvido' : 'Achado aceito com justificativa'),
  tarefa: (a) => `Tarefa ${a.sub}: ${STATUS_TAREFA[a.opt.status] || a.opt.status || ''}`
};
const aspas = (cmd) => [...String(cmd).matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
function fraseSdd(cmd) {
  const t = aspas(cmd), k = t.findIndex((x) => /\/sdd-state$|^sdd-state$/.test(x));
  const [c, sub] = [t[k + 1], t[k + 2]];
  const opt = {};
  for (let i = k + 2; i < t.length; i++) if (t[i].startsWith('--')) opt[t[i].slice(2)] = t[i + 1];
  return SDD[c]?.({ sub, n: Number(sub), opt }) || `Atualizando a spec (${c})`;
}
// Uma ferramenta do Claude → { tipo, texto } (null = não mostra).
function linhaFerramenta(f) {
  const i = f.input || {};
  const acao = (texto) => ({ tipo: 'acao', texto });
  if (f.name === 'Read') return acao(`Lendo ${doc(i.file_path)}`);
  if (f.name === 'Write') return acao(`Escrevendo ${doc(i.file_path)}`);
  if (f.name === 'Edit' || f.name === 'MultiEdit') return acao(`Atualizando ${doc(i.file_path)}`);
  if (f.name === 'Glob') return acao(`Procurando arquivos ${curto(i.pattern).slice(0, 60)}`);
  if (f.name === 'Grep') return acao(`Buscando “${curto(i.pattern).slice(0, 60)}” no código`);
  if (f.name === 'Skill') return acao(/sdd/.test(i.skill) ? 'Carregando o método SDD' : /mapa/.test(i.skill) ? 'Carregando o método de mapeamento do código' : `Usando a skill ${i.skill}`);
  if (f.name === 'Bash') {
    const c = curto(i.command);
    if (/sdd-state/.test(c)) return acao(fraseSdd(i.command));
    if (/mapa-conferir/.test(c)) return acao(`Conferindo as evidências do mapeamento${/handoff-(backend|mobile)/.test(c) ? ` (${c.match(/handoff-(backend|mobile)/)[1]})` : ''}`);
    if (/mapa-db/.test(c)) return acao(/\bstatus\b/.test(c) ? 'Conferindo a configuração do banco' : 'Consultando o banco (só leitura)');
    if (/mapa-git/.test(c)) return acao(`Consultando o histórico do ${/wms-mobile/.test(c) ? 'mobile' : /novo-wms-backend/.test(c) ? 'backend' : 'repositório'} (só leitura)`);
    if (/^git\b/.test(c)) return acao('Consultando o histórico do repositório');
    if (/^(ls|find)\b/.test(c)) return acao('Listando arquivos');
    if (/^(cat|head|tail)\b/.test(c)) return acao(`Lendo ${doc(aspas(c)[1])}`);
    return acao(`Rodando um comando (${c.split(' ')[0]})`);
  }
  if (['ToolSearch', 'TodoWrite'].includes(f.name)) return null;
  return acao(`Usando ${f.name}`);
}

module.exports = { curto, nome, PASSOS, DOCS, REPOS, doc, STATUS_TAREFA, SDD, aspas, fraseSdd, linhaFerramenta };
