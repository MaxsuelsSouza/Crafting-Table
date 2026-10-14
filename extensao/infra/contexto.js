// @ts-check
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { html2txt } = require('./texto');

// Contexto único para a IA: o que o ticket é (descrição + subtarefas + comentários + documento original), igual para Jira e para ticket-documento.
// Não importa infra/ticket (que carrega o vscode): usa só infra/tickets (pasta).
const tickets = () => require('./tickets');
const EXTRAIDO = '.documento-extraido.md', ESTADO = '.documento-extraido.json', PAGINAS = '.documento-paginas', MAX_PAGINAS = 10;
const ehDocumento = (t) => !!t && (t.provedor === 'documento' || String(t.site || '').startsWith('documento:'));

/** @param {string} cmd @param {string[]} args @returns {Promise<string>} */
const rodar = (cmd, args) => new Promise((ok, erro) => execFile(cmd, args, { timeout: 30000, maxBuffer: 64 * 1024 * 1024 }, (e, out) => (e ? erro(e) : ok(String(out)))));

const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ent[e.toLowerCase()] ?? m;
});
// word/document.xml → texto: parágrafo vira linha, <w:tab/> vira tab, <w:br/> quebra, resto das tags some.
const docxParaTexto = (xml) => decodificar(xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();

const assinatura = (arq) => { const s = fs.statSync(arq); return `${s.size}:${Math.round(s.mtimeMs)}`; };
const lerEstado = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, ESTADO), 'utf8')); } catch { return null; } };

/** Extrai o texto do original para .documento-extraido.md (idempotente: reaproveita se tamanho/mtime não mudaram). Nunca lança.
 * @returns {Promise<{ ok: boolean, tipo?: string, texto?: string, paginas?: string[], motivo?: string, reaproveitado?: boolean }>} */
async function prepararDocumento(t) {
  try {
    const doc = t?.documento;
    if (!ehDocumento(t) || !doc?.arquivo) return { ok: false, motivo: 'ticket sem documento' };
    const d = tickets().pasta(t.chave), arq = path.join(d, doc.arquivo), tipo = String(doc.tipo || path.extname(arq).slice(1)).toLowerCase();
    if (!fs.existsSync(arq)) return { ok: false, tipo, motivo: 'original não encontrado' };
    const ass = assinatura(arq), ant = lerEstado(d);
    if (ant && ant.assinatura === ass && ant.arquivo === doc.arquivo && ant.ok) return { ...ant.resultado, reaproveitado: true };
    const saida = path.join(d, EXTRAIDO), pags = path.join(d, PAGINAS);
    fs.rmSync(saida, { force: true }); fs.rmSync(pags, { recursive: true, force: true });
    /** @type {{ ok: boolean, tipo?: string, texto?: string, paginas?: string[], motivo?: string }} */
    let r;
    if (tipo === 'md' || tipo === 'txt') { fs.copyFileSync(arq, saida); r = { ok: true, tipo, texto: saida }; }
    else if (tipo === 'docx') {
      const txt = docxParaTexto(await rodar('unzip', ['-p', arq, 'word/document.xml']));
      if (!txt) r = { ok: false, tipo, motivo: 'docx sem texto' }; else { fs.writeFileSync(saida, txt + '\n'); r = { ok: true, tipo, texto: saida }; }
    } else if (tipo === 'pdf') {
      const txt = (await rodar('pdftotext', ['-layout', arq, '-'])).replace(/\f/g, '\n').trim();
      if (txt.replace(/\s/g, '').length >= 20) { fs.writeFileSync(saida, txt + '\n'); r = { ok: true, tipo, texto: saida }; }
      else { // escaneado ou à mão: páginas em PNG para a IA ler com Read
        fs.mkdirSync(pags, { recursive: true });
        await rodar('pdftoppm', ['-r', '110', '-png', '-l', String(MAX_PAGINAS), arq, path.join(pags, 'p')]);
        const arqs = fs.readdirSync(pags).filter((f) => /\.png$/i.test(f)).sort((a, b) => (parseInt(a.match(/(\d+)\.png$/)?.[1] || '0', 10)) - (parseInt(b.match(/(\d+)\.png$/)?.[1] || '0', 10)));
        const novos = arqs.map((f, i) => { const n = path.join(pags, `p-${i + 1}.png`); if (n !== path.join(pags, f)) fs.renameSync(path.join(pags, f), n); return n; });
        r = novos.length ? { ok: true, tipo, paginas: novos } : { ok: false, tipo, motivo: 'pdf sem texto e sem páginas renderizadas' };
      }
    } else r = { ok: true, tipo }; // imagem (e outros): nada a extrair, a IA lê direto
    fs.writeFileSync(path.join(d, ESTADO), JSON.stringify({ assinatura: ass, arquivo: doc.arquivo, ok: r.ok, resultado: r }));
    return r;
  } catch (e) {
    const r = { ok: false, motivo: String(e?.code === 'ENOENT' ? `ferramenta ausente (${e.path})` : e?.message || e).split('\n')[0] };
    try { // registra a falha para o contexto orientar o Read (não bloqueia nova tentativa: ok=false)
      const d = tickets().pasta(t.chave), arq = path.join(d, t.documento.arquivo);
      fs.writeFileSync(path.join(d, ESTADO), JSON.stringify({ assinatura: assinatura(arq), arquivo: t.documento.arquivo, ok: false, resultado: { ...r, tipo: t.documento.tipo } }));
    } catch { /* sem pasta */ }
    return r;
  }
}

