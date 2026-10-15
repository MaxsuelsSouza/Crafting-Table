// @ts-check
// Tipo do ticket (incidente, bug, bug experimental, outro) a partir do tipo da ferramenta de tickets (Jira: issuetype). Sem vscode.
// Reconhece pelo nome; nome vazio ou que não está em nenhuma lista devolve null e a extensão PERGUNTA ao usuário (nunca adivinha).
// A escolha do usuário fica em .ticket.json (categoria + categoriaOrigem 'usuario') e vale mais que o nome do tipo.
const CATEGORIAS = { incidente: 'Incidente', bug: 'Bug', 'bug-experimental': 'Bug experimental', outro: 'Outro tipo' };
const COR = { incidente: 'pausada', bug: 'pausada', 'bug-experimental': 'andando', outro: 'novo' };
const EXIGEM_REPRODUCAO = ['incidente', 'bug', 'bug-experimental'];
// Tipos conhecidos que não são problema em produção (história, tarefa, épico…): categoria "outro".
const FIM = '(?![\\p{L}\\p{N}])', INI = '(?<![\\p{L}\\p{N}])';
const OUTROS = new RegExp(INI + '(stor(y|ies)|hist[óo]ria|task|tarefa|sub-?\s?task|sub-?\s?tarefa|epic|[ée]pico|feature|funcionalidade|improvement|melhoria|spike|requisito|requirement|doc(umento)?|new feature|enabler|subtask)' + FIM, 'iu');

/** @param {any} nome tipo do ticket na ferramenta @returns {'incidente'|'bug'|'bug-experimental'|'outro'|null} */
function classificar(nome) {
  const n = String(nome || '').trim();
  if (!n) return null;
  if (/incident|incidente/i.test(n)) return 'incidente';
  if (new RegExp(INI + '(bug|defeito|defect|falha|erro|problema)' + FIM, 'iu').test(n)) return /experiment/i.test(n) ? 'bug-experimental' : 'bug';
  if (OUTROS.test(n)) return 'outro';
  return null;
}
/** Categoria efetiva do ticket local `t` ({ tipo?, categoria?, categoriaOrigem? }): a do usuário, senão a do nome do tipo, senão null (perguntar). */
function categoriaDe(t) {
  if (t?.categoriaOrigem === 'usuario' && CATEGORIAS[t.categoria]) return t.categoria;
  return classificar(t?.tipo) || (CATEGORIAS[t?.categoria] ? t.categoria : null);
}
const exigeReproducao = (cat) => EXIGEM_REPRODUCAO.includes(cat);
const rotulo = (cat) => CATEGORIAS[cat] || '';

module.exports = { CATEGORIAS, COR, classificar, categoriaDe, exigeReproducao, rotulo };
