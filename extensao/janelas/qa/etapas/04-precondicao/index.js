// @ts-check
// Etapa 4 · Pré-condição (Health Check e Autenticação), sem Claude: health check e login HTTP na API com o usuário do ~/.wms-testes.env.
// Só sem credencial configurada o login vai para um claude -p, e o "ok" dele vale até o refresh do banco enquanto o código (sha) não muda.
// Só com tudo ok a suíte começa.
const aoVivo = require('../../../../componentes/ao-vivo');
const ambientes = require('../../../../infra/ambientes');
const { PAPEIS } = require('../../../../infra/ambientes/aplicacao/papeis');
const { estado, mudar } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { claude } = require('../../orquestrador/claude');
const { pausarPorApi } = require('../../orquestrador/zero-skip');
const { healthCheck, loginApi } = require('./dependencias');
const { ultimoRefresh } = require('../05-massa/regras/validade');
const { promptPreCondicao } = require('./prompt');
const { emPreCondicao } = require('./estado');

// true = pode começar a suíte. false = já tratado aqui (falha com o motivo, ou pausa por erro de API do Claude): quem chamou só retorna.
async function preCondicao(dir, d, amb) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const antes = estado(dir).precondicao;
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
    vivo(
      'acao',
      `Health check: ${ambientes
        .obter(amb?.nome)
        .papeis.map((k) => PAPEIS[k].nome)
        .join(', ')} e resposta de rede`
    );
    const h = await (d.healthCheck || healthCheck)(amb);
    if (!h.ok) return falhar(h.motivo || 'health check sem resposta');
    const ok = (motivo, extra = {}) => {
      mudar(dir, { precondicao: { status: 'ok', motivo, em: new Date().toISOString(), ...extra } });
      vivo('fim', `Pré-condição ok: ${motivo}`);
      return true;
    };
    const l = await (d.loginApi || loginApi)();
    if (l) return l.ok ? ok(l.motivo, { via: 'api' }) : falhar(l.motivo);
    const mesmoCodigo = JSON.stringify(antes?.sha || null) === JSON.stringify(amb.sha || null);
    if (
      antes?.status === 'ok' &&
      antes.via === 'claude' &&
      mesmoCodigo &&
      new Date(antes.em) >= ultimoRefresh(new Date(), d.horaRefresh)
    ) {
      mudar(dir, { precondicao: antes }); // mantém a hora do login de verdade: a validade conta dela
      vivo(
        'fim',
        `Pré-condição reaproveitada (login das ${new Date(antes.em).toTimeString().slice(0, 5)}, mesmo código): ${antes.motivo}`
      );
      return true;
    }
    vivo('acao', 'Sem credencial no ~/.wms-testes.env: login pelo Claude e confirmação da sessão autenticada');
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
    if (p?.status === 'ok') return ok(p.motivo, { via: 'claude', sha: amb.sha || null });
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
