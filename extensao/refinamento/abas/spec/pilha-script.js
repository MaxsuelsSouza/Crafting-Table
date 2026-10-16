// @ts-check
// Script da webview da pilha de perguntas. Espera `vscode` (acquireVsCodeApi) já definido no <script> da página.
const scriptPilha =
  () => `// Pilha de perguntas: ‹ › troca o card de cima, ▦ alterna para a grade com todas. Lembra a pergunta e o modo.
  const pilha = document.getElementById('pilha');
  if (pilha) {
    const cards = [...pilha.querySelectorAll('.pcard')], pos = document.getElementById('pPos');
    const st = vscode.getState() || {};
    let i = Math.max(0, cards.findIndex((c) => c.dataset.qid === st.pqId));
    if (i === 0 && st.pqId && !cards.some((c) => c.dataset.qid === st.pqId)) i = Math.min(st.pq || 0, cards.length - 1); // respondida: fica na mesma posição
    let grade = !!st.pgrade && cards.length > 1;
    // Largura mínima do card na grade: o número de colunas se ajusta sozinho (auto-fill) à largura da tela.
    let largura = st.pw || 240;
    const tam = document.querySelector('.ptam');
    const mostrar = () => {
      pilha.classList.toggle('grade', grade);
      pilha.style.setProperty('--pw', largura + 'px');
      if (tam) tam.hidden = !grade;
      cards.forEach((c, k) => { c.hidden = !grade && k !== i; });
      if (pos) pos.textContent = grade ? cards.length + ' perguntas' : (i + 1) + ' de ' + cards.length;
      document.querySelector('[data-pilha="grade"]')?.classList.toggle('is-on', grade);
      vscode.setState({ ...(vscode.getState() || {}), pq: i, pqId: cards[i]?.dataset.qid, pgrade: grade, pw: largura });
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pilha]');
      if (!b) return;
      if (b.dataset.pilha === 'maior' || b.dataset.pilha === 'menor') largura = Math.min(560, Math.max(160, largura + (b.dataset.pilha === 'maior' ? 40 : -40)));
      else if (b.dataset.pilha === 'grade') grade = !grade;
      else { grade = false; i = (i + (b.dataset.pilha === 'prox' ? 1 : -1) + cards.length) % cards.length; }
      mostrar();
    });
    mostrar();
  }`;

module.exports = { scriptPilha };
