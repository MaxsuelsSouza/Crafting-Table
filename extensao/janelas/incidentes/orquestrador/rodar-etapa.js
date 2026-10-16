// @ts-check
// Execução das etapas 1 a 4: portão do ticket, gancho "antes" da etapa e o `claude -p` que grava o arquivo da etapa.
// Ao terminar, apos-etapa.js confere o resultado.
const fs = require('fs');
const path = require('path');
const maestro = require('../../../infra/agentes/maestro');
const { ETAPAS, logica } = require('../etapas');
const { mudar, PAUSA } = require('../estado');
const { pausar } = require('./pausar');
const { portaoTicket } = require('./portao-ticket');
const { opcoesClaude } = require('./claude-etapa');

const rodarEtapa = async (s, t, n, rodada, ajuste = false) => {
  const dir = s.pastaAba(t.id),
    et = logica(n);
  const portao = await portaoTicket(s, t, dir, n, rodada, et);
  if (portao.parar) return;
  const j = portao.j;
  const p = et.antes ? await et.antes({ s, t, dir, j, ajuste }) : null;
  if (p) return pausar(s, dir, n, p);
  const arqEtapa = path.join(dir, ETAPAS[n - 1].arq),
    antes = ajuste && fs.existsSync(arqEtapa) ? fs.statSync(arqEtapa).mtimeMs : 0;
  if (!ajuste) fs.rmSync(arqEtapa, { force: true }); // ajuste mantém o documento: o Claude o atualiza
  fs.rmSync(path.join(dir, PAUSA), { force: true });
  mudar(dir, { etapa: n, fase: 'rodando', pausa: null, aprovacao: null });
  let tratou = false;
  const aoMudar = () => {
    s.render();
    if (!tratou && !maestro.rodando(dir)) {
      tratou = true;
      require('./apos-etapa').aposEtapa(s, t, n, rodada, antes);
    }
  };
  const ok = maestro.rodar(dir, opcoesClaude({ s, t, dir, n, ajuste, aoMudar }));
  if (!ok) mudar(dir, { fase: 'parado' });
  s.render();
};

module.exports = { rodarEtapa };
