// @ts-check
// Aba Decisões: histórico (clique expande o resumo). O CSS (.hist, .decisao, .quando, .origem...) fica no estilo da moldura, junto do de Dúvidas, que o compartilha.
const { esc } = require('../infra/ticket')._teste;
const { quando } = require('./formato');

const corpoAba = (d) => `<div class="folha">${d.decisoes.length ? `<div class="hist">${d.decisoes.map((x) => `
    <details class="decisao" data-dec="${esc(x.id)}">
      <summary><span class="quando">${esc(quando(x.data))}</span><span class="dtitulo">${esc(x.titulo)}</span>
        <span class="origem o-${esc(x.origem)}">${x.origem === 'pergunta' ? 'Pergunta' : 'Chat'}</span></summary>
      <div class="dresumo"><p>${esc(x.resumo || '')}</p>
        ${x.origem === 'pergunta' && x.detalhes ? `<div class="dtrecho"><b>Opções:</b> ${(x.detalhes.opcoes || []).map((o) => o === x.detalhes.escolha ? `<b class="esc">${esc(o)}</b>` : esc(o)).join(' · ')}${x.detalhes.notas ? `<br><b>Observação:</b> ${esc(x.detalhes.notas)}` : ''}</div>` : ''}
        ${x.origem === 'chat' && x.detalhes?.mensagem ? `<div class="dtrecho"><b>Mensagem:</b> “${esc(x.detalhes.mensagem.slice(0, 500))}”</div>` : ''}
      </div>
    </details>`).join('')}</div>`
    : '<div class="vazio-aba">Nenhuma decisão registrada ainda.<br>Elas aparecem quando você responde uma pergunta do Claude ou pede para ele fazer diferente.</div>'}</div>`;

module.exports = { corpoAba };
