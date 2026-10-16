// @ts-check
// Etapa 4 · Pré-condição (Health Check e Autenticação): health check sem Claude, depois o login por um claude -p. Só com tudo ok a suíte começa.
const aoVivo = require('../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { claude } = require('../../orquestrador/claude');
const { pausarPorApi } = require('../../orquestrador/zero-skip');
const { healthCheck } = require('./dependencias');
const { promptPreCondicao } = require('./prompt');
const { emPreCondicao } = require('./estado');

// true = pode começar a suíte. false = já tratado aqui (falha com o motivo, ou pausa por erro de API do Claude): quem chamou só retorna.
async function preCondicao(dir, d, amb) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('etapa', 'QA · Pré-condição (Health Check e Autenticação)');
  mudar(dir, { precondicao: { status: 'verificando', em: new Date().toISOString() }, etapa: 'precondicao' });
  const falhar = (motivo) => {
    mudar(dir, { precondicao: { status: 'falhou', motivo, em: new Date().toISOString() }, etapa: null });
    vivo('erro', `Pré-condição falhou: ${motivo}. A suíte não foi iniciada`);
    d.alertar?.(`Pré-condição do QA falhou: ${motivo}. Nenhum cenário foi iniciado.`);
    d.avisar?.(`pré-condição falhou: ${motivo}`);
    return false;
  };
  try {
    vivo('acao', 'Health check: API, Metro e resposta de rede');
    const h = await (d.healthCheck || healthCheck)(amb);
    if (!h.ok) return falhar(h.motivo || 'health check sem resposta');
    vivo('acao', 'Login com o usuário de teste e confirmação da sessão autenticada');
    const { estourou, erro } = await claude(
      dir,
      {
        prompt: promptPreCondicao(d.chave, amb, dir),
        titulo: 'QA · Pré-condição · login',
        cwd: amb.backend || d.backend
      },
      d
    );
    if (pausado(dir)) {
      mudar(dir, { precondicao: null });
      return false;
    }
    const p = estado(dir).precondicao;
    if (p?.status === 'ok') {
      vivo('fim', `Pré-condição ok: ${p.motivo}`);
      return true;
    }
    if (erro && !p?.motivo) return pausarPorApi(dir, d, erro, null);
    return falhar(
      p?.status === 'falhou'
        ? p.motivo
        : estourou
          ? `O login passou de ${d.timeoutMin} min sem confirmar a sessão`
          : 'O Claude terminou sem confirmar a sessão autenticada'
    );
  } finally {
    if (emPreCondicao(dir)) mudar(dir, { etapa: null });
  }
}

module.exports = { n: 4, preCondicao };
