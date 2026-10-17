// @ts-check
// Esteira de Implementação: roda por baixo dos panos (cada etapa com IA é um `claude -p` via maestro.rodar) e só para para perguntar.
//   1 Dossiê (extensão) → 2 Entendimento → 3 Varredura → 4 Plano de mudança (portão) → 5 Implementação → 6 Verificação (extensão) → 7 Teste na aplicação (extensão + claude -p) → 8 Resumo
// Estado em <aba>/.esteira.json. Pausa: o Claude grava .pausa.json ({ motivo, pergunta, opcoes }); a extensão mostra na aba e retoma com a
// resposta (.respostas.md). Portões (aprovação humana): Entendimento só com prontidão abaixo de "alta"; Plano de mudança sempre, porque a
// etapa 5 é a primeira do produto que escreve código. Sem commit nem push: a esteira trabalha na branch <tipo>/<CHAVE> de cada repositório (uma por ticket: feature, bugfix ou hotfix).
// A lógica de cada etapa mora em etapas/ (01-dossie/ … 08-resumo.js); aqui fica só o que é comum a todas. Estado: estado.js.
//
// Um arquivo por regra:
//   ambiente.js      repositórios, banco e modelo; texto do banco no prompt
//   pausa.js         pausa pedida pelo Claude (.pausa.md em texto simples ou .pausa.json)
//   rodar-etapa.js   etapas com IA (2, 3, 4, 5, 8): ferramentas e o claude -p
//   apos-etapa.js    etapa terminou: pausa, erro, sem mudança ou avança
//   avancar.js       portão de aprovação ou a próxima etapa
//   seguir.js        iniciar, continuar e retomar
//   pausar.js        ⏸ manual
//   responder.js     resposta à pausa (as da extensão se resolvem aqui; as do Claude vão para .respostas.md)
const { ambiente, textoBanco } = require('./ambiente');
const { parsePausa, lerPausa, limparPausa } = require('./pausa');
const { LEITURA, FERRAMENTAS, rodarEtapa } = require('./rodar-etapa');
const { aposEtapa } = require('./apos-etapa');
const { avancar, proxima } = require('./avancar');
const { seguir, retomar } = require('./seguir');
const { pausarManual } = require('./pausar');
const { responder } = require('./responder');

module.exports = {
  ambiente,
  textoBanco,
  parsePausa,
  lerPausa,
  limparPausa,
  LEITURA,
  FERRAMENTAS,
  rodarEtapa,
  aposEtapa,
  avancar,
  proxima,
  seguir,
  retomar,
  pausarManual,
  responder
};
