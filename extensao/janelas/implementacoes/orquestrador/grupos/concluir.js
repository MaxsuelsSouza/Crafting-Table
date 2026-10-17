// @ts-check
// Todos os grupos concluídos: integra o worktree (paralelo), roda a verificação final (só quando houve worktree: em sequência a etapa 6 do
// último grupo já viu tudo junto), a etapa 7 (Teste na aplicação, uma vez no pai: os grupos pulam) e junta os implementacao.md dos grupos
// no do pai (sem IA): a entrada do QA, como no ticket simples.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const { ARQ, ETAPAS } = require('../../etapas');
const { estado, mudar } = require('../../estado');
const { dirGrupo, lerPlano } = require('../../etapas/00-subtarefas/arquivos');
const { integrar } = require('./integrar');
const { verificacaoFinal } = require('./verificacao-final');
const { rotulo } = require('../../etapas/05-implementacao/regras/nome-branch');

const ULTIMA = ETAPAS.at(-1).n; // o Resumo

const ler = (f) => {
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch {
    return '';
  }
};
const resumoPai = (dirPai, t, plano) =>
  [
    `# Implementação · ${t.chave}${t.titulo ? ` · ${t.titulo}` : ''}`,
    '',
    `Subtarefas em ${plano.grupos.length} grupo(s), execução ${plano.execucao}, branch ${rotulo(t)}. Cada grupo abaixo é o resumo da esteira dele.`,
    '',
    ...plano.grupos.flatMap((g) => [
      `## ${g.id} · ${g.titulo} (${g.subtarefas.join(', ')})`,
      '',
      ler(path.join(dirGrupo(dirPai, g.id), ARQ[ULTIMA])).replace(/^# .*\n?/, '') || '(sem resumo)',
      ''
    ])
  ].join('\n');

async function concluir(s, t, rodada) {
  const dirPai = s.pastaAba(t.id),
    plano = lerPlano(dirPai);
  if (!plano || estado(dirPai).fase !== 'grupos') return;
  mudar(dirPai, { fase: 'rodando' }); // outro grupo que termina junto não conclui de novo (fila.js só segue em 'grupos')
  if (!integrar(s, t)) return s.render();
  const e = estado(dirPai);
  if (plano.execucao === 'paralelo' && !e.verificadoFinal && !(await verificacaoFinal(s, t, rodada))) return s.render();
  if (!controle.valida(dirPai, rodada)) return s.render();
  if (!estado(dirPai).testado && !(await require('../../etapas/07-teste').testar(s, t, rodada))) return s.render(); // ciclo: 07-teste → grupos
  if (!controle.valida(dirPai, rodada)) return s.render();
  fs.writeFileSync(path.join(dirPai, ARQ[ULTIMA]), resumoPai(dirPai, t, plano) + '\n');
  mudar(dirPai, { etapa: ULTIMA, fase: 'concluido', pausa: null });
  aoVivo.anotar(dirPai, {
    tipo: 'fim',
    texto: `Esteira concluída: ${plano.grupos.length} grupo(s); implementacao.md é a entrada do QA`
  });
  s.render();
}

module.exports = { concluir, resumoPai };
