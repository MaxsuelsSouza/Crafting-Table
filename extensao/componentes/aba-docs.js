// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { esc } = require('../ticket')._teste;
const jira = require('../ticket').jira;
const { docsDaSpec, ler, ORIGEM } = require('../refinamento/locais');
const notas = require('../notas').editor;

// Componente "Aba Docs": a primeira aba do menu do ticket, igual em todas as listas (Refinamento, Implementações, QA e Sem ticket).
// Três caixas: Documentos (clique abre, @ menciona no Claude), Encontrados no ticket (anexos do Jira ainda não baixados) e Notas.
// Usado em corpoAba (painel.js).
// Para usar numa tela: CSS no <style> e corpo(d, semTicket) no corpo. O script é o do editor de notas (notas.scriptNotas,
// posto pela pagina() do painel quando a aba é docs). Cliques pelo data-acao que já existe: docAbrir, docMencionar,
// anexoBaixar, anexoTodos (painel.js). Redesenhe quando a pasta do ticket mudar (o painel já vigia, menos as notas).
//   d: { docs (documentos.listar), origens (.origem.json), jira (anexos), baixando (Set de ids), dir }

const sigla = (nome) => esc(path.extname(nome).slice(1, 5).toUpperCase() || 'ARQ');
const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
// Anexos do ticket que ainda não foram baixados (os baixados estão no .origem.json com o id do Jira).
const pendentes = (anexos, origens) => {
  const baixados = new Set(Object.values(origens || {}).map((o) => o.id));
  return (anexos || []).filter((a) => !baixados.has(a.id));
};

const corpo = (d, semTicket) => {
  const docs = d.docs.length ? d.docs.map((x) => `<div class="linha-doc" data-acao="docAbrir" data-id="${esc(x.nome)}" title="${esc(x.origem || x.full)}">
      <span class="sigla">${sigla(x.nome)}</span><span class="nome">${esc(x.nome)}</span>
      ${d.origens[x.nome]?.origem === 'jira' ? '<span class="selo" title="Baixado dos anexos do Jira">↓ Jira</span>' : ''}
      <span class="mini"><button data-acao="docMencionar" data-id="${esc(x.nome)}" title="Mencionar no Claude">@</button></span></div>`).join('')
    : `<div class="vazio-aba">${semTicket && !d.dir ? 'Nenhuma conversa do Claude aberta ainda.' : 'Nenhum documento ainda. O que o Claude criar aparece aqui.'}</div>`;
  // Pendentes ficam apagados, com botão de baixar. Baixado, sobe para Documentos.
  const pend = pendentes(d.jira?.anexos, d.origens);
  const caixaPend = pend.length ? `<div class="caixa-t">Encontrados no ticket<span>${pend.length > 1 ? '<button class="baixar" data-acao="anexoTodos">↓ Baixar todos</button>' : ''}</span></div>
    <div class="folha pendentes">${pend.map((a) => `<div class="linha-doc" title="${esc(a.nome)}">
      <span class="sigla">${sigla(a.nome)}</span><span class="nome">${esc(a.nome)}</span>${a.de ? `<span class="selo" title="Anexo de outro ticket da mesma feature">↑ ${esc(a.de)}</span>` : ''}
      <span class="tam">${kb(a.tamanho || 0)}</span>
      <button class="baixar" data-acao="anexoBaixar" data-id="${esc(a.id)}" ${d.baixando.has(a.id) ? 'disabled' : ''}>${d.baixando.has(a.id) ? 'Baixando…' : '↓ Baixar'}</button></div>`).join('')}</div>` : '';
  return `<div class="caixa-t">Documentos<span>${d.docs.length || ''}</span></div><div class="folha">${docs}</div>${caixaPend}
  <div class="caixa-t">Notas</div>
  <div class="notas-caixa">${notas.corpoNotas(semTicket ? 'Notas desta conversa…' : 'Notas do ticket…')}</div>`;
};

