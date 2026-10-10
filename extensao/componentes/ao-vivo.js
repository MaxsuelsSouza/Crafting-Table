// @ts-check
const fs = require('fs');
const path = require('path');

// Componente "Ao vivo": a caixa que mostra, em pilha (mais recente em cima), o que o Claude em segundo plano e os passos
// da própria extensão estão fazendo. Usado na aba Spec (painel.js) e nas Evidências do QA (qa.js).
// O log fica em <pasta>/.ao-vivo.jsonl ({ em, tipo, texto, detalhe? }); a caixa expandida é marcada por .ao-vivo.expandido.
// Para usar numa tela: CSS no <style>, caixa(dir, rodando, alvo) no corpo, script(chave) no <script> e redesenhar
// quando um dos ARQUIVOS mudar na pasta. O botão Ver tudo/Recolher manda data-painel="vivoExpandir" (painel.js).
const ARQ = '.ao-vivo.jsonl', EXPANDIDO = '.ao-vivo.expandido';
const ARQUIVOS = [ARQ, EXPANDIDO];
const RECENTES = 40; // linhas na caixa recolhida

// Linha nova. Fila por pasta: uma linha a cada meio segundo, para dar tempo de ler (o Claude e o ▶ escrevem em rajada).
// Fila acima de 20 linhas acelera para não ficar minutos atrasada.
const INTERVALO = 500, INTERVALO_FILA_LONGA = 100;
const filas = new Map(); // pasta -> { linhas, ultimo, timer }
function anotar(dir, l) {
  const f = filas.get(dir) || { linhas: [], ultimo: 0, timer: null };
  filas.set(dir, f);
  f.linhas.push(l);
  escoar(dir, f);
}
function escoar(dir, f) {
  if (f.timer || !f.linhas.length) return;
  const passo = f.linhas.length > 20 ? INTERVALO_FILA_LONGA : INTERVALO;
  f.timer = setTimeout(() => {
    f.timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, ARQ), JSON.stringify({ em: new Date().toISOString(), ...f.linhas.shift() }) + '\n');
    } catch {}
    f.ultimo = Date.now();
    escoar(dir, f);
  }, Math.max(0, f.ultimo + passo - Date.now()));
}

