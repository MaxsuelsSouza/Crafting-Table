// @ts-check
const fs = require('fs');
const path = require('path');

// Adaptador LOCAL do ticket por documento: cumpre infra/provedores/contrato.js lendo e gravando só na pasta do ticket (nada sai da máquina).
// Não entra em ADAPTADORES (não é ferramenta escolhível): a fachada (infra/provedores/fachada.js) roteia por ticket, pelo site 'documento:local'.
// Arquivos: .ticket.json (título, status, documento), .documento-texto.md, .comentarios.json, .subtarefas.json, .anexos/, .publicado/<key>/.
const SITE = 'documento:local';
const EU = { id: 'local', nome: 'Você' };
const tk = () => require('../ticket/tickets'); // lazy: evita import circular
const chaveDe = (key) => String(key || '').match(/^(DOC-\d+)/i)?.[1].toUpperCase() || String(key || '');
const dir = (key) => tk().pasta(chaveDe(key));
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const gravarJson = (arq, v) => { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify(v, null, 2)); };
const ehDocumento = (t) => !!t && (t.provedor === 'documento' || String(t.site || '').startsWith('documento:'));

const lerErro = () => { throw new Error('Ticket por documento não tem link'); };
const lerLink = (/** @type {string} */ _link) => lerErro();
const chaveDaBranch = (texto) => String(texto || '').match(/DOC-\d+/i)?.[0].toUpperCase() || null;

// DOC-001, DOC-002…: o maior DOC-N existente + 1 (3 dígitos).
function proximaChave() {
  const n = tk().listar().map((t) => Number(String(t.chave).match(/^DOC-(\d+)$/i)?.[1] || 0));
  return `DOC-${String(Math.max(0, ...n) + 1).padStart(3, '0')}`;
}

const ACEITAS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'md', 'txt', 'docx'];
// Cria o ticket a partir de um arquivo: copia para a raiz da pasta do ticket (o original não é tocado) e registra em .origem.json.
function criarPorDocumento(origem, extras = {}) {
  const { name, ext } = path.parse(String(origem || ''));
  const e = ext.slice(1).toLowerCase();
  if (!ACEITAS.includes(e)) throw new Error(`Documento .${e || '?'} não aceito. Aceitos: ${ACEITAS.map((x) => '.' + x).join(', ')}`);
  if (!fs.existsSync(origem) || !fs.statSync(origem).isFile()) throw new Error(`Arquivo não encontrado: ${origem}`);
  const chave = proximaChave(), d = tk().pasta(chave);
  fs.mkdirSync(d, { recursive: true });
  const base = (name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'documento');
  let arquivo = `${base}.${e}`;
  for (let n = 2; fs.existsSync(path.join(d, arquivo)); n++) arquivo = `${base}-${n}.${e}`;
  fs.copyFileSync(origem, path.join(d, arquivo));
  const em = new Date().toISOString();
  const orig = path.join(d, '.origem.json');
  gravarJson(orig, { ...lerJson(orig, {}), [arquivo]: { origem: 'documento', id: arquivo } });
  return tk().gravar({ idProvedor: chave, chave, provedor: 'documento', site: SITE, link: '', titulo: name.replace(/[-_]+/g, ' ').trim() || chave,
    status: 'Documento', tipo: 'Documento', documento: { arquivo, nome: arquivo, tipo: e, em }, conversas: [], listas: extras.listas,
    refinamento: { estado: 'desligado' }, criado: Date.now() });
}

// Comentários: { id, autor, autorId, data, texto, link }, do mais antigo ao mais recente.
const lerComentarios = (key) => lerJson(path.join(dir(key), '.comentarios.json'), []);
function adicionarComentario(chave, { autor = 'Você', texto, externo = true }) {
  const l = lerComentarios(chave);
  const c = { id: `c${Date.now().toString(36)}${l.length}`, autor, autorId: externo ? 'externo' : EU.id, data: new Date().toISOString(), texto: String(texto || ''), link: '' };
  gravarJson(path.join(dir(chave), '.comentarios.json'), [...l, c]);
  return c;
}
const comentar = async (_s, /** @type {{ key: string }} */ alvo, md) => adicionarComentario(alvo.key, { autor: EU.nome, texto: md, externo: false });
const comentarios = async (_s, { key }) => lerComentarios(key);

