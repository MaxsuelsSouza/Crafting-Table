// @ts-check
// Subetapa 5.4 · Reproduzir: o Claude repete no emulador a ação do diagnóstico com a Massa de Teste, passo a passo pelo fluxo,
// com a tela gravada. Resultado em reproducao.json (gravarReproducao). Sem resultado do Claude: tentar de novo ou aceitar como não reproduzido.
const fs = require('fs');
const path = require('path');
const controle = require('../../../../../infra/controle');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { lerJson } = require('../../../estado');
const { GRAVAR, FLUXO, REGRAS, SKILL } = require('../regras/ferramentas');
const vagas = require('../../../../../infra/agentes/etapas');
const { SUBETAPAS, marcarSub, pausar } = require('./estado');

const EVID = 'evidencias',
  CLAUDE_JSON = '.reproducao-claude.json';
const TENTAR = 'Tentar de novo',
  ACEITAR = 'Aceitar como não reproduzido';

const promptReproduzir = (chave, dir) =>
  `[segundo plano · Crafting Table · Incidente ${chave}] Ambiente pronto (API 5111, Metro 8081, emulador e app). Leia ${path.join(dir, '4-diagnostico.md')} e ${path.join(dir, 'massa-teste.sql')}. ` +
  `Reproduza NO EMULADOR a ação exata do diagnóstico usando SÓ a Massa de Teste (jornada pelo Maestro/adb, skill testes-funcionais: ${SKILL()}/references/jornada-mobile-maestro.md). A tela já está sendo gravada em vídeo pela extensão. ` +
  `O FLUXO já está planejado e o andamento é registrado por ${FLUXO} (estado atual abaixo). Para cada passo, na ordem: ${FLUXO} iniciar Pnn; execute; registre a ação EXATA que repete o passo (comando maestro/adb) com ${FLUXO} acao Pnn "<comando>"; ` +
  `tire um print (adb exec-out screencap -p > /tmp/mergulho-Pnn.png) e guarde com ${FLUXO} evidencia Pnn /tmp/mergulho-Pnn.png; feche com ${FLUXO} concluir Pnn passou|falhou|bloqueado --nota "o que viu". ` +
  'RETOMADA: passos já "passou" são REFEITOS RÁPIDO só para levar o app ao ponto onde parou: rode a "ação" registrada de cada um em sequência, sem reanalisar, sem novo print e sem novo iniciar/concluir; confira apenas que a tela esperada apareceu e siga do primeiro passo pendente. ' +
  `Estado do fluxo:\n${fluxo.estadoParaPrompt(dir)}\n` +
  `Ao final salve também um print do resultado: ${GRAVAR} evidencias/NN-resultado.png --de /tmp/resultado.png. Grave ${path.join(dir, CLAUDE_JSON)} (com ${GRAVAR} ${CLAUDE_JSON}): {"ok": true se o erro do diagnóstico se repetiu (ou false), "acao": "o que foi feito e o que apareceu", "prints": [{"arquivo": "NN-resultado.png", "legenda": "..."}]}. ${REGRAS}${vagas.aviso('incidentes.reproducao')}`;

// reproducao.json: midias montadas de evidencias/ (png = print, mp4/webm/gif = vídeo) + o que o Claude registrou.
function gravarReproducao(dir, ok, acao) {
  const c = lerJson(path.join(dir, CLAUDE_JSON), null),
    leg = new Map((c?.prints || []).map((p) => [p.arquivo, p.legenda]));
  let arqs = [];
  try {
    arqs = fs.readdirSync(path.join(dir, EVID)).sort();
  } catch {}
  const midias = arqs.flatMap((a) =>
    /\.png$/i.test(a)
      ? [{ tipo: 'print', arquivo: `${EVID}/${a}`, legenda: leg.get(a) || a.replace(/\.png$/i, '') }]
      : /\.(mp4|webm|gif)$/i.test(a)
        ? [{ tipo: 'video', arquivo: `${EVID}/${a}`, legenda: 'Gravação da tela do emulador' }]
        : []
  );
  const j = { ok: !!(c ? c.ok : ok), acao: c?.acao || acao || '', quando: c ? new Date().toISOString() : null, midias };
  fs.writeFileSync(path.join(dir, 'reproducao.json'), JSON.stringify(j, null, 2));
  return j;
}

// "Aceitar como não reproduzido": o dev decide seguir sem resultado do Claude; fica registrado como tal, nunca como resultado dele.
const aceitarSemResultado = (dir) => {
  gravarReproducao(
    dir,
    false,
    'Aceito pelo dev sem resultado registrado: o Claude não registrou o resultado da reprodução.'
  );
  marcarSub(dir, 'reproducao', 'concluida');
};

// Devolve true se parou (pausa); false para seguir para o resumo (etapa 6).
async function rodar({ t, dir, d, vivo, ponto, comecar, concluirSub }) {
  const S4 = SUBETAPAS[3];
  ponto();
  comecar(S4);
  fluxo.descartarEmAndamento(dir); // passo cortado por pausa/queda volta para a fila
  fs.mkdirSync(path.join(dir, EVID), { recursive: true });
  fs.rmSync(path.join(dir, CLAUDE_JSON), { force: true });
  d.gravarTela(path.join(dir, EVID));
  const registrou = () => lerJson(path.join(dir, CLAUDE_JSON), null) !== null;
  let rodou = await d.claude({
    prompt: promptReproduzir(t.chave, dir),
    titulo: 'Incidente · Reproduzindo no emulador'
  });
  if (rodou && !registrou() && controle.valida(dir, d.rodada)) {
    // uma segunda tentativa: os passos feitos são refeitos rápido pela ação registrada
    vivo('aviso', 'O Claude terminou a reprodução sem registrar o resultado: tentando mais uma vez');
    rodou = await d.claude({
      prompt: promptReproduzir(t.chave, dir),
      titulo: 'Incidente · Reproduzindo no emulador (nova tentativa)'
    });
  }
  d.pararTela();
  ponto();
  if (!rodou)
    return pausar(dir, 'Já há um Claude em segundo plano nesta pasta', 'Aguarde ele terminar e tente de novo.');
  await d.esperar(async () => true, 0);
  if (!registrou())
    return pausar(
      dir,
      'O Claude não registrou o resultado da reprodução',
      'Não sei dizer se o problema foi reproduzido: veja o Ao vivo e os passos do fluxo. Tentar de novo ou aceitar como não reproduzido?',
      [TENTAR, ACEITAR]
    );
  const rep = gravarReproducao(dir, false, '');
  vivo(
    rep.ok ? 'fim' : 'aviso',
    rep.ok ? 'Problema reproduzido no emulador' : 'O problema não foi reproduzido (resultado registrado pelo Claude)'
  );
  concluirSub(S4);
  return false;
}

module.exports = { ACEITAR, promptReproduzir, gravarReproducao, aceitarSemResultado, rodar };
