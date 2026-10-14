// @ts-check
const fs = require('fs');

// Componente "Transcrição": uma conversa do Claude só para ler (sem enviar mensagem). Mostra, na ordem, o pedido, os pensamentos, o que o Claude
// disse, cada ferramenta que usou (arquivo lido, comando rodado, busca, gravação…) e o resultado dela. Lê o histórico <sid>.jsonl do Claude.
// Usado na aba Conversas (modulos/conversas.js) para as conversas das etapas em segundo plano (claude -p), que não abrem no chat do Claude.
// Para usar numa tela: CSS no <style>, html(arquivo) no corpo. Sem script: tudo é <details>.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const corta = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n… (+${s.length - n} caracteres)` : s; };
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

// Conversa de etapa em segundo plano: o pedido começa com "[segundo plano]" (todas as execuções do maestro).
function ehSegundoPlano(arquivo) {
  try {
    for (const l of fs.readFileSync(arquivo, 'utf8').split('\n')) {
      if (!l.includes('"type":"user"')) continue;
      const c = JSON.parse(l).message?.content;
      return typeof c === 'string' && c.startsWith('[segundo plano');
    }
  } catch {}
  return false;
}

// O que cada ferramenta fez, em uma frase curta (ícone + texto).
const RESUMOS = {
  Read: (i) => ['📄', `Leu ${i.file_path}${i.offset ? ` (a partir da linha ${i.offset})` : ''}`],
  Write: (i) => ['✏️', `Gravou ${i.file_path}`],
  Edit: (i) => ['✏️', `Editou ${i.file_path}`],
  Bash: (i) => ['⌘', i.description ? `${i.description}` : `Rodou um comando`],
  Grep: (i) => ['🔎', `Buscou “${i.pattern}”${i.path ? ` em ${i.path}` : ''}`],
  Glob: (i) => ['🗂', `Procurou arquivos ${i.pattern}`],
  Skill: (i) => ['✦', `Usou a skill ${i.skill}`],
  Task: (i) => ['🤖', `Delegou: ${i.description || ''}`],
  TodoWrite: () => ['☑', 'Atualizou a lista de tarefas'],
};
const resumoDe = (b) => {
  const i = b.input || {}, f = RESUMOS[b.name];
  if (f) return f(i);
  if (/^mcp__/.test(b.name)) return ['🔌', b.name.replace(/^mcp__/, '').replace(/__/g, ' · ')];
  return ['›', b.name];
};
// Detalhe expandido: o comando completo, o padrão, o caminho…
const detalheDe = (b) => {
  const i = b.input || {};
  if (b.name === 'Bash') return i.command || '';
  if (b.name === 'Write') return corta(i.content, 1500);
  if (b.name === 'Edit') return `${corta(i.old_string, 600)}\n→\n${corta(i.new_string, 600)}`;
  return JSON.stringify(i, null, 2);
};
const textoDoResultado = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text || (x.type === 'image' ? '[imagem]' : '')).join('\n') : JSON.stringify(c));

// Histórico → itens { tipo: 'pedido'|'pensamento'|'fala'|'ferramenta', ... } na ordem, com o resultado ligado à ferramenta e o resumo da execução.
function ler(arquivo) {
  const itens = [], porId = new Map(), meta = { titulo: '', modelo: '', custo: null, duracao: null };
  let linhas = [];
  try { linhas = fs.readFileSync(arquivo, 'utf8').split('\n'); } catch { return { itens, meta }; }
  for (const l of linhas) {
    if (!l) continue;
    let d; try { d = JSON.parse(l); } catch { continue; }
    if (d.type === 'custom-title' || d.type === 'ai-title') meta.titulo = d.customTitle || d.aiTitle || meta.titulo;
    else if (d.type === 'cost-state') { meta.custo = d.totalCostUSD ?? meta.custo; meta.duracao = d.totalDuration ?? meta.duracao; }
    else if (d.type === 'assistant' && !d.isSidechain) {
      meta.modelo = d.message?.model || meta.modelo;
      for (const b of d.message?.content || []) {
        if (b.type === 'text' && b.text?.trim()) itens.push({ tipo: 'fala', texto: b.text.trim(), em: d.timestamp });
        else if (b.type === 'thinking' && b.thinking?.trim()) itens.push({ tipo: 'pensamento', texto: b.thinking.trim(), em: d.timestamp });
        else if (b.type === 'tool_use') { const it = { tipo: 'ferramenta', b, em: d.timestamp, resultado: null }; porId.set(b.id, it); itens.push(it); }
      }
    } else if (d.type === 'user' && !d.isSidechain) {
      const c = d.message?.content;
      if (typeof c === 'string') itens.push({ tipo: 'pedido', texto: c, em: d.timestamp });
      else for (const b of c || []) if (b.type === 'tool_result' && porId.has(b.tool_use_id)) porId.get(b.tool_use_id).resultado = { texto: textoDoResultado(b.content), erro: !!b.is_error };
    }
  }
  return { itens, meta };
}

