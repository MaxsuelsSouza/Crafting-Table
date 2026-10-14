// @ts-check
// Fluxo da reprodução (etapa 5 do Mergulho): os passos necessários para replicar o incidente no emulador, com o estado de cada um.
// Quando o usuário pausa, os passos já feitos ficam salvos (com a ação que o Claude usou); ao retomar, o Claude refaz esses passos
// rápido, sem reanalisar, e segue do primeiro pendente. Estado em <aba>/fluxo.json. Sem vscode: o Claude grava por bin mergulho-fluxo.
// Cada passo tem o formato do cenário do QA ({ id, titulo, texto, status, execucoes }), então o card é o do QA (qa/card-cenario.js).
//   plano(dir, [{ titulo, texto }])  cria P01…  ·  iniciar(dir, id)  ·  concluir(dir, id, status, nota)  ·  evidencia(dir, id, arquivos)
//   acao(dir, id, texto)  ação exata (comando maestro/adb) que repete o passo  ·  descartarEmAndamento(dir)  ·  html(dir, uri)
const fs = require('fs');
const path = require('path');
const cardCenario = require('../qa/card-cenario');

const ARQ = 'fluxo.json', RESULTADOS = ['passou', 'falhou', 'bloqueado'];
const lerJson = (f, pad) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return pad; } };
const ler = (dir) => lerJson(path.join(dir, ARQ), { passos: [] });
const gravar = (dir, f) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, ARQ), JSON.stringify(f, null, 2)); };
const carimbo = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const achar = (f, id) => { const p = f.passos.find((x) => x.id === id); if (!p) throw new Error(`passo ${id} não existe no fluxo`); return p; };

function plano(dir, passos) {
  if (ler(dir).passos.length) throw new Error('o fluxo já existe (retomada): não replaneje, siga os passos pendentes');
  if (!Array.isArray(passos) || !passos.length) throw new Error('plano vazio: informe a lista de passos [{ "titulo", "texto" }]');
  gravar(dir, { criado: new Date().toISOString(), passos: passos.map((p, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, titulo: String(p.titulo || '').slice(0, 140), texto: String(p.texto || ''), acao: '', status: 'pendente', execucoes: [] })) });
}
function iniciar(dir, id) {
  const f = ler(dir), p = achar(f, id);
  const ex = { id: carimbo(), inicio: new Date().toISOString(), status: 'executando', evidencias: path.join('evidencias', id, carimbo()) };
  fs.mkdirSync(path.join(dir, ex.evidencias), { recursive: true });
  p.statusAntes = p.status; p.status = 'executando'; p.execucoes.push(ex);
  gravar(dir, f);
}
// status: passou | falhou | bloqueado | descartado (pausa no meio: a execução fica no histórico e o passo volta ao que era).
function concluir(dir, id, status, nota = '') {
  const f = ler(dir), p = achar(f, id), ex = p.execucoes.at(-1);
  if (p.status !== 'executando' || !ex) throw new Error(`${id} não está em execução (use iniciar antes)`);
  if (![...RESULTADOS, 'descartado'].includes(status)) throw new Error(`status inválido: ${status} (use ${RESULTADOS.join(', ')})`);
  Object.assign(ex, { status, nota, fim: new Date().toISOString() });
  p.status = status === 'descartado' ? (p.statusAntes || 'pendente') : status;
  delete p.statusAntes;
  gravar(dir, f);
}
function evidencia(dir, id, arquivos) {
  const ex = achar(ler(dir), id).execucoes.at(-1);
  if (!ex || ex.status !== 'executando') throw new Error(`${id} não está em execução (use iniciar antes)`);
  return arquivos.map((a) => { const destino = path.join(dir, ex.evidencias, path.basename(a)); fs.copyFileSync(a, destino); return destino; });
}
function acao(dir, id, texto) { const f = ler(dir), p = achar(f, id); p.acao = String(texto); gravar(dir, f); }
// Pausa/queda no meio de um passo: ele não conta; o histórico fica e o passo volta para a fila.
function descartarEmAndamento(dir) {
  const f = ler(dir);
  for (const p of f.passos) if (p.status === 'executando') { Object.assign(p.execucoes.at(-1) || {}, { status: 'descartado', fim: new Date().toISOString() }); p.status = p.statusAntes || 'pendente'; delete p.statusAntes; }
  if (f.passos.length) gravar(dir, f);
}
const refazer = (dir, id) => { const f = ler(dir), p = f.passos.find((x) => x.id === id); if (!p || p.status === 'executando') return false; p.status = 'pendente'; gravar(dir, f); return true; };
const arquivosDe = (dir, ex) => { try { const d = path.join(dir, ex.evidencias); return fs.readdirSync(d).sort().map((n) => path.join(d, n)); } catch { return []; } };

// Resumo para o prompt da retomada: o que já foi feito (e como repetir) e o que falta.
const estadoParaPrompt = (dir) => ler(dir).passos.map((p) => `${p.id} [${p.status}] ${p.titulo}${p.texto ? ` — ${p.texto}` : ''}${p.acao ? `\n    ação: ${p.acao}` : ''}`).join('\n');

const CSS = `${cardCenario.CSS}
  .cens { margin: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
  .cen .cdet code { display: block; white-space: pre-wrap; font-size: 11px; margin: 4px 0; color: var(--text); }`;
// Card do fluxo (abaixo do Ao vivo, na aba Mergulho). Vazio antes de o Claude planejar (etapa 5); uri: arquivo local → URI da webview.
const html = (dir, uri) => {
  const f = ler(dir);
  if (!f.passos.length) return '';
  const feitos = f.passos.filter((p) => p.status === 'passou').length;
  const ctx = { dir, uri: uri || (() => ''), arquivos: (x) => arquivosDe(dir, x), acoes: { abrir: 'fluxoAbrir', pasta: 'fluxoPasta', copiar: 'fluxoCopiar', refazer: 'fluxoRefazer' } };
  return `<style>${CSS}</style><div class="caixa-t">Fluxo da reprodução<span>${feitos}/${f.passos.length} passos</span></div>
  <div class="cens">${f.passos.map((p) => cardCenario.card({ ...p, resumo: [p.texto, p.acao && `Ação: ${p.acao}`].filter(Boolean).join('\n') }, ctx)).join('')}</div>`;
};
const script = () => cardCenario.script('fluxoAbertos');

module.exports = { ARQ, ler, plano, iniciar, concluir, evidencia, acao, descartarEmAndamento, refazer, arquivosDe, estadoParaPrompt, html, script };
