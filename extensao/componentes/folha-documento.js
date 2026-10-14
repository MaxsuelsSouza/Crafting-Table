// @ts-check
const fs = require('fs');
const path = require('path');
const { esc } = require('../infra/texto');
const { markdown } = require('./markdown');
const { botao } = require('./botao');

// Componente "Folha do documento": a aba Ticket de um ticket-documento (sem ferramenta de gestão), no lugar de jira.folhaTicket.
// Usado por painel/painel.js (corpoAba, aba 'ticket' quando jira.ehDocumento(t)); as ações ficam em painel/documento.js.
// Uso: folhaDocumento(t, dados, uri) com dados = { texto, comentarios, subtarefas } (ou omitido: lê da pasta do ticket) e
// uri(arquivo) = URL do webview para um arquivo da pasta (o painel inclui a pasta em localResourceRoots). CSS no <style> da tela.
// Sem script próprio: o clique é por data-acao e o texto sai do textarea[data-texto] da .folha do botão (moldura.js).
const IMAGENS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const STATUS = ['Documento', 'Em análise', 'Em andamento', 'Concluído'];
const lerJson = (arq, v) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return v; } };
const lerTexto = (arq) => { try { return fs.readFileSync(arq, 'utf8'); } catch { return ''; } };
const data = (iso) => { const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };

// Lê da pasta do ticket o que a folha mostra.
function dadosDe(t) {
  const d = require('../infra/tickets').pasta(t.chave);
  return { dir: d, texto: lerTexto(path.join(d, '.documento-texto.md')), comentarios: lerJson(path.join(d, '.comentarios.json'), []), subtarefas: lerJson(path.join(d, '.subtarefas.json'), []) };
}

function visualizacao(t, dir, uri) {
  const doc = t.documento || {}, tipo = String(doc.tipo || path.extname(doc.arquivo || '').slice(1)).toLowerCase();
  const arq = path.isAbsolute(doc.arquivo || '') ? doc.arquivo : path.join(dir, doc.arquivo || '');
  if (tipo === 'md') return `<div class="md doc-papel">${markdown(lerTexto(arq))}</div>`;
  if (tipo === 'txt') return `<pre class="doc-txt">${esc(lerTexto(arq))}</pre>`;
  if (IMAGENS.includes(tipo)) return `<img class="doc-img" src="${esc(uri ? uri(arq) : '')}" alt="${esc(doc.nome || '')}">`;
  return `<div class="doc-cartao"><b>${esc((tipo || 'arquivo').toUpperCase())}</b><span>${tipo === 'pdf' ? 'Abre no visualizador do VS Code.' : 'Abre no programa padrão do sistema.'}</span>${botao('Abrir documento', { acao: 'docAbrir', variante: 'principal' })}</div>`;
}

function folhaDocumento(t, dados, uri) {
  const d = { ...dadosDe(t), ...(dados || {}) };
  const doc = t.documento || {};
  const subs = d.subtarefas.map((s) => `<div class="doc-sub"><code>${esc(s.key)}</code><span>${esc(s.resumo)}</span><span class="dim">${esc(s.status || '')}</span></div>`).join('');
  const coms = [...d.comentarios].reverse().map((c) => `<div class="doc-com"><div class="dim"><b>${esc(c.autor || '')}</b> · ${esc(data(c.data))}</div><div class="md">${markdown(c.texto || '')}</div></div>`).join('');
  return `<div class="folha doc-folha">
    <div class="doc-topo"><div class="doc-tit"><b>${esc(t.titulo || doc.nome || t.chave)}</b>
      <span class="dim">${esc(doc.nome || '')} · ${esc(String(doc.tipo || '').toUpperCase())}${doc.em ? ' · ' + esc(data(doc.em)) : ''}</span></div>
      <div class="acoes-aba">${botao('Editar título', { acao: 'docEditarTitulo', variante: 'contorno' })}${botao(`Status: ${esc(t.status || 'Documento')}`, { acao: 'docEditarStatus', variante: 'contorno' })}${botao('Mostrar na pasta', { acao: 'docPasta', variante: 'contorno' })}</div></div>
    ${visualizacao(t, d.dir, uri)}
  </div>
  <div class="folha doc-folha"><h3>Descrição / transcrição</h3>
    <p class="dim">Transcreva ou cole aqui o que está no documento; a IA lê esta descrição e o arquivo original.</p>
    <textarea class="doc-area" data-texto placeholder="Descrição ou transcrição do documento…">${esc(d.texto)}</textarea>
    <div class="acoes-aba">${botao('Salvar descrição', { acao: 'docSalvarDescricao', variante: 'principal' })}</div></div>
  <div class="folha doc-folha"><h3>Comentários</h3>
    ${coms || '<div class="vazio-aba">Nenhum comentário.</div>'}
    <textarea class="doc-area doc-novo" data-texto placeholder="Adicionar comentário…"></textarea>
    <div class="acoes-aba">${botao('Adicionar comentário', { acao: 'docComentar', variante: 'principal' })}</div></div>
  <div class="folha doc-folha"><h3>Subtarefas</h3>${subs || '<div class="vazio-aba">Sem subtarefas. Elas nascem do fluxo de cards no Refinamento.</div>'}</div>`;
}

const CSS = `
  .doc-folha { margin-bottom: 8px; } .dim { color: var(--text-dim); font-size: 11px; }
  .doc-topo { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .doc-tit { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .doc-img { max-width: 100%; border-radius: var(--r-sm); } .doc-txt { white-space: pre-wrap; max-height: 360px; overflow: auto; font-size: 12px; margin: 0; }
  .doc-papel { max-height: 420px; overflow: auto; }
  .doc-cartao { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px; border: 1px solid var(--border); border-radius: var(--r-md); }
  .doc-area { width: 100%; min-height: 110px; box-sizing: border-box; resize: vertical; } .doc-novo { min-height: 60px; margin-top: 8px; }
  .doc-com { padding: 6px 0; border-bottom: 1px solid var(--border); } .doc-sub { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; font-size: 12px; }
`;

module.exports = { folhaDocumento, CSS, STATUS };