const CSS = `
  .linha-doc { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: var(--r-md); cursor: pointer; }
  .linha-doc:hover { background: var(--surface-2); }
  .sigla { flex: none; width: 30px; height: 30px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;
    color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .linha-doc .nome { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .linha-doc .mini { opacity: 0; }
  .linha-doc:hover .mini { opacity: 1; }
  .selo { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid color-mix(in srgb, var(--accent-soft) 45%, transparent); color: var(--accent-soft); }
  .pendentes { border-style: dashed; }
  .pendentes .linha-doc { opacity: .45; cursor: default; transition: opacity 140ms; }
  .pendentes .linha-doc:hover { opacity: .8; background: none; }
  .pendentes .tam { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .baixar { flex: none; height: 24px; padding: 0 8px; border-radius: var(--r-md); border: 1px solid var(--border) !important; background: var(--surface-2) !important; font-size: 11px; }
  .baixar:hover { border-color: var(--accent) !important; color: var(--accent); }
  .notas-caixa .papel { min-height: 280px; }
  .caixa-t .baixar { height: 20px; font-size: 10.5px; text-transform: none; letter-spacing: 0; }
`;

// ── Documentos e anexos do ticket (ações da aba) ──
const baixando = new Set(); // ids de anexos sendo baixados (o render do painel passa ao corpo da aba)
const docsDe = (dir) => (dir ? require('../documentos')._teste.listar(dir) : []);
// Docs do ticket = pasta da aba + documentos da spec (locais.docsDaSpec); mapa-*.md ficam na aba Análise.
// Fora do módulo Refinamento, os anexos do Jira (raiz, .origem.json) também entram; os rascunhos do refinamento não.
function docsDoTicket(s, t) {
  const docs = docsDe(s.pastaAba(t.id));
  if (require('../sessao').focoLista() !== require('../tickets').REFINAMENTO) { const jira = ler(path.join(s.pasta(t.id), ORIGEM), {}); docs.push(...docsDe(s.pasta(t.id)).filter((d) => jira[d.nome])); }
  const vistos = new Set(docs.map((x) => x.origem || x.full));
  for (const d of docsDaSpec(t)) if (!vistos.has(d.full) && !docs.some((x) => x.nome === d.nome)) docs.push(d);
  return docs.sort((a, b) => b.mtime - a.mtime);
}
const docDe = (s, id) => { const t = s.ticketAberto(); return (t ? docsDoTicket(s, t) : docsDe(s.pastaAba(s.aberto))).find((x) => x.nome === id); };

const acoes = (s) => ({
  docAbrir({ id }) {
    const d = docDe(s, id);
    if (!d || d.quebrado) return;
    const uri = vscode.Uri.file(d.origem || d.full);
    if (/\.md$/i.test(d.nome)) vscode.commands.executeCommand('markdown.showPreview', uri);
    else if (/\.(html?|pdf|docx|xlsx|pptx)$/i.test(d.nome)) vscode.env.openExternal(uri);
    else vscode.commands.executeCommand('vscode.open', uri);
  },
  docMencionar({ id }) {
    const d = docDe(s, id);
    if (d && !d.quebrado) require('../claude').mencionar(`@${d.origem || d.full}`);
  },
  // Anexo do Jira → pasta do ticket (nome repetido ganha sufixo), marcado em .origem.json como vindo do Jira.
  async anexoBaixar({ id }) {
    const chave = s.aberto, a = s.cacheJira[chave]?.anexos?.find((x) => x.id === id);
    if (!a || baixando.has(id)) return;
    baixando.add(id);
    s.render();
    try {
      const auth = await jira.credenciais(s.secrets);
      if (!auth) throw new Error('credenciais do Jira não informadas');
      const r = await fetch(a.url, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error(`Jira respondeu ${r.status}`);
      const dir = s.pasta(chave), { name, ext } = path.parse(a.nome);
      let nome = a.nome;
      for (let n = 2; fs.existsSync(path.join(dir, nome)); n++) nome = `${name}-${n}${ext}`;
      fs.writeFileSync(path.join(dir, nome), Buffer.from(await r.arrayBuffer()));
      const origens = ler(path.join(dir, ORIGEM), {});
      fs.writeFileSync(path.join(dir, ORIGEM), JSON.stringify({ ...origens, [nome]: { origem: 'jira', id } }, null, 1));
    } catch (e) {
      vscode.window.showErrorMessage(`Não consegui baixar ${a.nome}: ${e.message}`);
    } finally {
      baixando.delete(id);
      s.render();
    }
  },
  async anexoTodos() {
    for (const a of pendentes(s.cacheJira[s.aberto]?.anexos, ler(path.join(s.pasta(s.aberto), ORIGEM), {}))) await acoes(s).anexoBaixar({ id: a.id });
  }
});

module.exports = { corpo, pendentes, CSS, baixando, docsDe, docsDoTicket, acoes, _teste: { kb } };
