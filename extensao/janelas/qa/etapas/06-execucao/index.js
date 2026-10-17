// @ts-check
// Etapa 6 · Execução de cada cenário, na ordem da fila (zero skip). Devolve true quando parou (pausa, bloqueio, erro da API).
// Antes da fila (orquestrador/executar.js): flows de início (inicio/) e 6.0 Gerar (UMA sessão: camadas, receita de massa, roteiros).
// Por cenário: valida a massa no banco (garantir-massa.js) → 6.1 roteiro do Gerar (ou correção na conversa dele) → 6.2 a extensão roda sem Claude → 6.3 diagnóstico só se falhou.
//   garantir-massa.js    "Validar massa" antes do cenário; inválida → renova só a dele; 2 seguidas → Etapa 5 para os pendentes; sem jeito → não executável
//   executar-cenario.js  encadeia 6.1 → 6.2 → 6.3 de um cenário (roteiro ruim volta ao 6.1 uma vez)
//   subetapas/           6.0-gerar.js · 6.1-roteiro.js · 6.2-jornada.js · 6.3-diagnostico.js
//   inicio/              flows da tela de início (escritos uma vez por ambiente Android, validados no aparelho, guardados nos Conhecimentos)
//   api.js               a API para a etapa http (login da skill)
//   prompt-gerar.js      prompts do 6.0 e das correções na mesma conversa
//   depois-do-claude.js  pausa, erro da API, tempo, bloqueio e sem-massa depois de cada claude -p
//   roteiros.js          roteiros/CTnn.json (registrar pelo qa-state, reaproveitar por hash, pedir outro)
//   dependencias.js      o ambiente do ticket (infra/ambientes: flow, bipe, prints), banco só leitura, ~/.wms-testes.env
//   cenario.js           execuções de um cenário (abrir, concluir), a fila e o não executável
//   evidencias.js        anexos da execução em andamento
//   regras/              evidencia.js (evidência obrigatória) · roteiro.js (validação) · consulta.js (antes × depois) · http.js · camadas.js · diagnostico.js
//   prompt.js            prompts do 6.1 e do 6.3
const aoVivo = require('../../../../componentes/ao-vivo');
const { pausado } = require('../../orquestrador/rodando');
const { cenarios } = require('../02-cenarios/mapa');
const { massa, massaEstado } = require('../05-massa/estado');
const { desistirMassa } = require('../05-massa/desistir');
const { fila, iniciarCenario, naoExecutavel } = require('./cenario');
const { camadaDe } = require('./regras/camadas');
const { garantirMassa } = require('./garantir-massa');
const { executarCenario } = require('./executar-cenario');

async function rodar(dir, d, amb) {
  let pend;
  const seguidas = { invalidas: 0 }, // cenários seguidos com massa inválida (2 → Etapa 5 para os pendentes)
    retentou = new Set(); // cenários que o Claude já devolveu como sem-massa nesta rodada (na 2ª: não executável)
  while (!pausado(dir) && (pend = fila(cenarios(dir))).length) {
    const c = pend[0];
    const cam = camadaDe(dir, c.id);
    if (cam?.camada === 'nao-verificavel') {
      // o Gerar concluiu que não dá para verificar aqui: sai no relatório como não verificável, com o motivo
      iniciarCenario(dir, c.id, amb.sha);
      naoExecutavel(dir, c.id, `Não verificável: ${cam.porque}`);
      aoVivo.anotar(dir, { tipo: 'aviso', texto: `${c.id} não verificável (${cam.porque}): seguindo` });
      continue;
    }
    const m = await garantirMassa(dir, d, amb, c, seguidas);
    if (m.parou) return true;
    if (m.naoExecutavel) continue;
    const fim = await executarCenario(dir, d, amb, c, iniciarCenario(dir, c.id, amb.sha), m.itens);
    if (fim === 'parou') return true;
    if (fim !== 'sem-massa') continue;
    // O Claude achou a massa imprestável: ela vira inválida e o cenário volta para a fila (a garantia de massa renova). Na 2ª vez, não executável.
    if (retentou.has(c.id)) {
      desistirMassa(dir, c.id, 'a massa renovada também não serviu para o cenário');
      continue;
    }
    retentou.add(c.id);
    for (const i of massa(dir).itens)
      if ((i.cenarios || []).includes(c.id) && i.estado === 'valida') massaEstado(dir, i.id, 'invalida');
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `${c.id}: o Claude achou a massa imprestável: renovando` });
  }
  return false;
}

module.exports = { n: 6, rodar };
