// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');

// Um ticket = pasta ~/.claude/tickets/<CHAVE>/ com .ticket.json e tudo das conversas vinculadas
// (documentos na raiz, .notas.html, evidencias/, .decisoes.json — mesmo layout da pasta de uma conversa).
// Vínculo conversa → ticket: .conversas/<sid> contém a chave (ou chave/aba). Sem vínculo, a conversa usa ~/.claude/documentos/<sid>.
// Abas: o mesmo ticket pode estar em Refinamento (raiz da pasta), Implementações (impl/), QA (qa/) e Incidentes (incidentes/).
// Cada aba tem a sua subpasta (conversas, documentos, notas, decisões, evidências), para uma não poluir a análise da outra.
// Sem dependência do vscode: também roda em bin/migrar-tickets.js.
const RAIZ = path.join(os.homedir(), '.claude', 'tickets');
const VINCULOS = path.join(RAIZ, '.conversas');
const ARQUIVADOS = path.join(RAIZ, '_arquivados');

// Só para dados antigos e para a migração (sem provedor): o formato de chave do Jira. O resto usa lerLink/chaveDaBranch do provedor.
const chaveDo = (texto) => String(texto || '').match(/[A-Z][A-Z0-9]+-\d+/i)?.[0].toUpperCase() || null;
const IMPL = require('../implementacoes/implementacoes').ID;
const SUBPASTAS = [IMPL, require('../qa/qa').ID, require('../incidentes/incidentes').ID];
// Nome da pasta do ticket: a chave saneada para nome de arquivo seguro (qualquer provedor). Chave do Jira (WMS-123) não muda.
const nomeSeguro = (chave) => String(chave ?? '').normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._]+/, '').slice(0, 100) || 'ticket';
const pasta = (chave, lista) => path.join(RAIZ, nomeSeguro(chave), SUBPASTAS.includes(lista) ? lista : '');
// Módulo Refinamento (antes "tickets"): dados gravados com o nome antigo continuam valendo.
const REFINAMENTO = 'refinamento';
const modulo = (l) => (l === 'tickets' ? REFINAMENTO : l);
const listasDe = (t) => (t.listas || [t.lista || (t.implementacao ? IMPL : REFINAMENTO)]).map(modulo);
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };

// Ticket = { id (id interno no provedor; no Jira, = chave), chave (o que se mostra), provedor, projeto?, link, site, ... }.
// ler() devolve `idProvedor` (o `id` gravado; a tela usa `id` para a chave) e `provedor` ('jira' nos tickets antigos).
function ler(chave) {
  const t = lerJson(path.join(pasta(chave), '.ticket.json'), null);
  return t && { ...t, idProvedor: t.id ?? t.chave, provedor: t.provedor || 'jira' };
}
function gravar(t) {
  const { idProvedor, ...resto } = t;
  const grava = { ...resto, id: idProvedor ?? t.chave };
  fs.mkdirSync(pasta(t.chave), { recursive: true });
  fs.writeFileSync(path.join(pasta(t.chave), '.ticket.json'), JSON.stringify(grava, null, 2));
  return t;
}
const existe = (chave) => !!chave && fs.existsSync(path.join(pasta(chave), '.ticket.json'));
// Ticket → alvo das operações do provedor ({ key: id no provedor, site }).
const alvo = (t) => ({ key: t.idProvedor ?? t.chave, site: t.site, provedor: t.provedor });

// link → ticket novo; se já existe, devolve o existente. `ident` = { id, chave, site, projeto?, provedor } vem de provedor.lerLink
// (o provedor entende o link); sem ele (migração, sem vscode) vale o formato antigo do Jira.
function criar(link, extras = {}, ident = null) {
  const chave = ident?.chave || chaveDo(link);
  if (!chave) throw new Error('Link sem chave do ticket (ex.: .../browse/WMS-123)');
  const { id = chave, site = new URL(link).origin, projeto, provedor = 'jira' } = ident || {};
  return ler(chave) || gravar({ idProvedor: id, chave, provedor, ...(projeto ? { projeto } : {}), link, site, titulo: '', status: '', conversas: [],
    refinamento: { estado: 'desligado' }, criado: Date.now(), ...extras });
}

function listar() {
  let nomes;
  try { nomes = fs.readdirSync(RAIZ); } catch { return []; }
  return nomes.filter((n) => !n.startsWith('.') && !n.startsWith('_')).map(ler).filter(Boolean).sort((a, b) => b.criado - a.criado);
}

