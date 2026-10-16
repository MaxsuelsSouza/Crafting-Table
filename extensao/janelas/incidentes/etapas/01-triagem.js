// @ts-check
// Etapa 1 · Triagem: Módulo, Submódulo, Fluxo do WMS e a etapa do fluxo em que o problema ocorreu. Grava 1-triagem.md.
// Antes de rodar, monta a entrada do incidente (entrada.js); ticket só com o título pausa pedindo a explicação (motivo "briefing").
const aoVivo = require('../../../componentes/ao-vivo');
const { ETAPAS } = require('./index');
const { estado, mudar, CONTEXTO } = require('../estado');
const entrada = require('../entrada');

const tarefa = (d, o) =>
  `ETAPA 1 · TRIAGEM. Leia ${CONTEXTO} (descrição do ticket)${o ? ` e a explicação do dev/PO: "${o}"` : ''}. Identifique Módulo, Submódulo e Fluxo do WMS e explique em qual etapa específica do fluxo o problema ocorreu. Use o código dos repositórios só para confirmar nomes de módulo/fluxo. Grave em ${d}/${ETAPAS[0].arq}, seções: Módulo, Submódulo, Fluxo, Etapa do fluxo em que o problema ocorreu (com a justificativa).`;

// Entrada do incidente (entrada.json/md na pasta da aba): relê o ticket e a explicação do dev/PO (obsPO) a cada começo da etapa 1.
const montarEntrada = (s, t, dir, j) => {
  const { cfg } = require('../../../configuracao/configuracao'),
    c = cfg();
  const d = entrada.montarIncidente(t, {
    j: j && !j.erro ? j : undefined,
    obsPO: estado(dir).obsPO,
    banco: { conexao: c.get('bancoConexao') || '', ambiente: c.get('bancoAmbiente') || '' },
    repos: s.reposDe(t)
  });
  entrada.gravarEntrada(dir, d);
  return d;
};

// Entrada do incidente: modo e prontidão; só o título vira pergunta, nunca invenção. Ajuste não remonta a entrada.
const antes = ({ s, t, dir, j, ajuste }) => {
  if (ajuste) return null;
  const d = montarEntrada(s, t, dir, j);
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Entrada do incidente: ${entrada.ROTULO_MODO_INC[d.modo]}, prontidão ${d.prontidao}.`,
    detalhe: d.lacunas.join('\n')
  });
  if (d.modo !== 'perguntar') return null;
  return {
    motivo: 'briefing',
    pergunta:
      'O ticket não tem descrição nem documento: só o título. Explique o que aconteceu (o que o usuário fez, o que viu, em que tela ou fluxo, quando). O que você escrever vira a fonte "verbal" do incidente.',
    opcoes: [],
    aviso: 'Mergulho pausado: o ticket só tem o título; explique o incidente'
  };
};

// A explicação vira a fonte verbal (obsPO), que o Claude já lê nas etapas 1 e 2.
const responder = ({ dir, e, resposta }) => {
  if (e.pausa.motivo !== 'briefing') return undefined;
  mudar(dir, { pausa: null, obsPO: [e.obsPO, String(resposta).trim()].filter(Boolean).join('\n\n') });
  return 'seguir';
};

module.exports = { n: 1, leTicket: true, tarefa, antes, responder };
