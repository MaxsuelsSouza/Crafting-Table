// @ts-check
// 0.4 · Validação (extensão): lê o plano-subtarefas.md (regras/ler-plano.js), confere (regras/validar-plano.js) e grava o plano-subtarefas.json.
// Válido: segue para o portão (0.5, orquestrador/avancar.js: a etapa 0 sempre pede aprovação). Inválido: volta uma vez ao Claude com os
// erros (ajuste); na segunda, para com erro e os motivos no Ao vivo.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { RESPOSTAS, estado, mudar } = require('../../../estado');
const { lerPlanoMd } = require('../regras/ler-plano');
const { validarPlano } = require('../regras/validar-plano');
const { PLANO_MD, PLANO_JSON, SUBS, lerSubs } = require('../arquivos');

async function aposPlano(s, t, rodada) {
  const { avancar } = require('../../../orquestrador/avancar'),
    { rodarEtapa } = require('../../../orquestrador/rodar-etapa'); // ciclo: rodar-etapa → apos-etapa → aqui
  const dir = s.pastaAba(t.id),
    subs = lerSubs(dir);
  const plano = lerPlanoMd(fs.readFileSync(path.join(dir, PLANO_MD), 'utf8'));
  const abertas = subs.filter((x) => x.situacao === 'aberta').map((x) => x.key),
    concluidas = subs.filter((x) => x.situacao === 'concluida').map((x) => x.key);
  const erros = validarPlano(plano, abertas, concluidas);
  if (erros.length) {
    const tentativas = (estado(dir).ajustesPlano || 0) + 1;
    aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: `Plano das subtarefas inválido (${erros.length})`,
      detalhe: erros.join('\n')
    });
    if (tentativas > 1) {
      mudar(dir, { fase: 'erro', ajustesPlano: 0 });
      aoVivo.anotar(dir, { tipo: 'erro', texto: `O plano continuou inválido depois do ajuste: ${erros.join(' ')}` });
      return s.render();
    }
    mudar(dir, { ajustesPlano: tentativas });
    fs.appendFileSync(
      path.join(dir, RESPOSTAS),
      `## Ajuste pedido na etapa 0 (${PLANO_MD}): o plano não passou na conferência da extensão\n${erros.map((e) => `- ${e}`).join('\n')}\n\n`
    );
    return rodarEtapa(s, t, 0, rodada, true);
  }
  fs.writeFileSync(path.join(dir, PLANO_JSON), JSON.stringify(plano, null, 2));
  const grupoDe = Object.fromEntries(plano.grupos.flatMap((g) => g.subtarefas.map((k) => [k, g.id])));
  fs.writeFileSync(
    path.join(dir, SUBS),
    JSON.stringify(
      subs.map((x) => ({ ...x, grupo: grupoDe[x.key] })),
      null,
      2
    )
  );
  mudar(dir, { ajustesPlano: 0 });
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Plano válido: ${plano.grupos.length} grupo(s), execução ${plano.execucao}`,
    detalhe: plano.grupos.map((g) => `${g.id} · ${g.titulo}: ${g.subtarefas.join(', ')}`).join('\n')
  });
  return avancar(s, t, 0, rodada);
}

module.exports = { aposPlano };
