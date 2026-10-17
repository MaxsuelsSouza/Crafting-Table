// @ts-check
// Resposta à pergunta do Claude (cartão da pausa) e ao lote SQL proposto para a massa.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');
const entrada = require('../../entrada');
const { depsQa } = require('./dependencias');
const { gerarPlano } = require('./gerar-plano');

// Lote de SQL proposto para a massa: você leu o cartão; o modal confirma a conexão e o ambiente; só então a extensão executa (nunca a IA).
async function respostaMassaSql(s, t, dir, p, r) {
  const d = depsQa(s, t);
  if (qa.estado(dir).processando) return; // já executando (clique duplo)
  // "ok", "sim", "aprovo"… digitados valem como aprovar (o modal com o SQL ainda confirma); antes viravam recusa.
  if (
    p.motivo === 'massa-sql' &&
    /^(ok|okay|sim|s|pode|aprovo|aprovado|aprovar|executa|executar|confirmo|manda)\b/i.test(r)
  )
    r = 'Aprovar e executar';
  if (r === 'Recusar' || r === 'Seguir sem essa massa') {
    qa.recusarProposta(dir);
    qa.registrarDecisao(
      dir,
      r === 'Recusar' ? 'Usuário recusou a alteração de massa no banco' : 'Usuário seguiu sem a massa por SQL',
      { ticket: t.chave }
    );
    s.render();
    return r === 'Recusar' ? undefined : acoes(s).qaIniciar();
  }
  if (!['Aprovar e executar', 'Tentar de novo'].includes(r)) {
    // Responder…: texto livre nunca executa SQL; vai para o Claude, que refaz a proposta se precisar
    qa.responder(dir, r);
    qa.recusarProposta(dir);
    qa.registrarDecisao(dir, 'Usuário respondeu à proposta de massa no banco (SQL não executado)', {
      ticket: t.chave,
      resposta: r
    });
    s.render();
    return acoes(s).qaIniciar();
  }
  const prop = qa.propostaMassa(dir);
  if (!prop) return;
  const b = d.banco || {};
  const ok = await vscode.window.showWarningMessage(
    `Executar ${prop.sql.length} instrução(ões) em "${b.conexao || '?'}" (${b.ambiente || 'ambiente não definido'})? Roda numa transação só: erro desfaz tudo.`,
    { modal: true, detail: `${prop.sql.join(';\n')};` },
    'Executar'
  );
  if (!ok) return;
  qa.registrarDecisao(dir, 'Usuário aprovou a alteração de massa no banco', {
    ticket: t.chave,
    cenarios: prop.cenarios.join(','),
    instrucoes: prop.sql.length
  });
  qa.mudar(dir, { processando: 'Executando o SQL no banco…' });
  s.render();
  let res;
  try {
    res = await qa.aplicarProposta(dir, d);
  } finally {
    qa.mudar(dir, { processando: null });
  }
  s.render();
  if (res.ok) return acoes(s).qaIniciar();
}
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const responder = (s) => ({
  // Resposta à pergunta do Claude (cartão da pausa): botão da opção ou texto livre. Briefing e plano refazem o planejamento; massa e cenário retomam o QA.
  async qaResponder({ op } = {}) {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id),
      p = qa.estado(dir).pausa;
    if (!p) return;
    const r =
      op !== undefined && op !== ''
        ? p.opcoes?.[Number(op)]
        : await vscode.window.showInputBox({
            title: p.motivo === 'briefing' ? 'O que deve ser testado?' : 'Resposta ao Claude',
            prompt: p.pergunta,
            ignoreFocusOut: true
          });
    if (!r?.trim()) return;
    if (['massa-sql', 'massa-sql-erro'].includes(p.motivo)) return respostaMassaSql(s, t, dir, p, r.trim());
    if (p.motivo === 'subtarefa-qa') {
      // Várias subtarefas [QA]: a escolha fica no estado e o Aprovar publica nela (de novo com o modal).
      if (!qa.escolherSubtarefa(dir, r))
        return vscode.window.showWarningMessage('Cite a chave da subtarefa (ex.: WMS-123) ou responda "criar nova".');
      qa.registrarDecisao(dir, 'Usuário escolheu onde publicar o planejamento', {
        ticket: t.chave,
        resposta: r.trim()
      });
      s.render();
      return acoes(s).qaPlanoAprovar();
    }
    qa.registrarDecisao(dir, 'Usuário respondeu à pergunta do QA', {
      ticket: t.chave,
      pergunta: p.pergunta,
      resposta: r.trim()
    });
    if (p.motivo === 'briefing') {
      fs.appendFileSync(path.join(dir, entrada.BRIEFING), `${r.trim()}\n\n`);
      qa.mudar(dir, { pausa: null });
    } else qa.responder(dir, r);
    s.render();
    if (p.etapa === 'Planejamento') {
      const e = qa.estado(dir),
        v = qa.versaoAtual(dir); // pergunta feita durante um pedido de ajuste: refaz o ajuste, não o plano do zero
      if (e.pedido && v) {
        fs.writeFileSync(path.join(dir, qa.PLANO_LOCAL), qa.mdDaVersao(dir, v));
        const ok = await gerarPlano(s, t, dir, {
          prompt: (rasc) => qa.promptMudanca(dir, e.pedido, rasc),
          titulo: `QA · Aplicando mudança no planejamento (${v.subtarefa})`,
          mudanca: true
        });
        if (ok) qa.mudar(dir, { fase: 'alterando' });
        return s.render();
      }
      return acoes(s).qaCriarPlano();
    }
    return acoes(s).qaIniciar();
  }
});

module.exports = { responder };