// Subtarefas: [{ key, resumo, descricao, status, estimativa?, criado, atualizado }].
const arqSub = (key) => path.join(dir(key), '.subtarefas.json');
const lerSubs = (key) => lerJson(arqSub(key), []);
async function criarSubtarefa(_s, { key }, { resumo, descricao, estimativa }) {
  const chave = chaveDe(key), l = lerSubs(chave);
  const n = Math.max(0, ...l.map((s) => Number(String(s.key).match(/-(\d+)$/)?.[1] || 0))) + 1;
  const agora = new Date().toISOString();
  gravarJson(arqSub(chave), [...l, { key: `${chave}-${n}`, resumo: String(resumo || ''), descricao: String(descricao || ''), status: 'A fazer', ...(estimativa ? { estimativa } : {}), criado: agora, atualizado: agora }]);
  return { key: `${chave}-${n}` };
}
async function filhos(_s, { key }) {
  return lerSubs(key).map((s) => ({ key: s.key, resumo: s.resumo, updated: s.atualizado, status: s.status, md: s.descricao || '' }));
}
async function atualizarDescricao(_s, /** @type {{ site: string }} */ _alvo, key, md, { titulo, estimativa } = /** @type {{ titulo?: string, estimativa?: string }} */ ({})) {
  const chave = chaveDe(key);
  if (String(key).toUpperCase() === chave) { // o próprio ticket: descrição e título
    fs.writeFileSync(path.join(dir(chave), '.documento-texto.md'), String(md || ''));
    if (titulo) { const t = tk().ler(chave); t && tk().gravar({ ...t, titulo }); }
    return {};
  }
  const l = lerSubs(chave), s = l.find((x) => x.key === key);
  if (!s) throw new Error(`Subtarefa ${key} não existe`);
  s.descricao = String(md || '');
  if (titulo) s.resumo = titulo;
  if (estimativa) s.estimativa = estimativa;
  s.atualizado = new Date().toISOString();
  gravarJson(arqSub(chave), l);
  return {};
}

// Anexos: o documento original e os de .anexos/ (url = caminho absoluto).
function listarAnexos(chave) {
  const d = dir(chave), t = tk().ler(chave), out = [];
  const add = (arq, nome, criado) => {
    try { const st = fs.statSync(arq); if (st.isFile()) out.push({ id: nome, nome, tamanho: st.size, url: arq, criado: criado || st.mtime.toISOString(), de: null, provedor: 'documento' }); } catch { /* sumiu */ }
  };
  const doc = t?.documento;
  if (doc?.arquivo) add(path.isAbsolute(doc.arquivo) ? doc.arquivo : path.join(d, doc.arquivo), doc.nome || path.basename(doc.arquivo), doc.em);
  try { for (const n of fs.readdirSync(path.join(d, '.anexos')).sort()) add(path.join(d, '.anexos', n), n); } catch { /* sem anexos */ }
  return out;
}
async function anexar(_s, _site, key, arquivos) {
  const destino = path.join(dir(key), '.publicado', String(key));
  fs.mkdirSync(destino, { recursive: true });
  for (const a of arquivos) fs.copyFileSync(a.arquivo, path.join(destino, a.nome));
}
const baixarAnexo = async (_s, anexo) => fs.readFileSync(anexo.url);

// Síncrono (tudo é arquivo local): o orquestrador grava o contexto da IA sem await.
function buscarSync({ key }) {
  const chave = chaveDe(key), t = tk().ler(chave) || {}, d = dir(chave);
  let md = '';
  try { md = fs.readFileSync(path.join(d, '.documento-texto.md'), 'utf8'); } catch { /* sem texto */ }
  const { markdown } = require('../../componentes/markdown');
  return {
    key: chave, site: SITE,
    resumo: t.titulo || t.documento?.nome || chave,
    status: t.status || 'Documento', tipo: 'Documento', prioridade: '', responsavel: '', horas: {},
    descricao: md.trim() ? markdown(md) : '<em>Sem descrição</em>',
    subtarefas: lerSubs(chave).map((s) => ({ key: s.key, resumo: s.resumo, status: s.status, tipo: 'Subtarefa', responsavel: '' })),
    anexos: listarAnexos(chave),
    comentarios: [...lerComentarios(chave)].reverse().map((c) => ({ autor: c.autor, data: c.data, corpo: markdown(c.texto) }))
  };
}
const buscar = async (_s, /** @type {{ key: string }} */ alvo) => buscarSync(alvo);

const vazio = async () => [];
/** @type {import('./contrato').Provedor & { local: true }} */
const documento = {
  id: 'documento', nome: 'Documento', local: true, camposCredencial: [],
  capacidades: { subtarefas: true, anexos: true, comentarios: true, mencoes: false, labels: false, board: false, estimativa: false },
  lerLink, chaveDaBranch, linkDo: () => '', credenciais: async () => 'documento', conectado: async () => true, sairConta: async () => {},
  buscar, filhos, comentar, comentarios, anexar, baixarAnexo, pessoas: async () => [{ ...EU }], eu: async () => ({ ...EU }),
  meus: vazio, labels: vazio, etapas: vazio, boards: vazio, boardsPorNome: vazio, projetos: vazio, statusDoProjeto: vazio,
  boardPorNome: /** @type {any} */ (async () => null), projetoInfo: async () => ({ chave: '', nome: '' }),
  descobrir: async () => ({ site: SITE, projetos: [], boards: [], status: [], tiposItem: [], labels: [] }),
  criarSubtarefa, atualizarDescricao
};
module.exports = { ...documento, SITE, proximaChave, ehDocumento, criarPorDocumento, ACEITAS, adicionarComentario, buscarSync };
