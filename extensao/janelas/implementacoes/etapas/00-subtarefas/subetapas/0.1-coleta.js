// @ts-check
// 0.1 · Coleta (extensão, sem IA): as subtarefas do ticket (jira.buscar, já no cache do painel) separadas em abertas, concluídas e fora
// (regras/filtro.js); a descrição de cada uma (provedor.filhos, uma chamada) vai para subtarefas/<KEY>.md e a lista para subtarefas.json.
// Sem subtarefa aberta devolve null: o ticket segue como ticket simples (etapa 1).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { deps } = require('../../../dependencias');
const { separar, situacao } = require('../regras/filtro');
const { SUBS, PASTA_SUBS, arqSub, lerSubs } = require('../arquivos');

const LIMITE = 100; // maxResults da busca de filhos no Jira

async function coletar(s, t) {
  const dir = s.pastaAba(t.id);
  s.cacheJira = s.cacheJira || {};
  if (!s.cacheJira[t.id] && s.atualizarJira) await s.atualizarJira(t.id);
  const j = s.cacheJira[t.id],
    lista = j && !j.erro ? j.subtarefas || [] : [];
  const sep = separar(lista);
  if (!sep.abertas.length) return null;
  let descricoes = [];
  try {
    descricoes = await deps.subtarefas(s, t);
  } catch (x) {
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Não consegui ler a descrição das subtarefas: ${x.message}` });
  }
  fs.mkdirSync(path.join(dir, PASTA_SUBS), { recursive: true });
  const usadas = [...sep.abertas, ...sep.concluidas];
  for (const x of usadas) {
    const md = descricoes.find((d) => d.key === x.key)?.md || '(sem descrição)';
    fs.writeFileSync(
      arqSub(dir, x.key),
      `# ${x.key} · ${x.resumo || ''}\nStatus: ${x.status || '?'} · Tipo: ${x.tipo || '?'} · Situação: ${situacao(x)}\n\n${md}\n`
    );
  }
  const antigos = Object.fromEntries(lerSubs(dir).map((x) => [x.key, x]));
  fs.writeFileSync(
    path.join(dir, SUBS),
    JSON.stringify(
      lista.map((x) => ({
        key: x.key,
        resumo: x.resumo,
        status: x.status,
        tipo: x.tipo,
        situacao: situacao(x),
        ...(antigos[x.key]?.grupo ? { grupo: antigos[x.key].grupo } : {})
      })),
      null,
      2
    )
  );
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Subtarefas: ${sep.abertas.length} aberta(s), ${sep.concluidas.length} concluída(s), ${sep.fora.length} fora (QA ou cancelada)`,
    detalhe: lista.map((x) => `${x.key} · ${situacao(x)} · ${x.resumo}`).join('\n')
  });
  if (lista.length >= LIMITE)
    aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: `O ticket tem ${LIMITE} subtarefas ou mais: só as ${LIMITE} primeiras foram lidas`
    });
  return sep;
}

module.exports = { coletar };