const vinculo = (sid) => { try { return fs.readFileSync(path.join(VINCULOS, sid), 'utf8').trim() || null; } catch { return null; } };
const ticketDa = (sid) => vinculo(sid)?.split('/')[0] || null;
const listaDa = (sid) => (SUBPASTAS.includes(vinculo(sid)?.split('/')[1]) ? vinculo(sid).split('/')[1] : REFINAMENTO);
function vincular(sid, chave, lista) {
  const t = ler(chave);
  if (!t) throw new Error(`Ticket ${chave} não existe`);
  fs.mkdirSync(VINCULOS, { recursive: true });
  const nome = nomeSeguro(chave); // o vínculo guarda o nome da pasta (os hooks resolvem por ele); ler/pasta aceitam esse nome
  fs.writeFileSync(path.join(VINCULOS, sid), SUBPASTAS.includes(lista) ? `${nome}/${lista}` : nome);
  if (!t.conversas.includes(sid)) gravar({ ...t, conversas: [...t.conversas, sid] });
}

// Pasta de uma aba do ticket (<RAIZ>/<CHAVE>[/impl|qa|incidentes]) → { chave, lista }; null se não for pasta de ticket.
function abaDaPasta(dir) {
  const [nome, sub, ...fora] = path.relative(RAIZ, dir).split(path.sep);
  if (!nome || nome.startsWith('.') || nome.startsWith('_') || nome === '..' || fora.length) return null;
  const t = ler(nome);
  if (!t) return null;
  const chave = t.chave;
  return { chave, lista: SUBPASTAS.includes(sub) ? sub : REFINAMENTO };
}
// Sessão do Claude em segundo plano de uma pasta de ticket → conversa da aba (aba Conversas). Sem efeito fora de pasta de ticket.
function vincularPorPasta(sid, dir) {
  const a = abaDaPasta(dir);
  if (!a || !sid) return false;
  vincular(sid, a.chave, a.lista);
  return true;
}

// Excluir = tirar da lista: a pasta vai para _arquivados/ e as conversas voltam a ser avulsas. Nada é apagado.
function arquivar(chave) {
  const t = ler(chave);
  if (!t) return;
  for (const sid of t.conversas) if (ticketDa(sid) === nomeSeguro(chave)) fs.rmSync(path.join(VINCULOS, sid), { force: true });
  fs.mkdirSync(ARQUIVADOS, { recursive: true });
  fs.renameSync(pasta(chave), path.join(ARQUIVADOS, `${nomeSeguro(chave)}-${Date.now()}`));
}

// Excluir os registros do ticket SÓ de um módulo (lista): documentos, notas, decisões, evidências e o estado daquele módulo vão para
// _arquivados/<chave>-<lista>-<ts>/ (mesma regra do arquivar: nada é apagado). O .ticket.json e os outros módulos ficam. As conversas
// vinculadas àquele módulo voltam a ser avulsas.
function arquivarRegistros(chave, lista) {
  const t = ler(chave), base = pasta(chave, lista);
  if (!t || !fs.existsSync(base)) return false;
  const raiz = !SUBPASTAS.includes(lista), nome = nomeSeguro(chave);
  for (const sid of t.conversas) if (ticketDa(sid) === nome && listaDa(sid) === (raiz ? REFINAMENTO : lista)) fs.rmSync(path.join(VINCULOS, sid), { force: true });
  const destino = path.join(ARQUIVADOS, `${nome}-${raiz ? REFINAMENTO : lista}-${Date.now()}`);
  fs.mkdirSync(ARQUIVADOS, { recursive: true });
  if (!raiz) fs.renameSync(base, destino);
  else { // Refinamento é a raiz da pasta: leva os arquivos dela, menos o .ticket.json e as subpastas dos outros módulos.
    fs.mkdirSync(destino);
    for (const f of fs.readdirSync(base).filter((n) => n !== '.ticket.json' && !SUBPASTAS.includes(n))) fs.renameSync(path.join(base, f), path.join(destino, f));
  }
  return true;
}

module.exports = { arquivarRegistros, RAIZ, REFINAMENTO, modulo, chaveDo, nomeSeguro, existe, alvo, pasta, listasDe, ler, gravar, criar, listar, ticketDa, listaDa, vincular, abaDaPasta, vincularPorPasta, arquivar };
