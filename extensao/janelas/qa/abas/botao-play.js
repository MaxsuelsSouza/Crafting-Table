// @ts-check
const aoVivo = require('../../../componentes/ao-vivo');
const qa = require('../motor');

// Botão ▶/⏸ do cabeçalho do ticket na lista QA (b = data-acao/data-painel já montado pelo cabecalho()).
const botaoPlay = (dir, b) =>
  aoVivo.controle(
    qa.rodando(dir),
    {
      pausar: 'qaParar',
      retomar: 'qaPlay',
      dicaPausar: 'Pausar o QA: o cenário em andamento é descartado e volta na retomada',
      dicaRetomar: 'Executar QA: planejamento, ambiente, massa e cenários pendentes (Ao vivo em Evidências)'
    },
    b
  );

module.exports = { botaoPlay };
