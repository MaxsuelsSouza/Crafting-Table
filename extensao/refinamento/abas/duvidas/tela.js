// @ts-check
// Tela da aba Dúvidas: as não enviadas em cima, as enviadas ao ticket na caixa de baixo.
const { esc } = require('../../../infra/texto');
const { quando } = require('../../../componentes/formato');

// Aba Dúvidas (HTML igual ao que corpoAba montava; a indentação dos templates é a original).
function corpo(d) {
  const card = (x) => {
    const aberta = !x.resposta,
      ev = x.enviadaEm;
    const corpo = `${x.contexto ? `<div class="dtrecho"><b>Contexto:</b> ${esc(x.contexto)}</div>` : ''}
        ${x.resposta ? `<div class="dtrecho resp"><b>Resposta${x.resposta.origem === 'comentario' ? ` · comentário de ${esc(x.resposta.autor || '')}` : ' · dada por você'}:</b> ${esc(x.resposta.texto)}</div>` : ''}
        ${
          aberta && x.sugestao
            ? `<div class="dtrecho sug"><b>Possível resposta de ${esc(x.sugestao.autor || 'alguém')}:</b> “${esc(String(x.sugestao.texto).slice(0, 600))}”<br><i>${esc(x.sugestao.motivo)}</i>
          <div class="acoes-aba"><button class="fb-btn enviar" data-acao="duvidaConfirmar" data-id="${esc(x.id)}">Confirmar como resposta</button>
          <button class="fb-btn" data-acao="duvidaRejeitar" data-id="${esc(x.id)}">Não é a resposta</button></div></div>`
            : ''
        }
        <div class="acoes-aba">${!ev ? `<button class="fb-btn enviar" data-acao="duvidaEnviar" data-id="${esc(x.id)}">Enviar para os comentários do ticket</button>` : ''}
          ${aberta ? `<button class="fb-btn" data-acao="duvidaResponder" data-id="${esc(x.id)}">Dar resposta</button>` : ''}</div>`;
    const marca = x.resposta
      ? '✓ Respondida'
      : ev
        ? `Aguardando resposta${x.sugestao ? ' · resposta sugerida' : ''}`
        : 'Não enviada';
    return `<details class="decisao duvida${ev ? ' enviada' : ''}"${!ev || x.sugestao ? ' open' : ''}>
        <summary><span class="quando">${esc(quando(x.em))}</span> <b>${esc(x.id)}</b> <span class="origem">${marca}</span><span class="dtexto">${esc(x.texto)}</span></summary>${corpo}</details>`;
  };
  const l = d.duvidas.slice().reverse(),
    novas = l.filter((x) => !x.enviadaEm),
    enviadas = l.filter((x) => x.enviadaEm);
  return `<div class="folha">${
    l.length
      ? `${novas.length ? `<div class="hist">${novas.map(card).join('')}</div>` : ''}
      ${enviadas.length ? `<div class="caixa-enviadas"><div class="titulo-caixa">Enviadas ao ticket (${enviadas.length})</div><div class="hist">${enviadas.map(card).join('')}</div></div>` : ''}`
      : '<div class="vazio-aba">Nenhuma dúvida registrada ainda.<br>No modo refinamento, quando você escolher <b>Tirar dúvida</b> numa pergunta do Claude, ela aparece aqui.</div>'
  }</div>`;
}

module.exports = { corpo };
