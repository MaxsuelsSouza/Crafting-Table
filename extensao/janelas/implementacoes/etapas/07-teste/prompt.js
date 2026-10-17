// @ts-check
// Prompts dos claude -p da etapa 7 (Teste na aplicação): 7.1 monta o plano de CTs (METODO_ENTREGA de infra/testes, com criticidade e tipo)
// e 7.3 executa CT a CT na aplicação rodando, registrando pelo reproducao-fluxo (FLUXO_DIR = <aba>/teste) com print e vídeo de cada CT.
// Sem publicar no Jira: a Implementação cria os cenários, testa e valida sozinha.
const path = require('path');
const fluxo = require('../../../../componentes/fluxo-passos');
const { METODO_ENTREGA } = require('../../../../infra/testes');
const prompts = require('../../prompts');
const { PLANO, dirTeste } = require('./arquivos');
const { FLUXO } = require('./regras/ferramentas');

const cab = (c, titulo) =>
  `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] ${titulo}. Ticket ${c.t.link || c.t.chave}${c.t.titulo ? ` · ${c.t.titulo}` : ''}.\n` +
  `Pasta de trabalho: ${c.dir}\nRepositórios: ${c.repos.map((r) => `${r.camada}: ${r.caminho}`).join(' · ') || 'nenhum configurado'}\n`;

/** 7.1 · c: { dir, t, repos, fontes: string[] (plano de mudança, log da implementação), qa: string|null, exigeRegressao, ajuste: string } */
const promptPlano = (c) =>
  cab(c, 'ETAPA 7.1 · PLANO DE CASOS DE TESTE DO TESTE NA APLICAÇÃO') +
  `Leia ${path.join(c.dir, 'dossie.md')}, ${path.join(c.dir, '.contexto-ticket.md')} (se existir), o que mudou: ${c.fontes.join(', ') || '(sem artefatos)'} e o diff dos repositórios (git diff HEAD).\n` +
  (c.qa
    ? `BASE: já existe um plano do QA em ${c.qa}. Transcreva-o fielmente (mesmos CTs e numeração) e acrescente o que falta pelo método abaixo (Criticidade e Tipo em cada CT, a tabela CA × CT, o CT de regressão).\n`
    : '') +
  `${METODO_ENTREGA}\n` +
  (c.exigeRegressao
    ? 'O diff é GRANDE (mais de 15 arquivos ou 400 linhas): pelo menos 1 CT com "Tipo: regressao" é obrigatório.\n'
    : '') +
  'Os CTs serão executados por uma IA na aplicação rodando (navegador ou app), sem ninguém: passos concretos e executáveis, com a massa de dados que cada um precisa. NÃO publique nada na ferramenta de tickets.\n' +
  `Grave com ${prompts.GRAVAR} ${PLANO} <<'FIM' … FIM.` +
  (c.ajuste ? `\n\nAJUSTE pedido pelo usuário para este plano: ${c.ajuste}` : '') +
  prompts.REGRAS(c.dir, false);

/** 7.3 · c: { dir, t, repos, a (ambiente), amb (pronto do subir) } */
function promptExecutar(c) {
  const dt = dirTeste(c.dir),
    web = c.a.plataforma === 'web',
    retomada = fluxo.ler(dt).passos.some((p) => p.execucoes.length);
  const print = (id) => (web ? path.join(dt, 'capturas', `${id}-1.png`) : `/tmp/${id}-1.png`);
  return (
    cab(c, 'ETAPA 7.3 · TESTE NA APLICAÇÃO: execute os casos de teste') +
    `Ambiente: ${c.a.rotulo} · ${c.a.texto(c.amb)}. JÁ ESTÁ DE PÉ: não suba, não derrube e não reinicie nada. ${c.a.guia()}.\n` +
    `Plano: ${path.join(c.dir, PLANO)}. CTs registrados (a pasta vem em FLUXO_DIR):\n${fluxo.estadoParaPrompt(dt)}\n` +
    (retomada ? 'RETOMADA: execute só os CTs pendentes, na ordem.\n' : '') +
    `Para CADA CT pendente, na ordem: 1) ${FLUXO} iniciar CTnn. ` +
    (web
      ? '2) browser_start_video; execute os passos do CT no navegador. '
      : '2) adb logcat -c; execute os passos do CT no app. ') +
    `3) PRINT do estado final: ${c.a.comoPrint(print('CTnn'), c.amb)} e ${FLUXO} evidencia CTnn <arquivo>. ` +
    (web
      ? `4) browser_stop_video e ${FLUXO} evidencia CTnn <o .webm salvo em ${path.join(dt, 'capturas')}>. `
      : '4) o VÍDEO da tela é gravado pela extensão durante toda a execução (não grave). ') +
    `5) ${FLUXO} sinais CTnn --console N --rede N "resumo": N = erros NOVOS que apareceram durante o CT (${web ? 'browser_console_messages e browser_network_requests: status 4xx/5xx e falhas' : 'adb logcat -d *:E e respostas de erro da API'}); 0 e 0 quando não houve. ` +
    `6) ${FLUXO} acao CTnn "<como repetir>" e ${FLUXO} concluir CTnn passou|falhou|bloqueado --nota "esperado × obtido". ` +
    '"passou" = o comportamento esperado aconteceu; "falhou" = não aconteceu (defeito); "bloqueado" = não deu para executar (massa, acesso, ambiente): diga o motivo. ' +
    'Todo CT exige PRINT E VÍDEO como prova: CT sem os dois não conta como passou com evidência. Não force resultado: registre o que viu.' +
    (web ? ' Ao terminar todos, browser_close (salva o vídeo da sessão).' : '') +
    prompts.REGRAS(c.dir, false)
  );
}

module.exports = { promptPlano, promptExecutar };
