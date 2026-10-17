// @ts-check
// Etapa terminou: pausa pedida pelo Claude, artefato gravado (segue), pausa da própria etapa (depois) ou erro.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const controle = require('../../../infra/controle');
const { ETAPAS, logica } = require('../etapas');
const { mudar, existe, lerJson, PAUSA } = require('../estado');

const aposEtapa = async (s, t, n, rodada, mtimeAntes = 0) => {
  const dir = s.pastaAba(t.id),
    p = lerJson(path.join(dir, PAUSA), null),
    et = logica(n);
  if (!controle.valida(dir, rodada)) return s.render(); // pausado por você: o Claude morto não é erro
  let pd;
  if (p?.pergunta) {
    fs.rmSync(path.join(dir, PAUSA), { force: true });
    mudar(dir, {
      fase: 'pausado',
      pausa: {
        motivo: String(p.motivo || ''),
        pergunta: String(p.pergunta),
        opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : []
      }
    });
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Mergulho pausado na etapa ${n}: aguardando sua resposta` });
  } else if (!existe(dir, n) || (mtimeAntes && fs.statSync(path.join(dir, ETAPAS[n - 1].arq)).mtimeMs <= mtimeAntes)) {
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, {
      tipo: 'erro',
      texto: `A etapa ${n} terminou sem ${mtimeAntes ? 'atualizar' : 'gravar'} ${ETAPAS[n - 1].arq}`
    });
  } else if (et.depois && (pd = et.depois({ s, t, dir }))) {
    mudar(dir, {
      etapa: n,
      fase: 'pausado',
      pausa: { motivo: pd.motivo, pergunta: pd.pergunta, opcoes: pd.opcoes || [] }
    });
    aoVivo.anotar(dir, { tipo: 'aviso', texto: pd.aviso });
  } else await require('./avancar').avancarEtapa(s, t, n);
  s.render();
};

module.exports = { aposEtapa };
