// @ts-check
// Subetapa 5.1 · Planejar o fluxo: o Claude monta os passos da reprodução (fluxo.json, por mergulho-fluxo plano).
// Só lê 1-4 e massa-real.sql (a massa de teste vem depois, do fluxo). Retomada reaproveita o fluxo já planejado.
const path = require('path');
const { documentos } = require('../../index');
const { FLUXO, REGRAS, SKILL } = require('../regras/ferramentas');
const vagas = require('../../../../../infra/agentes/etapas');
const { SUBETAPAS, ARTEFATO, pausar } = require('./estado');

const lista = documentos;
const promptPlano = (chave, dir) =>
  `[segundo plano · Crafting Table · Incidente ${chave}] Monte o FLUXO da reprodução: todos os passos que serão necessários para replicar NO EMULADOR a ação do diagnóstico com a Massa de Teste. ` +
  `Leia ${lista(dir)} e ${path.join(dir, 'massa-real.sql')} (a massa de teste ainda NÃO existe: ela será montada depois, a partir deste fluxo), e a documentação do app (skill testes-funcionais: ${SKILL()}/SKILL.md e references/jornada-mobile-maestro.md; código do mobile). ` +
  'Do estado do app recém-aberto até o resultado a verificar: login/seleção de usuário, navegação até o módulo e a tela, escolha do registro (descreva o registro de que o passo precisa, sem ids: a Massa de Teste é montada depois), a ação do incidente e a conferência do erro. De 5 a 12 passos curtos e verificáveis; cada um com "titulo" e "texto" (o que fazer e o que esperar ver). ' +
  `Registre com: ${FLUXO} plano <<'FIM' [{"titulo":"...","texto":"..."}, ...] FIM . NÃO execute nada no emulador agora: só o plano. ${REGRAS}${vagas.aviso('incidentes.reproducao')}`;

// Devolve true se parou (pausa); false para seguir para a 5.2.
async function rodar({ t, dir, d, ponto, comecar, concluirSub }) {
  const S1 = SUBETAPAS[0];
  comecar(S1);
  if (!ARTEFATO.plano(dir)) {
    await d.claude({ prompt: promptPlano(t.chave, dir), titulo: 'Incidente · Planejando o fluxo da reprodução' });
    ponto();
    if (!ARTEFATO.plano(dir)) return pausar(dir, 'O Claude não montou o fluxo da reprodução', 'Tente de novo?');
  }
  concluirSub(S1);
  return false;
}

module.exports = { promptPlano, rodar };
