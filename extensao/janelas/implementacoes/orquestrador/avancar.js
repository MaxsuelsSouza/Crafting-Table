// @ts-check
// Etapa pronta: portão de aprovação (0 e 4 sempre; 2 só com prontidão abaixo de "alta") ou segue sozinha para a próxima (proxima).
// Aprovar a 0 dispara os grupos de subtarefas; o fim (ULTIMA, o Resumo) de um grupo devolve para a fila do pai.
// A 7 (Teste na aplicação) é da extensão: testar devolve true quando o score atingiu o mínimo (ou o usuário aceitou) e a esteira segue.
const aoVivo = require('../../../componentes/ao-vivo');
const controle = require('../../../infra/controle');
const dossie = require('../../../infra/dossie');
const { etapa, ETAPAS } = require('../etapas');
const { mudar } = require('../estado');
const { verificar } = require('../etapas/06-verificacao');
const { rodarEtapa } = require('./rodar-etapa');

const ULTIMA = ETAPAS.at(-1).n;

const avancar = async (s, t, n, rodada) => {
  const dir = s.pastaAba(t.id),
    d = dossie.lerGravado(dir);
  const portao = n === 0 || n === 4 || (n === 2 && d?.exigeAprovacaoEntendimento);
  if (portao) {
    mudar(dir, { etapa: n, fase: 'aguardando', pausa: null, aprovacao: { etapa: n, lido: false } });
    aoVivo.anotar(dir, {
      tipo: 'fim',
      texto: `Etapa ${n} concluída: ${etapa(n).arq} criado. Aguardando sua aprovação`
    });
    return;
  }
  aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${n} concluída: ${etapa(n).arq}` });
  return proxima(s, t, n, rodada);
};
const proxima = async (s, t, n, rodada) => {
  const dir = s.pastaAba(t.id);
  if (n === 0) return require('../etapas/00-subtarefas').disparar(s, t, rodada); // plano aprovado: os grupos começam
  if (n >= ULTIMA) {
    mudar(dir, { etapa: ULTIMA, fase: 'concluido', pausa: null });
    if (t.grupo) {
      aoVivo.anotar(dir, { tipo: 'fim', texto: `Grupo ${t.grupo.id} concluído` });
      return require('./grupos').grupoConcluido(s.pai, t.pai); // a fila começa o próximo ou conclui o pai
    }
    aoVivo.anotar(dir, { tipo: 'fim', texto: 'Esteira concluída: implementacao.md é a entrada do QA' });
    return;
  }
  mudar(dir, { etapa: n + 1, fase: 'parado', pausa: null });
  if (n + 1 === 6) return verificar(s, t, controle.valida(dir, rodada) ? rodada : controle.nova(dir));
  if (n + 1 === 7) {
    const r = controle.valida(dir, rodada) ? rodada : controle.nova(dir);
    if (await require('../etapas/07-teste').testar(s, t, r)) return proxima(s, t, 7, r); // ciclo: 07-teste → avancar
    return;
  }
  return rodarEtapa(s, t, n + 1, rodada);
};

module.exports = { avancar, proxima, ULTIMA };
