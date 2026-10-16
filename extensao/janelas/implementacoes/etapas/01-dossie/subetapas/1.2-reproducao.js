// @ts-check
// 1.2 · Reprodução do bug (claude -p, só para Bug/Defeito/Incidente): sobe a aplicação, executa o passo a passo relatado e confirma o erro.
// Lógica dos cenários, evidências e prompt: ../reproducao/. Ao confirmar, a esteira segue para a etapa 2.
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const maestro = require('../../../../../infra/agentes/maestro');
const controle = require('../../../../../infra/controle');
const vagas = require('../../../../../infra/agentes/etapas');
const dossie = require('../../../../../infra/dossie');
const prompts = require('../../../prompts');
const reproducao = require('../reproducao');
const { deps } = require('../../../dependencias');
const { SEM_CONFIRMAR, TENTAR, mudar, pausar } = require('../../../estado');
const { lerPausa, limparPausa } = require('../../../orquestrador/pausa');
const { ambiente } = require('../../../orquestrador/ambiente');
const { rodarEtapa } = require('../../../orquestrador/rodar-etapa');
const { FERRAMENTAS_REPRO } = require('../regras/ferramentas');

// ── Reprodução do bug (antes da etapa 2, só para Bug/Defeito/Incidente) ──
// A etapa fica "1" no estado (o Dossiê só termina quando o erro é confirmado ou o usuário aceita seguir sem confirmar).
async function rodarReproducao(s, t, d, rodada) {
  const dir = s.pastaAba(t.id),
    env = ambiente(s, t),
    mapa = vagas.raiz('impl.mapa') || '';
  const j = s.cacheJira?.[t.id];
  limparPausa(dir);
  mudar(dir, { etapa: 1, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Reprodução do bug' });
  s.render();
  if (j?.anexos?.length) {
    const achados = await deps.coletarEvidencias(dir, j.anexos, s);
    if (!controle.valida(dir, rodada)) return s.render();
    aoVivo.anotar(dir, {
      tipo: 'fala',
      texto: achados.length
        ? `Evidências encontradas no ticket, no pai ou nos irmãos: ${achados.length}`
        : 'Nenhuma evidência (print, vídeo ou log) nos anexos do ticket, do pai e dos irmãos'
    });
  }
  let tratou = false;
  const ok = maestro.rodar(dir, {
    prompt:
      reproducao.prompt({
        dir,
        t,
        d,
        comandos: deps.comandos(),
        repos: env.repos,
        gravar: prompts.GRAVAR,
        retomada: fluxoExiste(dir)
      }) + vagas.aviso('impl.mapa'),
    titulo: 'Esteira · Reprodução do bug',
    ferramentas: FERRAMENTAS_REPRO(mapa),
    env: {
      MAPA_DB_CONEXAO: env.banco.conexao,
      MAPA_DB_AMBIENTE: env.banco.ambiente,
      MAPA_DB_SQLCL: env.banco.sqlcl,
      MAPA_DB_SENSIVEIS: env.banco.sensiveis.join(','),
      MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'),
      IMPLEMENTACAO_DIR: dir
    },
    extras: [
      ...(env.modelo ? ['--model', env.modelo] : []),
      ...vagas.pluginDirs('impl.mapa'),
      '--settings',
      JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir',
      dir,
      '--add-dir',
      s.pasta(t.id),
      ...env.repos.map((r) => r.caminho)
    ],
    aoMudar: () => {
      s.render();
      if (!tratou && !maestro.rodando(dir)) {
        tratou = true;
        aposReproducao(s, t, d, rodada);
      }
    }
  });
  if (!ok) mudar(dir, { fase: 'parado' });
  s.render();
}
const fluxoExiste = (dir) => require('../../../../../componentes/fluxo-passos').ler(dir).passos.length > 0;

// Terminou: confirma pelos cenários (erro = algum "falhou", com evidência). Senão pausa e pergunta; o usuário decide tentar de novo ou seguir.
async function aposReproducao(s, t, d, rodada) {
  const dir = s.pastaAba(t.id),
    fluxo = require('../../../../../componentes/fluxo-passos');
  if (!controle.valida(dir, rodada)) return s.render();
  fluxo.descartarEmAndamento(dir); // caiu no meio de um cenário: ele volta para a fila
  const p = lerPausa(dir),
    r = reproducao.resultado(dir);
  if (p?.pergunta) {
    limparPausa(dir);
    pausar(dir, 1, {
      motivo: String(p.motivo || ''),
      pergunta: String(p.pergunta),
      opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : []
    });
  } else if (!r.passos.length) {
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: 'A reprodução terminou sem registrar nenhum cenário' });
  } else if (!r.confirmou) {
    reproducao.gravarResumo(dir, t.chave);
    pausar(dir, 1, {
      motivo: 'repro-nao',
      pergunta: `O erro NÃO foi confirmado: nenhum dos ${r.passos.length} cenário(s) falhou (veja a aba Reprodução). Tentar de novo (com outro passo a passo) ou seguir assim mesmo?`,
      opcoes: [TENTAR, SEM_CONFIRMAR]
    });
  } else if (r.semEvidencia.length) {
    reproducao.gravarResumo(dir, t.chave);
    pausar(dir, 1, {
      motivo: 'repro-evidencia',
      pergunta: `O erro foi confirmado, mas ${r.semEvidencia.map((x) => x.id).join(', ')} falhou sem evidência anexada (print, vídeo ou log). A evidência é obrigatória.`,
      opcoes: [TENTAR, SEM_CONFIRMAR]
    });
  } else {
    reproducao.gravarResumo(dir, t.chave);
    aoVivo.anotar(dir, {
      tipo: 'fim',
      texto: `Erro confirmado: ${r.falhou.map((x) => x.id).join(', ')} falhou com evidência (${dossie.REPRODUCAO})`
    });
    mudar(dir, {
      reproducao: 'ok',
      etapa: 2,
      fase: 'parado',
      pausa: null,
      modo: d.modo,
      tentativas: 0,
      correcao: false
    });
    return rodarEtapa(s, t, 2, rodada);
  }
  s.render();
}

module.exports = { rodarReproducao, aposReproducao, fluxoExiste };
