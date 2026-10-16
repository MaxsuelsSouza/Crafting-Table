// @ts-check
// Etapa 6 · Verificação (extensão, sem IA): roda os comandos de build e teste de Configurações > Comandos e grava verificacao.json.
// Falhou: volta para a 5 em modo correção (até MAX_CORRECOES) e depois pausa. Passou: segue para o Resumo.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../componentes/ao-vivo');
const controle = require('../../infra/controle');
const { ARQ } = require('.');
const { deps } = require('../dependencias');
const { CORRIGIR, RESUMIR, estado, mudar, pausar } = require('../estado');

const MAX_CORRECOES = 2;
// Papéis dos comandos das Configurações > Comandos usados na verificação (build e teste), pelo nome do botão ou pelo comando.
const PAPEIS = {
  build: { nomeRe: /\bbuild\b|compil/i, cmdRe: /\b(build|assemble|compile|tsc)\b/i },
  teste: { nomeRe: /\btest(e|es|s)?\b/i, cmdRe: /\b(test|jest|vitest|pytest|mocha)\b/i }
};
const comandosDe = (papel) =>
  deps.comandos().filter((b) => PAPEIS[papel].nomeRe.test(b.nome) || PAPEIS[papel].cmdRe.test(b.comando || ''));
const verificacaoComandos = () => [
  ...comandosDe('build').map((b) => ({ ...b, papel: 'build' })),
  ...comandosDe('teste')
    .filter((b) => !comandosDe('build').some((x) => x.id === b.id))
    .map((b) => ({ ...b, papel: 'teste' }))
];

async function verificar(s, t, rodada) {
  const { proxima } = require('../orquestrador/avancar'),
    { rodarEtapa } = require('../orquestrador/rodar-etapa'); // ciclo: avancar → verificar
  const dir = s.pastaAba(t.id),
    cmds = verificacaoComandos(),
    e = estado(dir);
  mudar(dir, { etapa: 6, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Etapa 6: Verificação' });
  s.render();
  const rodadas = [];
  for (const c of cmds) {
    aoVivo.anotar(dir, { tipo: 'acao', texto: `${c.papel === 'build' ? 'Build' : 'Teste'}: ${c.nome} (${c.comando})` });
    const r = await deps.executar(c.comando, c.pasta, dir);
    if (!controle.valida(dir, rodada)) return s.render();
    rodadas.push({
      nome: c.nome,
      papel: c.papel,
      comando: c.comando,
      pasta: c.pasta,
      codigo: r.codigo,
      saida: r.saida
    });
    s.render();
  }
  const ok = rodadas.every((r) => r.codigo === 0);
  const pendencias = cmds.length
    ? []
    : [
        'Nenhum comando de build ou teste em Configurações > Comandos (botões com "build" ou "test" no nome ou no comando): nada foi verificado automaticamente.'
      ];
  fs.writeFileSync(
    path.join(dir, ARQ[6]),
    JSON.stringify({ ok, em: new Date().toISOString(), tentativa: e.tentativas, rodadas, pendencias }, null, 2)
  );
  if (ok) {
    aoVivo.anotar(dir, {
      tipo: 'fim',
      texto: cmds.length
        ? `Verificação passou (${rodadas.length} comando(s))`
        : 'Verificação sem comandos configurados: registrada como pendência'
    });
    mudar(dir, { tentativas: 0, correcao: false });
    return proxima(s, t, 6, rodada);
  }
  aoVivo.anotar(dir, {
    tipo: 'aviso',
    texto: `Verificação falhou: ${rodadas
      .filter((r) => r.codigo !== 0)
      .map((r) => r.nome)
      .join(', ')}`
  });
  if (e.tentativas < MAX_CORRECOES) {
    mudar(dir, { etapa: 5, fase: 'parado', tentativas: e.tentativas + 1, correcao: true });
    return rodarEtapa(s, t, 5, rodada);
  }
  pausar(dir, 6, {
    motivo: 'verificacao',
    pergunta: `A verificação falhou depois de ${MAX_CORRECOES} correções (veja ${ARQ[6]}).`,
    opcoes: [CORRIGIR, RESUMIR]
  });
  return s.render();
}

module.exports = { n: 6, PAPEIS, MAX_CORRECOES, comandosDe, verificacaoComandos, verificar };
