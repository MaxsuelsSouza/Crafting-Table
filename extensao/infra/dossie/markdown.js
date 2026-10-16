// @ts-check
// Markdown do dossiê (dossie.md, que a IA e a aba Dossiê leem) e os rótulos de modo e de eixo. Os Incidentes usam paraMarkdown com rótulos próprios.
const path = require('path');
const tipoTicket = require('../tipo-ticket');
const { TRABALHO, REPRODUCAO } = require('./arquivos');

const ROTULO_MODO = { executar: 'Executar (spec e tarefas aprovadas)', corrigir: 'Corrigir (incidente diagnosticado)', entender: 'Entender primeiro (sem refinamento)', perguntar: 'Perguntar (só o título)' };
const ROTULO_EIXO = { alvo: 'Alvo: o que tem que mudar', pronto: 'Critério de pronto: como saber que acabou', onde: 'Onde mexer' };

/** Markdown do dossiê (a IA e a aba Dossiê leem daqui).
 * @param {any} d  @param {{ eixos: Record<string, string>, modos: Record<string, string>, nome: string }} [o] rótulos: o padrão é o da Implementação */
function paraMarkdown(d, o = { eixos: ROTULO_EIXO, modos: ROTULO_MODO, nome: 'Dossiê' }) {
  const sec = (e) => `## ${o.eixos[e]} · ${d.niveis[e]}\n\n` + (d.eixos[e].length
    ? d.eixos[e].map((i) => `- **${i.rotulo}** (${i.confianca})${i.detalhe ? ` · ${i.detalhe}` : ''}${i.arquivo ? `\n  ${i.arquivo}` : ''}`).join('\n') : '- (nada encontrado)');
  return [`# ${o.nome} · ${d.ticket}${d.titulo ? ` · ${d.titulo}` : ''}`, '',
    `Modo: **${o.modos[d.modo]}** · Prontidão: **${d.prontidao}**`, '',
    ...(d.exigeReproducao ? [`Tipo do ticket: **${d.tipoTicket}**${d.categoria ? ` (${tipoTicket.rotulo(d.categoria)})` : ''}: exige a etapa de Reprodução (confirmar que o erro acontece) antes de desenvolver. Resultado: ${REPRODUCAO}`, ''] : []),
    ...Object.keys(o.eixos).flatMap((e) => [sec(e), '']),
    '## Capacidades', '', `- Banco: ${d.capacidades.banco === 'leitura' ? 'somente leitura (mapa-db)' : 'indisponível'}`,
    ...d.capacidades.repos.map((r) => `- Repositório ${r.camada}: ${r.caminho} · branch principal: ${r.branchPrincipal || '(não configurada)'}`), '',
    ...(d.trabalho?.length ? ['## Trabalho já feito', '', ...d.trabalho.flatMap((t) => [`- ${path.basename(t.caminho)} (${t.camada}): ${t.branches.map((b) => `\`${b.nome}\` (${b.adiante} à frente)`).join(', ') || 'sem branch com a chave'}${t.foraDeBranch.length ? ` · ${t.foraDeBranch.length} commit(s) soltos` : ''}${t.integrados.length ? ` · ${t.integrados.length} já integrado(s)` : ''}`]), `  Detalhe: ${TRABALHO}`, ''] : []),
    '## Lacunas', '', ...(d.lacunas.length ? d.lacunas.map((l) => `- ${l}`) : ['- (nenhuma)']), ''].join('\n');
}

module.exports = { ROTULO_MODO, ROTULO_EIXO, paraMarkdown };
