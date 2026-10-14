// @ts-check
// node teste-contexto.js — contexto único para a IA e extração do documento (sem rede; HOME temporário).
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-'));
process.env.HOME = home;
const Module = /** @type {any} */ (require('module')), carregar = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : carregar(r, ...a));
const net = []; for (const m of ['http', 'https']) { const o = require(m).request; require(m).request = (...a) => { net.push(a[0]); return o(...a); }; }
const ctx = require('./contexto'), tickets = require('./tickets');

const tem = (c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
const fontes = path.join(home, 'fontes'); fs.mkdirSync(fontes);
const pdf = (conteudo) => { // PDF mínimo de 1 página; offsets do xref não importam para o poppler (reconstrói)
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let s = '%PDF-1.4\n'; objs.forEach((o, i) => { s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  return s + 'trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n';
};
let n = 0;
const criar = (arquivo, tipo, bytes) => {
  const chave = `DOC-${String(++n).padStart(3, '0')}`;
  const d = tickets.pasta(chave); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, arquivo), bytes);
  return tickets.gravar({ idProvedor: chave, chave, provedor: 'documento', site: 'documento:local', link: '', titulo: arquivo, status: 'Documento', tipo: 'Documento', documento: { arquivo, nome: arquivo, tipo }, conversas: [], criado: 1 });
};
const pular = (m) => console.warn('AVISO: caso pulado,', m);

(async () => {
  // md / txt: copiados
  for (const [e, c] of [['md', '# Título\nregra A'], ['txt', 'linha um\nlinha dois']]) {
    const t = criar(`nota.${e}`, e, c), r = await ctx.prepararDocumento(t);
    assert.ok(r.ok && fs.readFileSync(r.texto, 'utf8') === c, e);
  }
  // docx: parágrafos na ordem, tab, entidades
  if (tem('python3') && tem('unzip')) {
    const arq = path.join(fontes, 'a.docx');
    const xml = '<w:document><w:body><w:p><w:r><w:t>Primeiro &amp; um</w:t></w:r></w:p><w:p><w:r><w:t>Col A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Col B</w:t></w:r></w:p><w:p><w:r><w:t>Terceiro &lt;fim&gt;</w:t></w:r></w:p></w:body></w:document>';
    execFileSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],"w");z.writestr("word/document.xml",sys.argv[2]);z.close()', arq, xml]);
    const t = criar('a.docx', 'docx', fs.readFileSync(arq)), r = await ctx.prepararDocumento(t);
    assert.ok(r.ok, r.motivo);
    assert.strictEqual(fs.readFileSync(r.texto, 'utf8'), 'Primeiro & um\nCol A\tCol B\nTerceiro <fim>\n');
  } else pular('docx (python3/unzip)');
  // pdf com texto, e idempotência
  if (tem('pdftotext')) {
    const t = criar('r.pdf', 'pdf', pdf('BT /F1 14 Tf 20 100 Td (Regra de separacao do pedido) Tj ET'));
    const r = await ctx.prepararDocumento(t);
    assert.ok(r.ok && /Regra de separacao do pedido/.test(fs.readFileSync(r.texto, 'utf8')), JSON.stringify(r));
    const m = fs.statSync(r.texto).mtimeMs;
    const r2 = await ctx.prepararDocumento(t);
    assert.ok(r2.ok && r2.reaproveitado && fs.statSync(r2.texto).mtimeMs === m, 'idempotente');
    // original mudou: reextrai
    fs.writeFileSync(path.join(tickets.pasta(t.chave), 'r.pdf'), pdf('BT /F1 14 Tf 20 100 Td (Outro texto bem diferente aqui) Tj ET'));
    const r3 = await ctx.prepararDocumento(t);
    assert.ok(!r3.reaproveitado && /Outro texto/.test(fs.readFileSync(r3.texto, 'utf8')));
  } else pular('pdf com texto (pdftotext)');
  // pdf sem texto → páginas PNG
  if (tem('pdftotext') && tem('pdftoppm')) {
    const t = criar('s.pdf', 'pdf', pdf('0 0 100 100 re f')), r = await ctx.prepararDocumento(t);
    assert.ok(r.ok && !r.texto && r.paginas?.length === 1 && /p-1\.png$/.test(r.paginas[0]) && fs.existsSync(r.paginas[0]), JSON.stringify(r));
    const c = ctx.contextoDoTicket({ key: t.chave, resumo: 'S', status: 'Documento', tipo: 'Documento' }, t);
    assert.ok(c.includes(r.paginas[0]) && /escaneado|à mão/.test(c));
  } else pular('pdf sem texto (pdftoppm)');
  // imagem: nada a extrair; contexto cita o caminho
  {
    const t = criar('foto.png', 'png', Buffer.from([0x89, 0x50, 0x4e, 0x47])), r = await ctx.prepararDocumento(t);
    assert.ok(r.ok && !r.texto && !r.paginas);
    const c = ctx.contextoDoTicket({ key: t.chave, resumo: 'F', status: 'Documento', tipo: 'Documento' }, t);
    assert.ok(c.includes(path.join(tickets.pasta(t.chave), 'foto.png')) && !c.includes('Texto extraído'));
  }
  // falha de ferramenta: não lança, contexto orienta o Read
  {
    const t = criar('quebrado.pdf', 'pdf', 'isto não é pdf'), antes = process.env.PATH;
    process.env.PATH = '/nao-existe';
    let r; try { r = await ctx.prepararDocumento(t); } finally { process.env.PATH = antes; }
    assert.strictEqual(r.ok, false); assert.ok(r.motivo);
    const c = ctx.contextoDoTicket({ key: t.chave, resumo: 'Q', status: 'Documento', tipo: 'Documento' }, t);
    assert.ok(/não consegui extrair|Não consegui extrair/.test(c) && c.includes('quebrado.pdf'));
    assert.strictEqual((await ctx.prepararDocumento(null)).ok, false);
  }
  // contextoDoTicket: ticket-documento (j no formato do provedor documento) e Jira
  {
    const prov = require('../provedores/documento');
    const t = prov.criarPorDocumento((() => { const f = path.join(fontes, 'spec.md'); fs.writeFileSync(f, '# spec'); return f; })());
    const d = tickets.pasta(t.chave);
    fs.writeFileSync(path.join(d, '.documento-texto.md'), 'Separar por onda.');
    prov.adicionarComentario(t.chave, { texto: 'Comentário externo do PO' });
    await prov.criarSubtarefa(null, /** @type {any} */ ({ key: t.chave }), { resumo: 'Backend da onda', descricao: '' });
    await ctx.prepararDocumento(t);
    const j = await prov.buscar(null, /** @type {any} */ ({ key: t.chave })), c = ctx.contextoDoTicket(j, t);
    for (const s of ['Separar por onda', 'Comentário externo do PO', 'Backend da onda', path.join(d, 'spec.md'), '## Documento', 'Texto extraído']) assert.ok(c.includes(s), s);
    const arq = ctx.gravarContexto(path.join(home, 'saida'), '.ticket-contexto.md', j, t);
    assert.strictEqual(fs.readFileSync(arq, 'utf8'), c);
    const jj = { key: 'WMS-1', resumo: 'X', status: 'Novo', tipo: 'Story', descricao: '<p>Regra &amp; A</p>', subtarefas: [{ key: 'WMS-2', resumo: 'Dev', status: 'Novo' }], comentarios: [{ autor: 'Ana', data: 'hoje', corpo: '<p>ok</p>' }] };
    const cj = ctx.contextoDoTicket(jj, { chave: 'WMS-1', provedor: 'jira' });
    assert.ok(cj.includes('Regra & A') && cj.includes('WMS-2 · Dev') && cj.includes('Ana') && !/Documento/.test(cj));
  }
  assert.deepStrictEqual(net, [], 'sem rede');
  console.log('teste-contexto OK');
})().catch((e) => { console.error(e); process.exit(1); });
