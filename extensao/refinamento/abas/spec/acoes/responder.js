// @ts-check
// Pergunta do Claude respondida na aba (opção, outra resposta ou "Tirar dúvida").
const vscode = require('vscode');
const maestro = require('../../../../infra/agentes/maestro');
const { estadoSpec } = require('../../../locais');
const orq = require('../../../orquestrador');
const { pasta } = require('../comum');

const acoes = (s) => ({
  // Pergunta do Claude respondida na aba (id = Qnn, op = índice da opção | 'outra' | 'duvida').
  // Todas respondidas e refinamento rodando → o Claude continua na execução nova com as respostas.
  async responder({ id, op }) {
    const r = s.ticketAberto();
    const q = estadoSpec(r)?.perguntas.find((x) => x.id === id);
    if (!q || q.status !== 'aberta') return;
    let resposta;
    if (op === 'duvida') {
      await orq.sdd([
        'duvida',
        'add',
        '--ref',
        pasta(r.id),
        '--texto',
        q.pergunta,
        '--contexto',
        `${q.id} · passo ${q.passo ?? '?'}${q.contexto ? ` · ${q.contexto}` : ''}${q.opcoes?.length ? ` · opções: ${q.opcoes.join(' / ')}` : ''}`
      ]);
      await orq.sdd(['pergunta', 'descartar', id, '--ref', pasta(r.id)]);
      resposta = 'Tirar dúvida (vai para o time; trate como em aberto)';
    } else {
      resposta =
        op === 'outra'
          ? (
              await vscode.window.showInputBox({ title: q.pergunta, prompt: 'Sua resposta', ignoreFocusOut: true })
            )?.trim()
          : q.opcoes?.[Number(op)];
      if (!resposta) return;
      await orq.sdd(['pergunta', 'responder', id, '--ref', pasta(r.id), '--resposta', resposta]);
    }
    orq.respondidas.push(`${id} → ${resposta}`);
    require('../../../pacote').gravar(r.id);
    const est = estadoSpec(r);
    if (
      !est.perguntas.some((x) => x.status === 'aberta') &&
      orq.estadoDe(r.id) === 'rodando' &&
      !maestro.rodando(pasta(r.id))
    ) {
      orq.aplicarRespostas(r, est.proximoPasso, orq.respondidas.slice());
      orq.respondidas.length = 0;
    }
    s.render();
  }
});

module.exports = { acoes };
