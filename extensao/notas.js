// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { FC } = require('./marca');
const { NOTAS } = require('./refinamento/locais');
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Editor de notas (aba Docs do ticket): <pasta do ticket ou da conversa>/.notas.html e .notas.json (aparência).
// HTML em vez de .md: título e listas vêm do editor do próprio navegador (contenteditable).
// Aparência da nota, copiada do Atelier (makeStickyNoteContent / typography.ts): post-it amarelo, Mono 14.
const ESTILO_PADRAO = { fonte: 'mono', tamanho: 14, corTexto: null, corPapel: FC.digitalSoft, alinhamento: 'left' };

// Peças do editor (barras de formatação, busca, papel e o script), também usadas na aba Docs do ticket (componentes/aba-docs.js).
// O script fala com a extensão por { tipo: 'salvar' | 'estilo' | 'mencionar' | 'colar', sid } e recebe { tipo: 'colado', texto }.
const CSS_NOTAS = `<style>
  /* ── Barra de formatação do Atelier (renderer/styles/nodes/format-bar.css) ── */
  .barras { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 12px 10px; }
  .format-bar { display: flex; align-items: center; gap: 2px; padding: 4px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); box-shadow: 0 4px 16px rgb(0 0 0 / 16%); white-space: nowrap; }
  .fb-sep { width: 1px; height: 18px; background: var(--border); margin: 0 3px; flex-shrink: 0; }
  .fb-group { display: flex; gap: 1px; }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; border: 0; padding: 0; background: transparent;
    color: var(--text-dim); border-radius: var(--r-sm); line-height: 1; cursor: pointer; }
  .fb-btn { gap: var(--s-1); min-width: 24px; height: 24px; padding: 0 5px; border-radius: var(--r-md); color: var(--text); font-size: var(--fs-md); }
  .fb-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  .fb-btn.is-on { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .fb-wide { padding: 0 7px; font-size: var(--fs-sm); }
  .fb-caret { font-size: 8px; opacity: .6; }
  .fb-stepper { display: flex; align-items: center; gap: 1px; }
  .fb-size { width: 46px; height: 24px; padding: 0 2px; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface); color: var(--text); font: inherit; font-size: var(--fs-sm); text-align: center; cursor: pointer; }
  .fb-color { flex-direction: column; gap: 1px; padding: 0 6px; }
  .fb-color-glyph { font-size: var(--fs-sm); line-height: 1; font-weight: 600; }
  .fb-color-chip { width: 14px; height: 3px; border-radius: var(--r-pill); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 15%); }
  .fb-align-glyph { display: block; width: 12px; height: 9px;
    background-image: linear-gradient(currentColor, currentColor), linear-gradient(currentColor, currentColor), linear-gradient(currentColor, currentColor);
    background-size: 12px 1.5px, 8px 1.5px, 12px 1.5px; background-repeat: no-repeat; }
  [data-align='left'] .fb-align-glyph { background-position: left 0, left 3.75px, left 7.5px; }
  [data-align='center'] .fb-align-glyph { background-position: center 0, center 3.75px, center 7.5px; }
  [data-align='right'] .fb-align-glyph { background-position: right 0, right 3.75px, right 7.5px; }
  .fb-pop-host { position: relative; display: flex; }
  /* Aqui a barra fica em cima da nota, então o popover abre para BAIXO (no Atelier abre para cima). */
  .fb-popover { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); z-index: 5; min-width: 152px; padding: 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: 0 6px 20px rgb(0 0 0 / 20%); }
  .fb-popover[hidden] { display: none; }
  .fb-popover-title { font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-dim); margin: 2px 2px 5px; }
  .fb-list { display: flex; flex-direction: column; gap: 1px; }
  .fb-row { border: 0; background: transparent; color: var(--text); text-align: left; padding: 4px 6px; border-radius: var(--r-sm); font-size: var(--fs-md); cursor: pointer; }
  .fb-row:hover { background: var(--surface-2); }
  .fb-row.is-on { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .fb-row[data-family='sans'] { font-family: var(--fc-font); }
  .fb-row[data-family='serif'] { font-family: ui-serif, Georgia, 'Iowan Old Style', 'Times New Roman', serif; }
  .fb-row[data-family='mono'] { font-family: var(--fc-mono); }
  .fb-row[data-family='rounded'] { font-family: 'SF Pro Rounded', ui-rounded, Nunito, 'Avenir Next', system-ui, sans-serif; }
  .fb-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .fb-swatch { width: 20px; height: 20px; padding: 0; border: 1px solid var(--border); border-radius: var(--r-sm); cursor: pointer; }
  .fb-swatch:hover { transform: scale(1.12); }
  .fb-swatch.is-on { box-shadow: 0 0 0 2px var(--accent); border-color: transparent; }
  .fb-popover-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--border); }
  .fb-custom { display: flex; align-items: center; gap: 5px; font-size: var(--fs-sm); color: var(--text-dim); cursor: pointer; }
  .fb-custom input[type='color'] { width: 22px; height: 20px; padding: 0; border: 1px solid var(--border); border-radius: var(--r-sm); background: transparent; cursor: pointer; }
  .fb-clear { border: 1px solid var(--border); border-radius: var(--r-sm); background: transparent; color: var(--text-dim); font-size: var(--fs-sm); padding: 2px 7px; cursor: pointer; }
  .fb-clear:hover { color: var(--text); background: var(--surface-2); }
  .barras .espaco { flex: 1; }
  .fb-popover.esq { left: 0; transform: none; }
  #estado { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; padding: 0 6px; font-size: 10.5px; color: var(--text-dim); }
  #estado::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--warn, #e0a030); }
  #estado.ok::before { background: #2ea043; }
  #estado.erro::before { background: #d73a49; }

  /* ── Papel da nota (post-it do Atelier) ── */
  .papel { flex: 1; min-height: 0; margin: 0 12px 12px; border-radius: var(--r-lg); display: flex; flex-direction: column;
    background: var(--papel); color: var(--tinta); box-shadow: 0 4px 16px rgb(0 0 0 / 16%); }
  #ed { flex: 1; overflow: auto; outline: none; padding: 10px 12px; line-height: 1.55; user-select: text;
    font-family: var(--fonte); font-size: var(--tamanho); text-align: var(--alinhamento); }
  #ed:empty::before { content: attr(data-vazio); color: color-mix(in srgb, currentColor 45%, transparent); }
  #ed h2 { font-size: 1.25em; margin: .8em 0 .35em; padding-bottom: .2em; border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent); }
  #ed h2:first-child { margin-top: 0; }
  #ed ol, #ed ul { margin: .3em 0; padding-left: 1.5em; text-align: left; }
  #ed li { margin: .15em 0; }
  #ed li::marker { color: color-mix(in srgb, currentColor 55%, transparent); }
  #busca { display: flex; align-items: center; gap: 4px; margin: 0 12px 8px; padding: 3px 4px 3px 8px; border-radius: var(--r-md);
    background: var(--surface); border: 1px solid var(--accent); }
  #busca[hidden] { display: none; }
  #busca input { flex: 1; min-width: 0; background: none; color: var(--text); border: none; padding: 3px 0; outline: none; }
  #busca .cont { font-size: 11px; color: var(--text-dim); min-width: 42px; text-align: center; }
  #busca button { background: none; border: none; color: var(--text); cursor: pointer; padding: 2px 6px; border-radius: var(--r-sm); }
  #busca button:hover { background: var(--surface-2); }
  ::highlight(busca) { background: color-mix(in srgb, var(--warn) 45%, transparent); }
  ::highlight(atual) { background: color-mix(in srgb, var(--warn) 75%, transparent); }
</style>`;
const corpoNotas = (vazio = 'Escreva suas notas desta conversa…') => `<div class="barras">
  <div class="format-bar" id="fb">
    <div class="fb-pop-host">
      <button type="button" class="icon-btn fb-btn fb-wide" data-pop="fonte" title="Fonte"><span id="fonteNome">Mono</span> <span class="fb-caret">▾</span></button>
      <div class="fb-popover esq" id="pop-fonte" hidden>
        <div class="fb-popover-title">Fonte</div>
        <div class="fb-list">
          <button class="fb-row" data-family="sans">Sans</button><button class="fb-row" data-family="serif">Serif</button>
          <button class="fb-row" data-family="mono">Mono</button><button class="fb-row" data-family="rounded">Rounded</button>
        </div>
      </div>
    </div>
    <span class="fb-sep"></span>
    <div class="fb-stepper">
      <button type="button" class="icon-btn fb-btn" id="menos" title="Diminuir">−</button>
      <select class="fb-size" id="tamanho" title="Tamanho"></select>
      <button type="button" class="icon-btn fb-btn" id="mais" title="Aumentar">+</button>
    </div>
    <span class="fb-sep"></span>
    <div class="fb-pop-host">
      <button type="button" class="icon-btn fb-btn fb-color" data-pop="texto" title="Cor do texto"><span class="fb-color-glyph">A</span><span class="fb-color-chip" id="chipTexto"></span></button>
      <div class="fb-popover" id="pop-texto" hidden>
        <div class="fb-popover-title">Cor do texto</div>
        <div class="fb-swatches" id="swTexto"></div>
        <div class="fb-popover-foot"><label class="fb-custom">Personalizada <input type="color" id="customTexto"></label><button class="fb-clear" id="autoTexto">Automática</button></div>
      </div>
    </div>
    <div class="fb-pop-host">
      <button type="button" class="icon-btn fb-btn fb-color" data-pop="papel" title="Cor do papel"><span class="fb-color-glyph">◧</span><span class="fb-color-chip" id="chipPapel"></span></button>
      <div class="fb-popover" id="pop-papel" hidden>
        <div class="fb-popover-title">Cor do papel</div>
        <div class="fb-swatches" id="swPapel"></div>
        <div class="fb-popover-foot"><label class="fb-custom">Personalizada <input type="color" id="customPapel"></label></div>
      </div>
    </div>
    <span class="fb-sep"></span>
    <div class="fb-group" id="alinhar">
      <button type="button" class="icon-btn fb-btn" data-align="left" title="Alinhar à esquerda"><span class="fb-align-glyph"></span></button>
      <button type="button" class="icon-btn fb-btn" data-align="center" title="Centralizar"><span class="fb-align-glyph"></span></button>
      <button type="button" class="icon-btn fb-btn" data-align="right" title="Alinhar à direita"><span class="fb-align-glyph"></span></button>
    </div>
  </div>
  <div class="format-bar barra">
    <button class="icon-btn fb-btn" data-cmd="titulo" title="Título (Ctrl+Alt+1)"><b>T</b></button>
    <button class="icon-btn fb-btn" data-cmd="insertOrderedList" title="Lista numerada 1. 2. 3. (Ctrl+Shift+7)">1.</button>
    <button class="icon-btn fb-btn" data-cmd="insertUnorderedList" title="Lista com marcador • (Ctrl+Shift+8)">•</button>
    <span class="fb-sep"></span>
    <button class="icon-btn fb-btn" id="mencionar" title="Mencionar a nota no Claude (com o trecho selecionado, se houver)">@</button>
    <span id="estado" class="ok" title="Nota salva">Salva</span>
    <button class="icon-btn fb-btn" id="lupa" title="Buscar nas notas (Ctrl+F)"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
  </div>
</div>
<div id="busca" hidden>
  <input placeholder="Buscar na nota…" spellcheck="false">
  <span class="cont"></span>
  <button data-ir="-1" title="Anterior (Shift+Enter)">↑</button>
  <button data-ir="1" title="Próximo (Enter)">↓</button>
  <button data-fechar title="Fechar (Esc)">✕</button>
</div>
<div class="papel">
<div id="ed" contenteditable="true" spellcheck="false" data-vazio="${esc(vazio)}"></div>
</div>
`;
const scriptNotas = (conteudo, sid, estilo = ESTILO_PADRAO) => `(() => {
  const vscode = acquireVsCodeApi();
  const ed = document.getElementById('ed');
  const SID = ${JSON.stringify(sid)};
  ed.innerHTML = ${JSON.stringify(conteudo).replace(/</g, '\\u003c')};
  document.execCommand('defaultParagraphSeparator', false, 'div');

  let t, seq = 0, ack = 0;
  const estado = document.getElementById('estado');
  let pendente = false;
  const marca = (cls, txt, dica) => { if (!estado) return; estado.className = cls; estado.textContent = txt; estado.title = dica; };
  // Grava já (sem esperar o atraso): usado ao sair da página, trocar de aba e perder o foco.
  const enviar = () => { clearTimeout(t); pendente = false; vscode.postMessage({ tipo: 'salvar', html: ed.innerHTML, sid: SID, seq: ++seq }); };
  const salvar = () => {
    clearTimeout(t);
    pendente = true;
    marca('', 'Salvando…', 'Ainda não gravada em disco');
    t = setTimeout(enviar, 150);
  };
  const emDia = () => { if (pendente) enviar(); };
  addEventListener('pagehide', emDia);
  addEventListener('blur', emDia);
  document.addEventListener('visibilitychange', () => { if (document.hidden) emDia(); });
  document.addEventListener('click', emDia, true); // clicar em outra aba/botão grava antes de a página trocar

  // Título alterna: se o bloco já é título, volta a texto normal.
  const aplicar = (cmd) => {
    ed.focus();
    if (cmd === 'titulo') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock') === 'h2' ? 'div' : 'h2');
    else document.execCommand(cmd);
    salvar();
    marcar();
  };

  document.getElementById('mencionar').addEventListener('mousedown', (e) => {
    e.preventDefault();
    vscode.postMessage({ tipo: 'mencionar', sid: SID, html: ed.innerHTML, trecho: String(getSelection()).trim() });
  });



  // Busca: destaca todas as ocorrências (CSS Custom Highlight, sem mexer no texto salvo).
  const busca = document.getElementById('busca');
  const q = busca.querySelector('input');
  const cont = busca.querySelector('.cont');
  let achados = [], idx = -1;
  function procurar() {
    achados = [];
    const termo = q.value.toLowerCase();
    if (termo && !busca.hidden) {
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const txt = n.data.toLowerCase();
        for (let i = txt.indexOf(termo); i >= 0; i = txt.indexOf(termo, i + termo.length)) {
          const r = new Range();
          r.setStart(n, i);
          r.setEnd(n, i + termo.length);
          achados.push(r);
        }
      }
    }
    CSS.highlights.set('busca', new Highlight(...achados));
    idx = achados.length ? Math.min(Math.max(idx, 0), achados.length - 1) : -1;
    atual();
  }
  function atual() {
    cont.textContent = q.value ? (achados.length ? (idx + 1) + '/' + achados.length : 'nada') : '';
    CSS.highlights.set('atual', new Highlight(...(idx >= 0 ? [achados[idx]] : [])));
    if (idx >= 0) achados[idx].startContainer.parentElement.scrollIntoView({ block: 'nearest' });
  }
  const ir = (d) => { if (achados.length) { idx = (idx + d + achados.length) % achados.length; atual(); } };
  const abrirBusca = () => { busca.hidden = false; q.focus(); q.select(); procurar(); };
  const fecharBusca = () => { busca.hidden = true; procurar(); ed.focus(); };

  document.getElementById('lupa').addEventListener('mousedown', (e) => { e.preventDefault(); busca.hidden ? abrirBusca() : fecharBusca(); });
  q.addEventListener('input', () => { idx = 0; procurar(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ir(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') fecharBusca();
  });
  busca.addEventListener('mousedown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    b.dataset.ir ? ir(Number(b.dataset.ir)) : fecharBusca();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); abrirBusca(); }
  });
  ed.addEventListener('input', () => !busca.hidden && procurar());

  const botoes = [...document.querySelectorAll('.barra button[data-cmd]')];
  const marcar = () => botoes.forEach((b) => b.classList.toggle('is-on',
    b.dataset.cmd === 'titulo' ? document.queryCommandValue('formatBlock') === 'h2' : document.queryCommandState(b.dataset.cmd)));

  botoes.forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); aplicar(b.dataset.cmd); }));
  ed.addEventListener('input', salvar);
  // Trocar de seção no menu da Conversa troca a página: grava antes o que estava esperando o atraso.
  addEventListener('crafting:sair', emDia);
  document.addEventListener('selectionchange', marcar);
  ed.addEventListener('keydown', (e) => {
    const k = e.ctrlKey && (e.shiftKey ? { '&': 'insertOrderedList', '7': 'insertOrderedList', '*': 'insertUnorderedList', '8': 'insertUnorderedList' }[e.key]
      : e.altKey && e.key === '1' && 'titulo');
    if (k) { e.preventDefault(); aplicar(k); }
  });
  // ── Barra de formatação (Atelier: format-bar.tsx + typography.ts) ──
  const FONTES = { sans: 'var(--fc-font)',
    serif: 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif',
    mono: 'var(--fc-mono)',
    rounded: '"SF Pro Rounded", ui-rounded, "Nunito", "Avenir Next", system-ui, sans-serif' };
  const ROTULO = { sans: 'Sans', serif: 'Serif', mono: 'Mono', rounded: 'Rounded' };
  const DEGRAUS = [11, 12, 14, 16, 18, 24, 32, 40, 56, 72, 96];
  const CORES_TEXTO = [['${FC.text}','Claro'],['${FC.bg}','Escuro'],['${FC.claroMuted}','Cinza'],['${FC.accent}','Verde'],['${FC.green}','Verde claro'],
    ['${FC.digital}','Amarelo']];
  const CORES_PAPEL = [['${FC.digitalSoft}','Amarelo'],['${FC.bgSoft}','Escuro'],['${FC.text}','Claro'],['${FC.claroBgSoft}','Creme'],['${FC.claroRule}','Cinza'],
    ['${FC.accent}','Verde'],['${FC.green}','Verde claro'],['${FC.digital}','Digital']];
  const limitar = (n) => Math.min(200, Math.max(8, Math.round(n)));
  const degrau = (atual, d) => limitar((d === 1 ? DEGRAUS : [...DEGRAUS].reverse()).find((x) => (d === 1 ? x > atual : x < atual)) ?? atual + d);
  function luminancia(hex) {
    const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (f.length !== 6) return 1;
    const c = (i) => { const v = parseInt(f.slice(i * 2, i * 2 + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2);
  }
  const contraste = (fundo) => (luminancia(fundo) > 0.45 ? '${FC.bg}' : '${FC.text}');

  let estiloNota = ${JSON.stringify(estilo).replace(/</g, '\\u003c')};
  const folha = document.querySelector('.papel');
  const tamanhoSel = document.getElementById('tamanho');
  function aplicarEstilo(gravar) {
    const e = estiloNota, tinta = e.corTexto || contraste(e.corPapel);
    folha.style.setProperty('--papel', e.corPapel);
    folha.style.setProperty('--tinta', tinta);
    folha.style.setProperty('--fonte', FONTES[e.fonte] || FONTES.mono);
    folha.style.setProperty('--tamanho', e.tamanho + 'px');
    folha.style.setProperty('--alinhamento', e.alinhamento);
    document.getElementById('fonteNome').textContent = ROTULO[e.fonte] || 'Mono';
    document.querySelectorAll('[data-family]').forEach((b) => b.classList.toggle('is-on', b.dataset.family === e.fonte));
    tamanhoSel.innerHTML = (DEGRAUS.includes(e.tamanho) ? '' : '<option value="custom">' + e.tamanho + '</option>') + DEGRAUS.map((d) => '<option value="' + d + '">' + d + '</option>').join('');
    tamanhoSel.value = DEGRAUS.includes(e.tamanho) ? String(e.tamanho) : 'custom';
    document.getElementById('chipTexto').style.background = tinta;
    document.getElementById('chipPapel').style.background = e.corPapel;
    document.getElementById('customTexto').value = e.corTexto || '${FC.text}';
    document.getElementById('customPapel').value = e.corPapel;
    document.querySelectorAll('#swTexto .fb-swatch').forEach((b) => b.classList.toggle('is-on', (e.corTexto || '').toLowerCase() === b.dataset.cor.toLowerCase()));
    document.querySelectorAll('#swPapel .fb-swatch').forEach((b) => b.classList.toggle('is-on', e.corPapel.toLowerCase() === b.dataset.cor.toLowerCase()));
    document.querySelectorAll('#alinhar [data-align]').forEach((b) => b.classList.toggle('is-on', b.dataset.align === e.alinhamento));
    if (gravar) vscode.postMessage({ tipo: 'estilo', sid: SID, estilo: e });
  }
  const mudar = (p) => { estiloNota = { ...estiloNota, ...p }; aplicarEstilo(true); };
  const amostras = (id, cores, chave) => {
    document.getElementById(id).innerHTML = cores.map(([v, n]) => '<button class="fb-swatch" data-cor="' + v + '" title="' + n + '" style="background:' + v + '"></button>').join('');
    document.getElementById(id).addEventListener('click', (ev) => { const b = ev.target.closest('.fb-swatch'); if (b) { mudar({ [chave]: b.dataset.cor }); fecharPops(); } });
  };
  amostras('swTexto', CORES_TEXTO, 'corTexto');
  amostras('swPapel', CORES_PAPEL, 'corPapel');
  const fecharPops = () => document.querySelectorAll('.fb-popover').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('[data-pop]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const pop = document.getElementById('pop-' + b.dataset.pop), abrir = pop.hidden;
    fecharPops(); pop.hidden = !abrir;
    document.querySelectorAll('[data-pop]').forEach((x) => x.classList.toggle('is-on', x === b && abrir));
  }));
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.fb-pop-host')) { fecharPops(); document.querySelectorAll('[data-pop]').forEach((x) => x.classList.remove('is-on')); }
  });
  document.querySelectorAll('[data-family]').forEach((b) => b.addEventListener('click', () => mudar({ fonte: b.dataset.family })));
  document.getElementById('menos').addEventListener('click', () => mudar({ tamanho: degrau(estiloNota.tamanho, -1) }));
  document.getElementById('mais').addEventListener('click', () => mudar({ tamanho: degrau(estiloNota.tamanho, 1) }));
  tamanhoSel.addEventListener('change', () => mudar({ tamanho: limitar(Number(tamanhoSel.value)) }));
  document.getElementById('customTexto').addEventListener('input', (ev) => mudar({ corTexto: ev.target.value }));
  document.getElementById('customPapel').addEventListener('input', (ev) => mudar({ corPapel: ev.target.value }));
  document.getElementById('autoTexto').addEventListener('click', () => { mudar({ corTexto: null }); fecharPops(); });
  document.querySelectorAll('#alinhar [data-align]').forEach((b) => b.addEventListener('click', () => mudar({ alinhamento: b.dataset.align })));
  aplicarEstilo(false);

  // Colar sempre como texto puro, sem estilo de outro site. Ctrl+V pede o texto à extensão (a área de
  // transferência do VS Code): dentro da view o evento paste nem sempre chega com o conteúdo.
  ed.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  ed.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      vscode.postMessage({ tipo: 'colar', sid: SID });
    }
  });
  addEventListener('message', (e) => {
    if (e.data?.tipo === 'salvo' && e.data.sid === SID) {
      if (e.data.erro) return marca('erro', 'Não salvou', e.data.erro);
      if (!e.data.seq) return;
      ack = Math.max(ack, e.data.seq);
      if (!pendente && ack === seq) marca('ok', 'Salva', 'Nota salva');
      return;
    }
    if (e.data?.tipo !== 'colado' || !e.data.texto) return;
    ed.focus();
    document.execCommand('insertText', false, e.data.texto);
  });
})();`;


