// @ts-check
// Fechar uma dúvida (resposta manual ou comentário confirmado): grava, avisa o Claude e, se era a última, a spec segue.
const { DUVIDAS, duvidasDe, ticketDe } = require('../../locais');

// Fecha a dúvida (só o humano) e, se era a última, a spec pode seguir.
function fecharDuvida(s, t, id, resposta) {
  const l = duvidasDe(s.pasta(t.chave)),
    x = l.find((y) => y.id === id);
  if (!x || x.resposta) return;
  x.resposta = { ...resposta, em: new Date().toISOString() };
  x.sugestao = null;
  s.gravar(t.chave, DUVIDAS, l);
  s.orq.respondidas.push(`${id} (dúvida) → ${resposta.texto}`);
  require('../../pacote').gravar(t.chave); // a resposta entra no refinamento.md mesmo sem execução depois
  s.render();
  if (!l.some((y) => !y.resposta)) s.orq.seguir(ticketDe(t.chave));
}

module.exports = { fecharDuvida };
