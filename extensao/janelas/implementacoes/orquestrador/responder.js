// @ts-check
// Resposta do usuário à pausa. As pausas da extensão (branch, sync, git, verificação…) se resolvem aqui; as do Claude vão para .respostas.md.
const fs = require('fs');
const path = require('path');
const controle = require('../../../infra/controle');
const dossie = require('../../../infra/dossie');
const reproducao = require('../etapas/01-dossie/reproducao');
const tickets = require('../../../infra/ticket/tickets');
const { deps } = require('../dependencias');
const { OPCOES_TIPO } = require('../etapas/05-implementacao/regras/nome-branch');
const {
  RESPOSTAS,
  SEM_CONFIRMAR,
  TENTAR,
  SEGUIR,
  CORRIGIR,
  RESUMIR,
  REPETIR,
  VERIFICAR,
  estado,
  mudar
} = require('../estado');
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
  if (m === 'base') {
    if (!e.pausa.opcoes.includes(r)) return;
    mudar(dir, { pausa: null, bases: { ...(e.bases || {}), [e.pausa.repo]: r } });
    return seguir(s, t);
  }
  if (['sujo', 'git', 'repos'].includes(m)) {
    if (r !== TENTAR) return;
    mudar(dir, { pausa: null });
    return seguir(s, t);
  }
  if (m === 'repro-nao' || m === 'repro-evidencia') {
    if (r === TENTAR) {
      reproducao.reiniciar(dir);
      mudar(dir, { pausa: null, etapa: 1, fase: 'parado', reproducao: undefined });
      return seguir(s, t);
    }
    if (r === SEM_CONFIRMAR) {
      reproducao.gravarResumo(dir, t.chave, 'seguiu sem confirmar por decisão do usuário');
      mudar(dir, { pausa: null, reproducao: 'aceita', etapa: 2, fase: 'parado' });
      return seguir(s, t);
    }
    return;
  }
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