const item = (x) => {
  if (x.tipo === 'pedido') return `<details class="tr tr-pedido"><summary><span class="tr-ic">👤</span>Pedido enviado ao Claude<span class="tr-h">${esc(hora(x.em))}</span></summary><pre>${esc(corta(x.texto, 6000))}</pre></details>`;
  if (x.tipo === 'pensamento') return `<details class="tr tr-pens"><summary><span class="tr-ic">💭</span>Pensamento<span class="tr-h">${esc(hora(x.em))}</span></summary><pre>${esc(corta(x.texto, 6000))}</pre></details>`;
  if (x.tipo === 'fala') return `<div class="tr tr-fala"><span class="tr-ic">✦</span><div class="tr-txt">${esc(x.texto)}</div><span class="tr-h">${esc(hora(x.em))}</span></div>`;
  const [ic, resumo] = resumoDe(x.b), det = detalheDe(x.b), r = x.resultado;
  return `<details class="tr tr-ferr ${r?.erro ? 'tr-erro' : ''}"><summary><span class="tr-ic">${ic}</span><span class="tr-res">${esc(resumo)}</span>${r?.erro ? '<span class="tr-tag">erro</span>' : ''}<span class="tr-h">${esc(hora(x.em))}</span></summary>
    ${det ? `<div class="tr-rot">${x.b.name === 'Bash' ? 'Comando' : 'Entrada'}</div><pre>${esc(corta(det, 2500))}</pre>` : ''}
    ${r ? `<div class="tr-rot">${r.erro ? 'Erro' : 'Resultado'}</div><pre>${esc(corta(r.texto, 2500))}</pre>` : '<div class="tr-rot">Sem resultado registrado</div>'}</details>`;
};

// Tela inteira da transcrição (cabeçalho + itens). Sem itens: aviso.
function html(arquivo) {
  const { itens, meta } = ler(arquivo);
  const usadas = itens.filter((x) => x.tipo === 'ferramenta').length;
  const resumo = [meta.modelo, `${usadas} ação(ões)`, meta.duracao ? `${Math.round(meta.duracao / 1000)} s` : '', meta.custo != null ? `US$ ${Number(meta.custo).toFixed(2).replace('.', ',')}` : ''].filter(Boolean).join(' · ');
  return `<div class="tr-cab"><b>${esc(meta.titulo || 'Conversa')}</b><span>${esc(resumo)}</span></div>
  ${itens.length ? `<div class="tr-lista">${itens.map(item).join('')}</div>` : '<div class="tr-vazio">Esta conversa ainda não tem histórico para mostrar.</div>'}`;
}

const CSS = `
  .tr-cab { display: flex; flex-direction: column; gap: 2px; margin: 0 12px 8px; font-size: 12px; } .tr-cab span { color: var(--text-dim); font-size: 11px; }
  .tr-lista { display: flex; flex-direction: column; gap: 4px; margin: 0 12px 16px; }
  .tr { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); font-size: 12px; }
  .tr summary, .tr-fala { display: flex; gap: 8px; align-items: baseline; padding: 6px 10px; list-style: none; cursor: pointer; } .tr summary::-webkit-details-marker { display: none; }
  .tr-fala { cursor: default; border-color: color-mix(in srgb, var(--ia) 35%, transparent); }
  .tr-ic { flex: none; width: 16px; text-align: center; } .tr-res, .tr-txt { flex: 1; min-width: 0; word-break: break-word; } .tr-txt { white-space: pre-wrap; line-height: 1.5; }
  .tr-h { flex: none; font-size: 10px; color: var(--text-dim); }
  .tr-pens { opacity: .75; } .tr-pens summary { font-style: italic; } .tr-pedido summary { color: var(--text-dim); }
  .tr-ferr summary .tr-res { color: var(--text-dim); } .tr-erro { border-color: var(--danger); } .tr-tag { flex: none; font-size: 10px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--danger); color: var(--danger); }
  .tr pre { margin: 0 10px 8px; padding: 8px; max-height: 260px; overflow: auto; border-radius: var(--r-md); background: var(--surface-2); font-size: 11px; white-space: pre-wrap; word-break: break-word; }
  .tr-rot { margin: 4px 10px 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); }
  .tr-vazio { margin: 12px; font-size: 12px; color: var(--text-dim); }
`;

module.exports = { html, ler, ehSegundoPlano, CSS, _teste: { resumoDe } };
