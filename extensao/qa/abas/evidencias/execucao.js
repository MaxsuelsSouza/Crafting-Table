// @ts-check
const { esc } = require('../comum');
const { cenarios } = require('../../etapas/02-cenarios/mapa');
const { fila, RESULTADOS } = require('../../etapas/06-execucao/cenario');
const { donoAmbiente } = require('../../etapas/03-ambiente/estado');
const { podePublicar } = require('../../etapas/07-publicar');
const { ehLocal, nomeProvedor } = require('../../etapas/01-planejamento/dependencias');

const BOTAO_PUBLICAR = (ok, local = false) =>
  `<button class="sec" data-painel="qaPublicar" ${ok ? '' : 'disabled '}title="${ok ? `Comentário com o resultado e as evidências na subtarefa de QA${local ? ' do documento' : ''} (pede confirmação)` : 'Só é possível publicar quando todos os cenários estiverem com resultado OK (passou)'}">${local ? 'Salvar resultado no documento' : `Publicar no ${nomeProvedor()}`}</button>`;
function execucaoHtml(dir, e, rodando) {
  const r = cenarios(dir).cenarios.filter((c) => !c.arquivado),
    pend = fila({ cenarios: r }).length,
    feitos = r.filter((c) => RESULTADOS.includes(c.status)).length;
  const dono = donoAmbiente(),
    outro = dono && dono.chave !== e.chave ? ` O ambiente está com o ${esc(dono.chave)}.` : '';
  if (rodando)
    return `<div class="qa-card"><b><span class="vivo-bola"></span>QA em andamento</b><p>⏸ no topo pausa: o cenário em andamento é descartado e volta na retomada.</p></div>`;
  if (pend)
    return `${e.interrupcao ? `<div class="qa-card bloq"><b>Fila pausada: Claude indisponível${e.interrupcao.cenario ? ` em ${esc(e.interrupcao.cenario)}` : ''}</b><p>${esc(e.interrupcao.detalhe)}</p><p>Nenhum cenário foi pulado: retome e a execução segue do mesmo ponto.</p></div>` : ''}${e.precondicao?.status === 'falhou' ? `<div class="qa-card bloq"><b>Pré-condição falhou: a suíte não foi iniciada</b><p>${esc(e.precondicao.motivo)}</p></div>` : ''}<div class="qa-card"><b>${pend} cenário(s) na fila${e.execucao === 'pausado' ? ' · pausado' : ''}</b><p>Sobe API, Metro, emulador e app, confere a massa e executa um cenário por vez.${outro}</p>
    <button data-painel="qaIniciar">${e.execucao === 'pausado' ? 'Retomar' : feitos ? 'Continuar' : 'Dar início'}</button>
    ${feitos ? BOTAO_PUBLICAR(podePublicar(r), ehLocal(dir)) : ''}</div>`;
  return `<div class="qa-card"><b>Execução concluída</b><p>Nenhum cenário na fila. ↻ Refazer num cenário o coloca de volta.</p>
    ${feitos ? BOTAO_PUBLICAR(podePublicar(r), ehLocal(dir)) : ''}</div>`;
}

module.exports = { BOTAO_PUBLICAR, execucaoHtml };
