// @ts-check
// Uma execução do Claude em segundo plano (maestro.rodar): env, ferramentas, plugins, --add-dir e o prompt-base.
const fs = require('fs');
const path = require('path');
const { areaIA } = require('../../../infra/agentes/area-ia');
const { pasta } = require('../../../infra/ticket/pasta-ticket');
const { reposDe } = require('../../../infra/ticket/repos');
const maestro = require('../../../infra/agentes/maestro');
const controle = require('../../../infra/controle');
const { cfg, sddState } = require('../../../configuracao/configuracao');
const vagas = require('../../../infra/agentes/etapas');
const { dirSpec, ondeSalvar } = require('../locais');
const { s } = require('./servicos');
const { FERRAMENTAS, MAPA } = require('./ferramentas');
const { bancoEnv } = require('./ambiente');
const { ESCRITA, blocoDocumento, blocoBriefing, blocoTipo } = require('./blocos-prompt');

// ── Maestro: o Claude em segundo plano (maestro.js), uma execução por etapa. A extensão decide quando rodar:
// Dar início/▶, aprovação (execução nova: contexto limpo), respostas e ajuste (também execução nova, com a memória do passo em disco). Pausado não roda.
// leitura = true: sem o gravador (início, triagem, impacto). A rodada (controle.js) só deixa o `depois` de uma execução valer enquanto
// ninguém pausou: pausar cancela a rodada e mata o processo, e a etapa recomeça ao retomar.
const etapa = (t, texto, continuar = false, cwd = t.spec?.repo, titulo, depois, leitura = false) => {
  const repos = reposDe(t);
  const bd = {
    ...bancoEnv(t),
    REFINAMENTO_DIR: dirSpec(t) || '',
    REFINAMENTO_RAIZ: t.spec?.repo || '',
    REFINAMENTO_MEMORIA: areaIA(pasta(t.chave)),
    REFINAMENTO_TICKET: pasta(t.chave),
    REFINAMENTO_SDD: sddState() || '',
    REFINAMENTO_FOCO: vagas.raiz('refinamento.foco')
      ? path.join(vagas.raiz('refinamento.foco'), 'hooks', 'medir.js')
      : ''
  };
  fs.mkdirSync(areaIA(pasta(t.chave)), { recursive: true }); // memória do passo: ~/.claude é negada para escrita no claude -p
  if (maestro.rodando(pasta(t.chave))) return false;
  const rodada = controle.nova(pasta(t.chave));
  return maestro.rodar(pasta(t.chave), {
    cwd,
    continuar,
    titulo,
    ferramentas: FERRAMENTAS(!leitura),
    env: bd,
    aoMudar: () => {
      if (depois && !maestro.rodando(pasta(t.chave)) && controle.valida(pasta(t.chave), rodada)) depois();
      s.render();
      require('./depois-da-etapa').depoisDaEtapa(t);
    }, // fim da etapa → filas, que chamam etapa de novo (require na hora)
    // O foco substitui o i-have-adhd global nestas execuções (as regras não entram duas vezes).
    extras: [
      ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : []),
      ...(cfg().get('esforco') ? ['--effort', cfg().get('esforco')] : []),
      ...vagas.pluginDirs('refinamento.foco'),
      ...vagas.pluginDirs('refinamento.mapa'),
      '--settings',
      JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir',
      pasta(t.chave),
      areaIA(pasta(t.chave)),
      ...repos.map((r) => r.caminho)
    ],
    prompt:
      `[segundo plano] [Crafting Table · ticket ${t.chave}] ${texto}\nPasta do ticket: ${pasta(t.chave)} · sdd-state: ${sddState()}` +
      ondeSalvar(t) +
      (leitura ? '' : ESCRITA) +
      blocoDocumento(t) +
      blocoBriefing(t) +
      blocoTipo(t) +
      `\nRepositórios de código: ${repos.map((r) => `${r.camada}: ${r.caminho}${r.refRelease ? ` (ref de release: ${r.refRelease})` : ''}`).join(' · ') || 'nenhum configurado'}` +
      ` · plugin mapa: ${MAPA()} (bin/mapa-git, bin/mapa-conferir, bin/mapa-db)` +
      vagas.aviso('refinamento.sdd') +
      vagas.aviso('refinamento.mapa') +
      `\nBanco de dados: ${bd.MAPA_DB_CONEXAO && bd.MAPA_DB_AMBIENTE && bd.MAPA_DB_AMBIENTE !== 'producao' ? `configurado (${bd.MAPA_DB_AMBIENTE === 'qas' ? 'QAS' : 'cópia de produção'}): use mapa-db (só leitura)` : 'NÃO configurado: não consulte banco; liste as consultas como pendência'}`
  });
};

module.exports = { etapa };
