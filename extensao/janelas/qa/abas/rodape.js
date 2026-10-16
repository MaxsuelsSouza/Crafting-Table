// @ts-check
const qa = require('../motor');

// Caixa do ambiente no rodapé (depois de Comandos). Preparando → abre o log ao vivo; erro → luz vermelha piscando e bolinha até abrir a análise.
// Nada rodando: sem emulador e sem nenhum Comando (API, Metro) ligado.
const nadaRodando = () => {
  try {
    return (
      !require('../../../modulos/emulador').emuladorRodando() &&
      !(require('../../../modulos/comandos').api?.lista() || []).some((c) => c.rodando)
    );
  } catch {
    return false;
  }
};
const caixaAmbiente = (dir, acao) => {
  const amb = qa.statusAmbiente(dir);
  return !amb
    ? ''
    : amb.tipo === 'preparando'
      ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Preparando API, Metro, emulador e app: clique para ver o log ao vivo"><span class="ct-luz prep"></span>Preparando ambiente</button>`
      : amb.tipo === 'erro'
        ? `<button class="ct-amb" ${acao}="${amb.analisando ? 'qaAmbLog' : 'qaAmbErro'}" title="${amb.analisando ? 'O Claude está analisando o erro: clique para ver o log ao vivo' : 'Ver o erro e a análise do Claude'}"><span class="ct-luz erro ${amb.nova || amb.analisando ? 'pisca' : ''}"></span>Ambiente parou${amb.analisando ? ' · analisando' : ''}${amb.nova ? '<span class="ct-badge ct-badge-erro">1</span>' : ''}</button>`
        : nadaRodando()
          ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Nada rodando (API, Metro, emulador): clique para ver o log"><span class="ct-luz erro"></span>Ambiente</button>`
          : `<button class="ct-amb" ${acao}="qaAmbLog" title="Ambiente pronto: clique para ver o log"><span class="ct-luz ok"></span>Ambiente</button>`;
};

module.exports = { caixaAmbiente, nadaRodando };
