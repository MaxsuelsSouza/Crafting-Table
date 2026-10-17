// @ts-check
// Resposta do usuário à pausa. As pausas da extensão (branch, sync, git, verificação…) se resolvem aqui; as do Claude vão para .respostas.md.
const fs = require('fs');
const path = require('path');
const controle = require('../../../infra/controle');
const dossie = require('../../../infra/dossie');
const tickets = require('../../../infra/ticket/tickets');
const { deps } = require('../dependencias');
const { OPCOES_TIPO } = require('../etapas/05-implementacao/regras/nome-branch');
const { RESPOSTAS, TENTAR, SEGUIR, CORRIGIR, RESUMIR, REPETIR, VERIFICAR, estado, mudar } = require('../estado');
const { seguir } = require('./seguir');
const { proxima } = require('./avancar');

const responder = async (s, t, resposta) => {
  const dir = s.pastaAba(t.id),
    e = estado(dir),
    r = String(resposta || '').trim();
  if (!e.pausa || !r) return;
  const m = e.pausa.motivo;
  const grupos = require('./grupos'); // ciclo: grupos → seguir → responder
  if (!t.grupo && grupos.MOTIVOS_PAI.includes(m)) return grupos.responderPai(s, t, r);
  if (m === 'teste') return require('../etapas/07-teste').responder(s, t, r); // etapa 7: correção, testar de novo, seguir abaixo ou ajustar o plano
  if (m === 'briefing') {
    fs.appendFileSync(path.join(dir, dossie.BRIEFING), `${r}\n\n`);
    mudar(dir, { pausa: null, etapa: 1 });
    return seguir(s, t);
  }
  if (m === 'branchPrincipal') {
    await deps.salvarBranchPrincipal(e.pausa.repo, r);
    mudar(dir, { pausa: null });
    return seguir(s, t);
  }
  if (m === 'tipo') {
    const categoria = OPCOES_TIPO[r];
    if (!categoria) return;
    // a escolha vira a categoria do ticket (a mesma da pergunta do painel) e vale para o ticket pai e para o grupo em memória
    tickets.gravar({ ...tickets.ler(t.chave), categoria, categoriaOrigem: 'usuario' });
    for (const x of [t, t.pai].filter(Boolean)) Object.assign(x, { categoria, categoriaOrigem: 'usuario' });
    mudar(dir, { pausa: null });
    return seguir(s, t);
  }
  if (m === 'criar') {
    // botão = criar o nome sugerido a partir daquela base; texto livre = outro nome, a partir da base sugerida
    const p = e.pausa,
      base = p.bases?.[r];
    const dec = base ? { nome: p.nome, base } : { nome: r.replace(/\s+/g, '-'), base: p.sugerida };
    mudar(dir, { pausa: null, criar: { ...(e.criar || {}), [p.repo]: dec } });
    return seguir(s, t);
  }
  if (m === 'principal') {
    if (r === SEGUIR) mudar(dir, { pausa: null, principalOk: true });
    else if (r === TENTAR) mudar(dir, { pausa: null });
    else return;
    return seguir(s, t);
  }
  if (['sujo', 'git', 'repos'].includes(m)) {
    if (r !== TENTAR) return;
    mudar(dir, { pausa: null });
    return seguir(s, t);
  }
  const repro = require('../etapas/01-dossie/regras/responder'); // pausas da Reprodução (1.2 a 1.6 e o pedido de dados)
  if (repro.MOTIVOS.includes(m)) return repro.responderRepro(s, t, r);
  if (m === 'sync') {
    if (r === SEGUIR) mudar(dir, { pausa: null, syncOk: true });
    else if (r === TENTAR) mudar(dir, { pausa: null });
    else return;
    return seguir(s, t);
  }
  if (m === 'sem-mudanca') {
    if (r === REPETIR) {
      mudar(dir, { pausa: null, etapa: 5, fase: 'parado' });
      return seguir(s, t);
    }
    if (r === VERIFICAR) {
      mudar(dir, { pausa: null });
      return proxima(s, t, 5, controle.nova(dir));
    }
    return;
  }
  if (m === 'verificacao') {
    if (r === CORRIGIR) {
      mudar(dir, { pausa: null, etapa: 5, fase: 'parado', tentativas: 1, correcao: true });
      return seguir(s, t);
    }
    if (r === RESUMIR) {
      mudar(dir, { pausa: null });
      return proxima(s, t, 6, controle.nova(dir));
    }
    return;
  }
  fs.appendFileSync(path.join(dir, RESPOSTAS), `## Etapa ${e.etapa} · ${e.pausa.pergunta}\n${r}\n\n`);
  mudar(dir, { pausa: null });
  return seguir(s, t);
};

module.exports = { responder };