// n = Infinity: o log inteiro (caixa expandida). Linha corrompida não derruba a caixa.
const ler = (dir) => { try { return fs.readFileSync(path.join(dir, ARQ), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
const linhas = (dir, n = RECENTES) => ler(dir).slice(-n).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const expandido = (dir) => fs.existsSync(path.join(dir, EXPANDIDO));
const alternarExpandido = (dir) => (expandido(dir) ? fs.rmSync(path.join(dir, EXPANDIDO), { force: true }) : fs.writeFileSync(path.join(dir, EXPANDIDO), ''));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Tipos antigos (antes da padronização) caem no equivalente novo.
const TIPO = { texto: 'fala', ferramenta: 'acao', bloqueio: 'aviso', inicio: 'etapa' };
const ICONE = { fala: '✦', acao: '›', aviso: '⛔', erro: '⚠', fim: '✓', etapa: '▶' };
const hora = (em) => new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// Mais recente em cima: blocos por etapa (a etapa mais nova primeiro), o título da etapa no topo do bloco e as linhas dele da mais nova para a mais antiga.
const recentesPrimeiro = (l) => l.reduce((g, x) => ((TIPO[x.tipo] || x.tipo) === 'etapa' || !g.length ? g.push([x]) : g.at(-1).push(x), g), [])
  .reverse().flatMap(([cab, ...resto]) => ((TIPO[cab.tipo] || cab.tipo) === 'etapa' ? [cab, ...resto.reverse()] : [...resto.reverse(), cab]));

// Caixa pronta para a tela: últimas 40 linhas (ou tudo, se expandida) e o botão Ver tudo/Recolher (alvo: 'qa' | 'spec').
const caixa = (dir, rodando, alvo) => {
  const exp = expandido(dir), total = ler(dir).length, l = linhas(dir, exp ? Infinity : RECENTES);
  if (!l.length) return '';
  const botao = alvo && (exp || total > l.length) ? `<button class="vivo-exp" data-painel="vivoExpandir" data-id="${esc(alvo)}"
    title="${exp ? `Voltar às últimas ${RECENTES} linhas` : 'Mostrar o log inteiro, do primeiro ao mais recente'}">${exp ? 'Recolher' : `Ver tudo (${total})`}</button>` : '';
  return `<div class="caixa-t">Ao vivo<span>${rodando ? '<span class="vivo-bola"></span>Claude trabalhando' : 'parado'}${botao}</span></div>
  <div class="folha ao-vivo ${exp ? 'expandido' : ''}" id="aoVivo">${recentesPrimeiro(l).map((x) => {
    const tipo = TIPO[x.tipo] || x.tipo;
    return tipo === 'etapa' ? `<div class="vivo v-etapa"><span class="vt">${esc(x.texto)}</span><span class="vq">${esc(hora(x.em))}</span></div>`
      : `<div class="vivo v-${esc(tipo)}" ${x.detalhe ? `title="${esc(x.detalhe)}"` : ''}><span class="vi">${ICONE[tipo] || '·'}</span>
        <span class="vt">${esc(String(x.texto ?? '').slice(0, 220))}</span><span class="vq">${esc(hora(x.em))}</span></div>`;
  }).join('')}</div>`;
};

// Script da webview: a tela é redesenhada a cada linha nova; a caixa volta para a rolagem em que estava.
// chave: nome no vscode.getState() (cada webview tem o seu). Espera `vscode` (acquireVsCodeApi) já definido.
const script = (chave = 'vivo') => `{
  const av = document.getElementById('aoVivo');
  if (av) {
    av.scrollTop = (vscode.getState() || {})[${JSON.stringify(chave)}] || 0;
    av.addEventListener('scroll', () => vscode.setState({ ...(vscode.getState() || {}), [${JSON.stringify(chave)}]: av.scrollTop }), { passive: true });
  }
}`;

const CSS = `
  .ao-vivo { max-height: 260px; overflow: auto; font-size: 11.5px; line-height: 1.45; padding: 8px 10px; }
  .ao-vivo.expandido { max-height: 70vh; }
  .vivo-exp { margin-left: 8px; height: 18px; padding: 0 7px; border: 1px solid var(--border); border-radius: var(--r-md); background: none; color: var(--text);
    font: inherit; font-size: 10.5px; cursor: pointer; }
  .vivo-exp:hover { background: var(--surface-2); }
  .vivo { display: flex; gap: 6px; padding: 2px 0; }
  .vivo .vi { flex: none; width: 12px; text-align: center; color: var(--text-dim); }
  .vivo .vt { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
  .vivo .vq { flex: none; color: var(--text-dim); font-size: 10px; }
  .v-etapa { margin: 8px 0 2px; padding: 3px 6px; border-radius: var(--r-md); background: color-mix(in srgb, var(--ia) 14%, transparent);
    color: var(--ia); font-weight: 600; font-size: 11.5px; }
  .v-etapa:first-child { margin-top: 0; }
  .v-acao { padding-left: 8px; } .v-acao .vt { color: var(--text-dim); }
  .v-fala .vt { font-style: italic; }
  .v-aviso .vt { color: var(--warn); } .v-erro .vt { color: var(--danger); }
  .v-fim .vi { color: var(--ok); }
  .vivo-bola { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--ia); animation: pulsa 1.2s infinite; }
  @keyframes pulsa { 50% { opacity: .3; } }
`;

module.exports = { anotar, linhas, caixa, expandido, alternarExpandido, script, CSS, ARQUIVOS, _teste: { recentesPrimeiro } };
