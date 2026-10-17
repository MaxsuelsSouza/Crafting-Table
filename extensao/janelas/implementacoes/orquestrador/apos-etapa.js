// @ts-check
// Etapa com IA terminou: pausa pedida pelo Claude, artefato não gravado (erro), implementação sem mudança (pausa) ou avança (avancar.js).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const controle = require('../../../infra/controle');
const { etapa } = require('../etapas');
const { REPETIR, VERIFICAR, estado, mudar, existe, pausar } = require('../estado');
const { lerPausa, limparPausa } = require('./pausa');
const { ambiente } = require('./ambiente');
const { houveMudanca } = require('../etapas/05-implementacao');
const { avancar } = require('./avancar');

const aposEtapa = async (s, t, n, rodada, mtimeAntes = 0) => {
  const dir = s.pastaAba(t.id),
    p = lerPausa(dir);
  if (!controle.valida(dir, rodada)) return s.render(); // pausado por você: o Claude morto não é erro
  if (p?.pergunta) {
    limparPausa(dir);
    pausar(dir, n, {
      motivo: String(p.motivo || ''),
      pergunta: String(p.pergunta),
      opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : []
    });
  } else if (!existe(dir, n) || (mtimeAntes && fs.statSync(path.join(dir, etapa(n).arq)).mtimeMs <= mtimeAntes)) {
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, {
      tipo: 'erro',
      texto: `A etapa ${n} terminou sem ${mtimeAntes ? 'atualizar' : 'gravar'} ${etapa(n).arq}`
    });
  } else if (n === 5 && !houveMudanca(ambiente(s, t).repos, estado(dir).branches)) {
    pausar(dir, 5, {
      motivo: 'sem-mudanca',
      pergunta:
        'A implementação terminou, mas nenhum repositório tem alteração na branch de trabalho. O Claude pode ter decidido que nada precisava mudar (veja o log) ou não ter editado nada.',
      opcoes: [REPETIR, VERIFICAR]
    });
  } else if (n === 0)
    await require('../etapas/00-subtarefas').aposPlano(s, t, rodada); // valida o plano antes do portão
  else await avancar(s, t, n, rodada);
  s.render();
};

module.exports = { aposEtapa };
