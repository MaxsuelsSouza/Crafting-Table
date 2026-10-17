// @ts-check
// Dependências da etapa 7 com o mundo de fora: o ambiente do ticket (infra/ambientes), o claude -p (maestro), a gravação de tela e o
// git do diff. Os testes trocam os campos de `deps` (o mesmo objeto).
const fs = require('fs');
const path = require('path');
const maestro = require('../../../../infra/agentes/maestro');
const ambientes = require('../../../../infra/ambientes');
const tickets = require('../../../../infra/ticket/tickets');
const { deps: base } = require('../../dependencias');
const { estado } = require('../../estado');

const deps = {
  /** Ambiente do ticket (estado → camada dos repositórios → craftingTable.ambientePadrao) e o ctx do subir. */
  ambiente(s, t, dir) {
    const cfg = base.cfg(),
      repos = s.reposDe?.(t) || [];
    const nome = ambientes.escolher({ ambiente: estado(dir).ambiente, repos, padrao: cfg.get('ambientePadrao') });
    const cmds = () => require('../../../../modulos/comandos').api;
    const ctx = {
      comandos: {
        lista: () => cmds()?.lista() || [],
        rodar: (n) => {
          const b = cmds()
            ?.lista()
            .find((x) => x.nome === n);
          if (b && !b.rodando) cmds().alternar({ id: b.id });
        }
      },
      avd: cfg.get('avdPadrao'),
      serial: cfg.get('aparelhoSerial') || '',
      webUrl: cfg.get('webUrl') || '',
      adb: require('../../../../infra/ambientes/android/adb').ADB,
      backend: repos.find((r) => r.camada === 'backend')?.caminho
    };
    return { nome, a: ambientes.obter(nome), ctx };
  },
  /** claude -p (maestro.rodar) como promessa: true quando termina, false se não começou. */
  claude: (dir, opts) =>
    new Promise((ok) => {
      const foi = maestro.rodar(dir, {
        ...opts,
        aoMudar: () => {
          opts.aoMudar?.();
          if (!maestro.rodando(dir)) ok(true);
        }
      });
      if (!foi) ok(false);
    }),
  // Vídeo da sessão no Android (screenrecord pelo ambiente); no web o Playwright MCP grava sozinho (gravar/parar vazios).
  gravarTela: (a, destino, amb, chave) => a.evidencia.gravar(destino, { chave, serial: amb?.serial }),
  pararTela: (a) => a.evidencia.parar(),
  // O screenrecord baixa o vídeo depois do parar: espera o arquivo aparecer (até `ms`).
  esperarVideo: async (pasta, ms = 15000) => {
    for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 500)))
      if (fs.existsSync(pasta) && fs.readdirSync(pasta).some((n) => /\.(mp4|webm)$/i.test(n))) return;
  },
  /** Caminhos alterados e linhas (+/-) no working tree de cada repositório da branch de trabalho (sem commit: diff contra HEAD + novos). */
  diff(repos, branches) {
    const caminhos = [];
    let linhas = 0;
    for (const r of repos.filter((x) => branches?.[x.caminho])) {
      try {
        for (const l of base.git(r.caminho, ['diff', '--numstat', 'HEAD']).split('\n').filter(Boolean)) {
          const [mais, menos, f] = l.split('\t');
          linhas += (Number(mais) || 0) + (Number(menos) || 0);
          caminhos.push(f);
        }
        caminhos.push(
          ...base.git(r.caminho, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
        );
      } catch {
        /* repositório ilegível: segue sem */
      }
    }
    return { caminhos, linhas };
  },
  /** Plano local do QA (<ticket>/qa/qa-plano.md), se existir. */
  qaPlano: (chave) => {
    const f = path.join(tickets.pasta(chave, 'qa'), 'qa-plano.md');
    return fs.existsSync(f) ? f : null;
  }
};

module.exports = { deps };