// Mensagens do editor (a página manda { tipo, sid, ... }): o sid é o ticket (ou Sem ticket) em que a nota foi aberta,
// então um salvamento atrasado nunca cai em outro ticket. pastaAba(sid) dá a pasta; postar manda a resposta à página.
const receber = (m, { pastaAba, postar, mencionar }) => {
  const dir = m.sid && pastaAba(m.sid);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  if (m.tipo === 'salvar' || m.tipo === 'mencionar') {
    try { fs.writeFileSync(path.join(dir, NOTAS), m.html); postar({ tipo: 'salvo', sid: m.sid, seq: m.seq }); }
    catch (e) { postar({ tipo: 'salvo', sid: m.sid, seq: m.seq, erro: e.message }); }
  }
  if (m.tipo === 'estilo') fs.writeFileSync(path.join(dir, '.notas.json'), JSON.stringify(m.estilo));
  if (m.tipo === 'mencionar') mencionar(`@${path.join(dir, NOTAS)}${m.trecho ? ` (trecho: "${m.trecho.slice(0, 300)}")` : ''}`);
  if (m.tipo === 'colar') vscode.env.clipboard.readText().then((texto) => postar({ tipo: 'colado', texto }));
};

exports.editor = { CSS_NOTAS, corpoNotas, scriptNotas, ESTILO_PADRAO, receber };
