// @ts-check
// Script da webview do modal de tarefas. Espera `vscode` (acquireVsCodeApi) e `enviar` já definidos no <script> da página.
const script = () => `// Tarefas: clique no card abre o detalhe; Esc/✕/fundo fecha. Campos e ações vão para a extensão.
  // O detalhe aberto e o rascunho do pedido de alteração sobrevivem ao redesenho.
  if (document.querySelector('[data-tmodal]')) {
    const estado = () => vscode.getState() || {};
    const abrirT = (id) => {
      document.querySelectorAll('[data-tmodal]').forEach((m) => { m.hidden = m.dataset.tmodal !== id; });
      const m = id && document.querySelector('[data-tmodal="' + id + '"]');
      vscode.setState({ ...estado(), tmodal: id || null, tstatus: m ? m.dataset.tstatus : null });
    };
    // Grade das abertas: abre por cima do quadro; o detalhe de uma tarefa e a grade nunca ficam abertos juntos.
    const abrirGrade = (sim) => {
      const g = document.querySelector('[data-tgrade]');
      if (g) g.hidden = !sim;
      vscode.setState({ ...estado(), tgrade: !!sim });
    };
    // Detalhe e célula da grade usam os mesmos botões e campos: o dono é o modal ou a célula mais próxima.
    const dono = (el) => el.closest('[data-tmodal], [data-tgcard]');
    const idDe = (m) => m.dataset.tmodal || m.dataset.tgcard;
    const rascunho = (id, texto) => { const r = { ...(estado().talt || {}) }; if (texto === null) delete r[id]; else r[id] = texto; vscode.setState({ ...estado(), talt: r }); };
    const camposDe = (m) => m.querySelectorAll('[data-tcampo]').forEach((i) =>
      enviar({ acao: 'tarefaCampo', id: idDe(m), campo: i.dataset.tcampo, valor: i.type === 'checkbox' ? i.checked : i.value }));
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-tgrade-abrir]')) return abrirGrade(true);
      const c = e.target.closest('[data-tcard]');
      if (c) return abrirT(c.dataset.tcard);
      const g = e.target.closest('[data-tgrade]');
      const m = dono(e.target);
      if (g && !m) { if (e.target === g || e.target.closest('[data-tfechar]')) abrirGrade(false); return; }
      if (!m) return;
      const id = idDe(m), alt = m.querySelector('.tm-alt');
      if (e.target === m || e.target.closest('[data-tfechar]')) return abrirT(null);
      const a = e.target.closest('[data-tacao]');
      if (a) { camposDe(m); return enviar({ acao: a.dataset.tacao, id }); }
      if (e.target.closest('[data-talterar]')) { alt.hidden = false; alt.querySelector('textarea').focus(); return; }
      if (e.target.closest('[data-tcancelar]')) { alt.hidden = true; rascunho(id, null); return; }
      if (e.target.closest('[data-tenviar]')) {
        const texto = alt.querySelector('textarea').value.trim();
        if (!texto) return alt.querySelector('textarea').focus();
        enviar({ acao: 'tarefaAlterar', id, texto });
        rascunho(id, null);
        if (m.dataset.tmodal) abrirT(null);
      }
    });
    document.querySelectorAll('[data-tcampo]').forEach((i) => i.addEventListener('change', () =>
      enviar({ acao: 'tarefaCampo', id: idDe(dono(i)), campo: i.dataset.tcampo, valor: i.type === 'checkbox' ? i.checked : i.value })));
    document.querySelectorAll('.tm-alt textarea').forEach((ta) => ta.addEventListener('input', () => rascunho(idDe(dono(ta)), ta.value)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const g = document.querySelector('[data-tgrade]'); if (g && !g.hidden && !document.querySelector('[data-tmodal]:not([hidden])')) abrirGrade(false); else abrirT(null); } });
    const st = estado();
    // Rascunho do pedido de alteração: vale para o detalhe e para a célula da grade da mesma tarefa.
    for (const [id, texto] of Object.entries(st.talt || {})) {
      document.querySelectorAll('[data-tmodal="' + id + '"] .tm-alt, [data-tgcard="' + id + '"] .tm-alt').forEach((m) => { m.hidden = false; m.querySelector('textarea').value = texto; });
    }
    if (st.tgrade) abrirGrade(true);
    // Detalhe aberto sobrevive ao redesenho, menos quando a tarefa deixou de estar como estava (aprovada/reprovada: o card fecha).
    const aberto = st.tmodal && document.querySelector('[data-tmodal="' + st.tmodal + '"]');
    if (aberto) abrirT(!st.tstatus || aberto.dataset.tstatus === st.tstatus ? st.tmodal : null);
  }`;

module.exports = { script };
