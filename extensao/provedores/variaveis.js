// @ts-check
const vscode = require('vscode');

// Variáveis do provedor: o que muda de empresa para empresa (site, projeto, board, etapas de cada módulo…) e que o código
// nunca assume. Ficam na setting global craftingTable.variaveis: { chave: { valor, descricao, origem, atualizado } }.
// origem: 'manual' (o usuário editou) | 'ia' (o agente preencheu, a partir de definicoes). Variável sem valor = pendência: o
// fluxo que depende dela avisa para configurar, em vez de usar um valor fixo.
// Migração: sem a variável gravada, cai nos settings antigos (jiraSite, jiraProjeto, jiraBoard, etapasExtras) e no
// globalState.labelQA (que continuam lá; nada é apagado). Valores que só existiam no código não são sugeridos.
//   ler(chave) · todas() · gravar(chave, valor, origem) · definicoes · vincular(globalState)

/** @typedef {{ chave: string, rotulo: string, descricao: string, usadaEm: string, tipo: 'texto' | 'lista', escolha?: 'projetos' | 'boards' | 'status' | 'labels' }} Definicao */

/** @type {Definicao[]} */
const definicoes = [
  { chave: 'site', rotulo: 'Site', tipo: 'texto', usadaEm: 'todas as chamadas à ferramenta e os links dos tickets',
    descricao: 'Endereço da ferramenta da organização (no Jira: https://<org>.atlassian.net). Preenchido ao conectar a conta.' },
  // projeto e boardPrincipal são listas (a pessoa pode estar em mais de um); um valor antigo em texto vira lista de um item.
  { chave: 'projeto', rotulo: 'Projetos', tipo: 'lista', escolha: 'projetos', usadaEm: 'lista de tickets vinculados, boards e etapas',
    descricao: 'Chaves dos projetos onde ficam os tickets em que você trabalha (ex.: WMS). Pode ser mais de um.' },
  { chave: 'boardPrincipal', rotulo: 'Boards', tipo: 'lista', escolha: 'boards', usadaEm: 'filtro por etapa dos vinculados e lista de Incidentes',
    descricao: 'Boards em que você trabalha; as colunas deles viram as etapas do filtro dos vinculados (colunas de mesmo nome se juntam). Pode ser mais de um.' },
  { chave: 'etapasExtras', rotulo: 'Etapas extras', tipo: 'lista', escolha: 'status', usadaEm: 'filtro por etapa dos vinculados',
    descricao: 'Status que não são coluna do board mas também valem como etapa no filtro.' },
  { chave: 'tipoIncidente', rotulo: 'Tipo de incidente', tipo: 'texto', usadaEm: 'lista de tickets do módulo Incidentes',
    descricao: 'A caixa de vinculados do módulo Incidentes mostra os tickets deste tipo de item (ex.: Incident). Sem ela, a caixa não busca nada.' },
  { chave: 'etapasQA', rotulo: 'Etapas de QA', tipo: 'lista', escolha: 'status', usadaEm: 'lista de tickets do módulo QA',
    descricao: 'A caixa de vinculados do módulo QA mostra só os tickets nestas etapas: os que estão prontos para o QA testar. Nome alternativo do mesmo status com "|" (ex.: Pronto para QA|Pronto p/ QA).' },
  { chave: 'labelQA', rotulo: 'Label de QA', tipo: 'texto', escolha: 'labels', usadaEm: 'lista de tickets do módulo QA',
    descricao: 'Junto com as Etapas de QA: só entram na caixa do QA os tickets com esta label (é como o time marca o que é do QA).' },
  { chave: 'etapasImplementacao', rotulo: 'Etapas de implementação', tipo: 'lista', escolha: 'status', usadaEm: 'lista de tickets do módulo Implementações',
    descricao: 'A caixa de vinculados do módulo Implementações mostra só os tickets nestas etapas: os disponíveis para desenvolver (ex.: Buffer, Não iniciado, Em andamento|In progress).' }
];

const def = (chave) => definicoes.find((d) => d.chave === chave);
let globalState = null; // para o labelQA antigo
let testeCfg = null; // testes: troca a setting
const cfg = () => testeCfg || vscode.workspace?.getConfiguration?.('craftingTable');

