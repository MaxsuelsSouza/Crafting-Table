// @ts-check
// Etapa 7 · Teste na aplicação (extensão + claude -p): sobe a aplicação no ambiente do ticket, roda os CTs e dá um score 0-5 contra o
// mínimo da atividade. Score ≥ mínimo → Resumo (08), sem portão; abaixo → correção (05) ou pausa. Não publica nada no Jira.
// Grupo de subtarefas pula (grava teste.json { pulado }); a etapa roda uma vez no pai, depois da verificação final (grupos/concluir.js).
//
// Estrutura desta pasta:
//   index.js                    testar: 7.1 → 7.5 (true = segue para o Resumo)
//   arquivos.js                 teste.json e a pasta teste/ (plano-cts.md, fluxo.json, evidencias/, capturas/, video/)
//   dependencias.js             ambiente, claude -p, gravação de tela, diff e plano do QA (os testes trocam)
//   claude.js · prompt.js       o claude -p da 7.1 e da 7.3 e os prompts
//   opcoes.js · responder.js    a pausa 'teste' e as respostas
//   subetapas/7.1-plano-cts.js  7.2-subir.js  7.3-executar.js  7.4-pontuar.js  7.5-decidir.js
//   regras/score.js  minimo.js  cobertura.js  plano.js (puros)  ·  ferramentas.js
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const dossie = require('../../../../infra/dossie');
const tipoTicket = require('../../../../infra/ticket/tipo-ticket');
const { estado, mudar, pausar } = require('../../estado');
const { ambiente } = require('../../orquestrador/ambiente');
const { gravarResultado } = require('./arquivos');
const { deps } = require('./dependencias');
const { minimo } = require('./regras/minimo');
const { planoCts } = require('./subetapas/7.1-plano-cts');
const { subirAplicacao } = require('./subetapas/7.2-subir');
const { executar } = require('./subetapas/7.3-executar');
const { pontuar } = require('./subetapas/7.4-pontuar');
const { decidir } = require('./subetapas/7.5-decidir');
const { RETESTAR, ABAIXO } = require('./opcoes');

const SUBETAPAS = ['Plano de CTs', 'Subir a aplicação', 'Executar os CTs', 'Score', 'Decidir'];

/** Mínimo da atividade: categoria e prioridade do dossiê (ou do ticket) e o diff da branch de trabalho. */
function minimoDe(s, t, dir) {
  const d = dossie.lerGravado(dir),
    df = deps.diff(ambiente(s, t).repos, estado(dir).branches);
  return minimo({
    categoria: d?.categoria ?? tipoTicket.categoriaDe(t),
    prioridade: d?.prioridade || s.cacheJira?.[t.id]?.prioridade || t.prioridade || '',
    caminhos: df.caminhos,
    linhas: df.linhas
  });
}

/** @returns {Promise<boolean>} true = segue para o Resumo; false = pausou, voltou para a correção ou foi interrompida */
async function testar(s, t, rodada) {
  const dir = s.pastaAba(t.id);
  if (t.grupo) {
    gravarResultado(dir, {
      pulado: true,
      motivo: 'grupo de subtarefas: o teste na aplicação roda uma vez no ticket pai'
    });
    aoVivo.anotar(dir, { tipo: 'fim', texto: 'Teste na aplicação fica para o fim: roda uma vez no ticket pai' });
    return true;
  }
  const sub = (n) => mudar(dir, { testeSub: n });
  const parou = () => (s.render(), false);
  mudar(dir, { etapa: 7, fase: 'rodando', pausa: null, testeSub: 1 });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Etapa 7: Teste na aplicação' });
  s.render();
  const min = minimoDe(s, t, dir);
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Mínimo desta atividade: ${min.minimo}/5 (base ${min.base}${min.ajustes.map((a) => `, ${a.delta > 0 ? '+' : ''}${a.delta} ${a.motivo}`).join('')})`
  });
  if (!(await planoCts(s, t, dir, rodada, min)) || !controle.valida(dir, rodada)) return parou();
  sub(2);
  const app = await subirAplicacao(s, t, dir);
  if (!controle.valida(dir, rodada)) return parou();
  const base = { min, ambiente: app.nome, tentativa: (estado(dir).tentativasTeste || 0) + 1 };
  if (app.erro) {
    const r = pontuar(dir, { ...base, subiu: false, erroAmbiente: app.erro });
    pausar(dir, 7, {
      motivo: 'teste',
      pergunta: `A aplicação não subiu no ${app.a.rotulo} (${app.erro}): score ${r.score}/5. Corrija o ambiente (Configurações > Comandos) e rode de novo, ou siga abaixo do mínimo.`,
      opcoes: [RETESTAR, ABAIXO]
    });
    return parou();
  }
  sub(3);
  if (!(await executar(s, t, dir, rodada, app))) return parou();
  sub(4);
  const r = pontuar(dir, { ...base, subiu: true });
  aoVivo.anotar(dir, { tipo: 'fala', texto: `Score ${r.score}/5 · mínimo ${r.minimo}`, detalhe: r.motivos.join('\n') });
  sub(5);
  return (await decidir(s, t, dir, r)) || parou();
}

module.exports = {
  n: 7,
  SUBETAPAS,
  testar,
  minimoDe,
  responder: (s, t, r) => require('./responder').responder(s, t, r)
};
