#!/usr/bin/env node
// @ts-check
// Migra para ~/.claude/tickets/<CHAVE>/ o que hoje está preso à conversa:
//   - refinamentos (~/.claude/refinamentos/<id>/meta.json com link do Jira): notas, TODO, handoffs, aprovados, spec
//   - conversas com ticket (~/.claude/documentos/<sid>/.tickets.json): documentos, notas, evidências, decisões
// e vincula cada conversa ao seu ticket. Só COPIA: as pastas antigas ficam intactas.
// Conversas sem ticket continuam onde estão ("Sem ticket").
// Uso: migrar-tickets.js            mostra o que faria
//      migrar-tickets.js --aplicar  faz
//      migrar-tickets.js --teste    roda a checagem num HOME temporário
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.argv.includes('--teste')) { teste(); process.exit(0); }

const tickets = require('../infra/tickets');
const CLAUDE = path.join(os.homedir(), '.claude');
const DOCS = path.join(CLAUDE, 'documentos');
const REFS = path.join(CLAUDE, 'refinamentos');
const aplicar = process.argv.includes('--aplicar');
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const pastas = (dir) => { try { return fs.readdirSync(dir).filter((n) => !n.startsWith('.')); } catch { return []; } };
const ehLink = (s) => /^https?:\/\//.test(s || '');

// ── 1. Levantamento: chave → { link, titulo, status, sids, refs } ──
const plano = new Map();
const vinculo = new Map(); // sid → chave (a primeira fonte vence: refinamento antes de .tickets.json)
const de = (chave, link) => plano.get(chave) || plano.set(chave, { chave, link, titulo: '', status: '', sids: new Set(), refs: [] }).get(chave);

for (const id of pastas(REFS)) {
  const m = lerJson(path.join(REFS, id, 'meta.json'), null);
  const chave = tickets.chaveDo(m?.ticket);
  if (!chave) continue;
  const t = de(chave, m.ticket);
  if (!ehLink(m.titulo) && !t.titulo) t.titulo = m.titulo;
  t.refs.push({ id, ...m });
  if (m.sid && !vinculo.has(m.sid)) { vinculo.set(m.sid, chave); t.sids.add(m.sid); }
}
for (const sid of pastas(DOCS)) {
  const lista = lerJson(path.join(DOCS, sid, '.tickets.json'), []);
  for (const [i, k] of lista.entries()) {
    const chave = tickets.chaveDo(k.key);
    if (!chave) continue;
    const t = de(chave, `${k.site}/browse/${chave}`);
    t.titulo = k.resumo || t.titulo;
    t.status = k.status || t.status;
    if (i === 0 && !vinculo.has(sid)) { vinculo.set(sid, chave); t.sids.add(sid); }
  }
}

// ── 2. Cópia sem sobrescrever: notas e decisões se juntam; arquivo com o mesmo nome ganha sufixo ──
function copiar(origem, destino, sid) {
  for (const nome of fs.readdirSync(origem)) {
    if (nome === '.decisoes.lock' || nome === '.vigia' || nome === '.vigia.log') continue;
    const de_ = path.join(origem, nome);
    let para = path.join(destino, nome);
    const st = fs.lstatSync(de_);
    if (st.isDirectory()) { fs.mkdirSync(para, { recursive: true }); copiar(de_, para, sid); continue; }
    if (!fs.existsSync(para)) { fs.cpSync(de_, para, { verbatimSymlinks: true }); continue; }
    if (nome === '.notas.html') {
      fs.appendFileSync(para, `<hr><p><b>Notas de ${sid}</b></p>${fs.readFileSync(de_, 'utf8')}`);
    } else if (nome === '.decisoes.json' || nome === '.tickets.json') {
      const juntos = [...lerJson(para, []), ...lerJson(de_, [])];
      const unicos = nome === '.tickets.json' ? [...new Map(juntos.map((k) => [k.key, k])).values()] : juntos;
      fs.writeFileSync(para, JSON.stringify(unicos, null, 1));
    } else if (st.isFile() && fs.readFileSync(de_).equals(fs.readFileSync(para))) {
      continue; // igual: nada a fazer
    } else if (!nome.startsWith('.')) {
      const { name, ext } = path.parse(nome);
      for (let n = 2; fs.existsSync(para); n++) para = path.join(destino, `${name}-${n}${ext}`);
      fs.cpSync(de_, para, { verbatimSymlinks: true });
    }
  }
}