const guardadas = () => { const o = cfg()?.get?.('variaveis'); return o && typeof o === 'object' ? o : {}; };
const vazio = (v) => (Array.isArray(v) ? !v.length : !String(v ?? '').trim());
const normalizar = (chave, v) => {
  if (def(chave)?.tipo === 'lista') return (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  const t = String(v ?? '').trim();
  return chave === 'site' ? t.replace(/\/+$/, '') : t;
};

// Valor vindo dos settings antigos (nunca de um valor da empresa no código); vazio se não houver.
function migrado(chave) {
  const c = cfg();
  const antigo = { site: () => c?.get?.('jiraSite'), projeto: () => c?.get?.('jiraProjeto'), boardPrincipal: () => c?.get?.('jiraBoard'),
    etapasExtras: () => c?.get?.('etapasExtras'), labelQA: () => globalState?.get?.('labelQA') }[chave];
  return normalizar(chave, antigo ? antigo() : '');
}
// Derivado dos tickets que o usuário já tem na lista (site e projeto do primeiro): também não é valor fixo.
function doUsuario(chave) {
  if (chave !== 'site' && chave !== 'projeto' || testeCfg) return '';
  try {
    const t = require('../infra/tickets').listar().filter((x) => x.provedor !== 'documento' && !String(x.site || '').startsWith('documento:'));
    return chave === 'site' ? normalizar(chave, t.find((x) => x.site)?.site) : normalizar(chave, t.find((x) => x.projeto)?.projeto || (t[0]?.chave || '').split('-')[0]);
  } catch { return ''; }
}

/** Valor da variável (string, ou string[] nas de tipo lista); vazio se falta configurar. */
function ler(chave) {
  const g = guardadas()[chave];
  if (g && (!vazio(g.valor) || g.limpa)) return normalizar(chave, g.valor); // limpa: apagada ao sair da conta, não volta da migração
  const m = migrado(chave);
  return !vazio(m) ? m : normalizar(chave, doUsuario(chave) || '');
}
/** Todas as variáveis: { chave, rotulo, descricao, tipo, escolha?, valor, origem, atualizado, definida, migrada }. */
function todas() {
  const g = guardadas();
  return definicoes.map((d) => {
    const propria = g[d.chave] && !vazio(g[d.chave].valor);
    const valor = ler(d.chave);
    return { ...d, descricao: g[d.chave]?.descricao || d.descricao, valor, origem: propria ? g[d.chave].origem || 'manual' : 'manual',
      atualizado: propria ? g[d.chave].atualizado || '' : '', definida: !vazio(valor), migrada: !propria && !vazio(valor) };
  });
}
/** Grava (settings globais). origem: 'manual' | 'ia'. Valor vazio limpa a variável (volta à migração/pendência). */
async function gravar(chave, valor, origem = 'manual') {
  const d = def(chave);
  if (!d) throw new Error(`Variável desconhecida: ${chave}`);
  const todasG = { ...guardadas() };
  todasG[chave] = { valor: normalizar(chave, valor), descricao: d.descricao, origem: origem === 'ia' ? 'ia' : 'manual', atualizado: new Date().toISOString() };
  await cfg().update('variaveis', todasG, vscode.ConfigurationTarget?.Global ?? 1);
}
/** Sair da conta: apaga todas as variáveis, sem voltar a cair nos settings antigos nem nos tickets da lista. */
async function limpar() {
  const agora = new Date().toISOString();
  const vazias = Object.fromEntries(definicoes.map((d) => [d.chave, { valor: d.tipo === 'lista' ? [] : '', descricao: d.descricao, origem: 'manual', atualizado: agora, limpa: true }]));
  await cfg().update('variaveis', vazias, vscode.ConfigurationTarget?.Global ?? 1);
}
/** Dá acesso ao globalState (migração do labelQA). */
const vincular = (gs) => { globalState = gs; };

module.exports = { ler, todas, gravar, limpar, definicoes, vincular, _teste: { usar: (c) => { testeCfg = c; } } };
