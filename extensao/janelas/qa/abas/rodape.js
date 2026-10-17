// @ts-check
const qa = require('../motor');
const { esc } = require('../../../infra/texto');
const ambientes = require('../../../infra/ambientes');

// Caixa do ambiente no rodapé (depois de Comandos). Preparando → abre o log ao vivo; erro → luz vermelha piscando e bolinha até abrir a análise.
// Nada rodando: o aparelho do ambiente desligado (emulador; os outros não dizem) e nenhum Comando (API, Metro, front) ligado.
const nadaRodando = (dir) => {
  try {
    const a = ambientes.obter(dir ? qa.ambiente(dir)?.nome : undefined);
    return !a.ligado?.() && !(require('../../../modulos/comandos').api?.lista() || []).some((c) => c.rodando);
  } catch {
    return false;
  }
};
const rotulo = (dir) => ambientes.obter(qa.ambiente(dir)?.nome).rotulo;
const caixaAmbiente = (dir, acao) => {
  const amb = qa.statusAmbiente(dir);
  return !amb
    ? ''
    : amb.tipo === 'preparando'
      ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Preparando o ambiente (aplicação e ${esc(rotulo(dir))}): clique para ver o log ao vivo"><span class="ct-luz prep"></span>Preparando ambiente</button>`
      : amb.tipo === 'erro'
        ? `<button class="ct-amb" ${acao}="${amb.analisando ? 'qaAmbLog' : 'qaAmbErro'}" title="${amb.analisando ? 'O Claude está analisando o erro: clique para ver o log ao vivo' : 'Ver o erro e a análise do Claude'}"><span class="ct-luz erro ${amb.nova || amb.analisando ? 'pisca' : ''}"></span>Ambiente parou${amb.analisando ? ' · analisando' : ''}${amb.nova ? '<span class="ct-badge ct-badge-erro">1</span>' : ''}</button>`
        : nadaRodando(dir)
          ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Nada rodando (aplicação e ${esc(rotulo(dir))}): clique para ver o log"><span class="ct-luz erro"></span>Ambiente</button>`
          : `<button class="ct-amb" ${acao}="qaAmbLog" title="Ambiente pronto: clique para ver o log"><span class="ct-luz ok"></span>Ambiente</button>`;
};

module.exports = { caixaAmbiente, nadaRodando };