// Seção "Documento" do contexto: caminho do original, como lê-lo e o que foi extraído.
function secaoDocumento(t) {
  const doc = t.documento || {}, d = tickets().pasta(t.chave), arq = path.join(d, doc.arquivo || '');
  const est = lerEstado(d), r = est && est.arquivo === doc.arquivo ? est.resultado : null;
  const l = [`## Documento\n`, `O ticket é este documento: ${doc.nome || doc.arquivo} (${doc.tipo || '?'}).`, `Original: ${arq}`,
    'Leia com Read: imagem e PDF são lidos direto.'];
  if (r?.ok && r.texto) l.push(`Texto extraído: ${r.texto}`);
  else if (r?.ok && r.paginas?.length) l.push('PDF sem texto (escaneado ou à mão): páginas renderizadas, leia as imagens com Read:', ...r.paginas.map((p) => `- ${p}`));
  else if (r && !r.ok) l.push(`Não consegui extrair o texto (${r.motivo || 'erro'}); leia o original com Read.`);
  else if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(String(doc.tipo).toLowerCase())) l.push('Texto ainda não extraído; leia o original com Read.');
  return l.join('\n');
}

/** Markdown único para a IA. `j`: ticket normalizado (jira.buscar); `t`: ticket local. */
function contextoDoTicket(j, t) {
  let md = `# ${j.key} · ${j.resumo}\nStatus: ${j.status} · Tipo: ${j.tipo}\n\n## Descrição\n\n${html2txt(j.descricao)}\n\n## Subtarefas\n\n`
    + ((j.subtarefas || []).map((x) => `- ${x.key} · ${x.resumo} (${x.status})`).join('\n') || '(sem subtarefas)') + '\n\n## Comentários (mais recente primeiro)\n\n'
    + ((j.comentarios || []).map((c) => `### ${c.autor} · ${c.data}\n${html2txt(c.corpo)}`).join('\n\n') || '(sem comentários)') + '\n';
  if (ehDocumento(t) && t.documento?.arquivo) { try { md += '\n' + secaoDocumento(t) + '\n'; } catch { /* sem pasta */ } }
  return md;
}

/** Grava o contexto em <dir>/<nome>. */
function gravarContexto(dir, nome, j, t) {
  fs.mkdirSync(dir, { recursive: true });
  const arq = path.join(dir, nome);
  fs.writeFileSync(arq, contextoDoTicket(j, t));
  return arq;
}

/** Bloco de texto que aponta a conversa interativa para o documento do ticket-documento (''. para Jira). Grava o contexto de forma síncrona
 *  e dispara a extração sem await; cita só o que já existe. */
function blocoDocumento(t) {
  if (!ehDocumento(t) || !t.documento?.arquivo) return '';
  const d = tickets().pasta(t.chave), CTX = '.contexto-ticket.md';
  const regravar = () => { try { gravarContexto(d, CTX, require('../provedores/documento').buscarSync({ key: t.chave }), tickets().ler(t.chave) || t); } catch { /* pasta sumiu */ } };
  regravar();
  try { prepararDocumento(tickets().ler(t.chave) || t).then(regravar, () => {}); } catch { /* sem extração */ }
  const ex = path.join(d, EXTRAIDO), pg = path.join(d, PAGINAS);
  return `Ticket por documento (sem ferramenta de gestão). Documento original: ${path.join(d, t.documento.arquivo)}. Contexto do ticket: ${path.join(d, CTX)}.`
    + (fs.existsSync(ex) ? ` Texto extraído: ${ex}.` : '') + (fs.existsSync(pg) ? ` Páginas: ${pg}/.` : '')
    + ' Leia o documento (imagem e PDF com Read) antes de começar; tudo que o ticket pediria da ferramenta de gestão está nesses arquivos.';
}

module.exports = { contextoDoTicket, prepararDocumento, gravarContexto, blocoDocumento, EXTRAIDO, PAGINAS, _teste: { docxParaTexto } };
