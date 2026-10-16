// @ts-check
const { estado, mudar } = require('../../estado');

// ── Pré-condição (Health Check e Autenticação): roda antes da suíte e fora da lista de cenários. Só com tudo ok a suíte começa.
// A etapa marca `etapa: 'precondicao'` no estado enquanto roda; o qa-state precondicao só vale nela. Estado: { status: verificando | ok | falhou, motivo, em }.
const emPreCondicao = (dir) => estado(dir).etapa === 'precondicao';
function registrarPreCondicao(dir, status, nota) {
  if (!['ok', 'falhou'].includes(status)) throw new Error('status inválido: use ok ou falhou');
  if (!String(nota || '').trim()) throw new Error('a nota é obrigatória (o que foi confirmado ou o motivo da falha)');
  mudar(dir, { precondicao: { status, motivo: String(nota).trim(), em: new Date().toISOString() } });
}

module.exports = { emPreCondicao, registrarPreCondicao };