const resumo = [];
for (const t of plano.values()) {
  const existe = !!tickets.ler(t.chave);
  const spec = t.refs.find((r) => r.spec);
  resumo.push(`${existe ? '=' : '+'} ${t.chave}  ${t.titulo || '(sem título)'}\n    conversas: ${[...t.sids].join(', ') || '—'}\n    refinamentos: ${t.refs.map((r) => `${r.tipo} ${r.id.slice(0, 8)}`).join(', ') || '—'}${existe ? '\n    já migrado: pulado' : ''}`);
  if (!aplicar || existe) continue;

  tickets.gravar({ chave: t.chave, link: t.link, site: new URL(t.link).origin, titulo: t.titulo, status: t.status,
    conversas: [...t.sids], criado: Math.min(Date.now(), ...t.refs.map((r) => r.criado || Date.now())),
    ...(spec ? { spec: spec.spec } : {}), // no topo, como o meta.json do refinamento: o sdd-state lê daqui
    refinamento: { estado: 'desligado', ...(spec ? { origem: spec.id } : {}) } });
  const destino = tickets.pasta(t.chave);
  for (const sid of t.sids) if (fs.existsSync(path.join(DOCS, sid))) copiar(path.join(DOCS, sid), destino, sid);
  for (const r of t.refs) {
    const dir = path.join(REFS, r.id);
    const notas = path.join(dir, 'notas.html');
    if (fs.existsSync(notas)) {
      const alvo = path.join(destino, '.notas.html');
      fs.appendFileSync(alvo, `${fs.existsSync(alvo) ? '<hr>' : ''}<p><b>Notas do refinamento</b></p>${fs.readFileSync(notas, 'utf8')}`);
    }
    for (const nome of ['todo.json', 'handoff-backend.md', 'handoff-mobile.md', 'aprovados']) {
      // ocultos: não aparecem como documento; aprovados/ é pasta (a aba Docs só lista arquivos) e o sdd-state grava nela
      const de_ = path.join(dir, nome), para = path.join(destino, nome === 'aprovados' ? nome : `.${nome}`);
      if (fs.existsSync(de_) && !fs.existsSync(para)) fs.cpSync(de_, para, { recursive: true });
    }
  }
  fs.mkdirSync(path.join(tickets.RAIZ, '.conversas'), { recursive: true });
  for (const sid of t.sids) if (!tickets.ticketDa(sid)) fs.writeFileSync(path.join(tickets.RAIZ, '.conversas', sid), t.chave);
}

console.log(resumo.join('\n') || 'Nada para migrar.');
console.log(aplicar ? `\nMigrado para ${tickets.RAIZ}. As pastas antigas não foram alteradas.`
  : '\nSimulação: nada foi gravado. Rode com --aplicar para migrar.');

// ── Checagem: HOME falso com 1 refinamento + 2 conversas do mesmo ticket + 1 conversa avulsa ──
function teste() {
  const { execFileSync } = require('child_process');
  const assert = require('assert');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'migrar-'));
  const c = path.join(home, '.claude');
  const w = (arq, dado) => { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, typeof dado === 'string' ? dado : JSON.stringify(dado)); };
  w(`${c}/refinamentos/r1/meta.json`, { id: 'r1', titulo: 'x', tipo: 'spec', ticket: 'https://j.net/browse/WMS-1', sid: 's1', criado: 1, spec: { repo: '/w', dir: 'specs/001' } });
  w(`${c}/refinamentos/r1/notas.html`, 'nota-ref');
  w(`${c}/refinamentos/r1/todo.json`, { items: [] });
  w(`${c}/documentos/s1/a.md`, 'A');
  w(`${c}/documentos/s1/.notas.html`, 'nota-s1');
  w(`${c}/documentos/s1/evidencias/p.png`, 'png');
  w(`${c}/documentos/s2/.tickets.json`, [{ key: 'WMS-1', site: 'https://j.net', resumo: 'Título', status: 'QA' }]);
  w(`${c}/documentos/s2/a.md`, 'outro A');
  w(`${c}/documentos/s2/.decisoes.json`, [{ t: 1 }]);
  w(`${c}/documentos/s3/solto.md`, 'S');
  const rodar = (...a) => execFileSync(process.execPath, [__filename, ...a], { env: { ...process.env, HOME: home } }).toString();

  assert.match(rodar(), /Simulação/);
  assert.ok(!fs.existsSync(`${c}/tickets`), 'simulação não grava');
  rodar('--aplicar');
  const t = `${c}/tickets/WMS-1`;
  const meta = JSON.parse(fs.readFileSync(`${t}/.ticket.json`, 'utf8'));
  assert.deepStrictEqual(meta.conversas.sort(), ['s1', 's2']);
  assert.strictEqual(meta.titulo, 'Título');
  assert.deepStrictEqual(meta.spec, { repo: '/w', dir: 'specs/001' });
  assert.strictEqual(fs.readFileSync(`${t}/a.md`, 'utf8'), 'A');
  assert.strictEqual(fs.readFileSync(`${t}/a-2.md`, 'utf8'), 'outro A', 'mesmo nome ganha sufixo');
  assert.ok(fs.existsSync(`${t}/evidencias/p.png`));
  assert.match(fs.readFileSync(`${t}/.notas.html`, 'utf8'), /nota-s1[\s\S]*nota-ref/);
  assert.ok(fs.existsSync(`${t}/.todo.json`));
  assert.deepStrictEqual(fs.readdirSync(t).filter((n) => !n.startsWith('.')).sort(), ['a-2.md', 'a.md', 'evidencias'], 'só documentos visíveis');
  assert.strictEqual(fs.readFileSync(`${c}/tickets/.conversas/s1`, 'utf8'), 'WMS-1');
  assert.ok(!fs.existsSync(`${c}/tickets/.conversas/s3`), 'avulsa não é vinculada');
  assert.ok(fs.existsSync(`${c}/documentos/s1/a.md`), 'origem intacta');
  assert.match(rodar('--aplicar'), /já migrado/);
  fs.rmSync(home, { recursive: true });
  console.log('ok: migrar-tickets');
}
