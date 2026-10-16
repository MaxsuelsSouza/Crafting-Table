// @ts-check
// Dependências da esteira com o mundo de fora (VS Code, git, terminal, provedor). Os testes trocam os campos de _teste.deps (o mesmo objeto).
// filhos: pasta -> processo da verificação em andamento (estado.js conta como rodando; o ⏸ mata).
const { execFileSync, spawn } = require('child_process');
const reproducao = require('./etapas/01-dossie/reproducao');

const git = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
const filhos = new Map(); // pasta -> processo da verificação em andamento
const deps = {
  cfg: () => require('../configuracao/configuracao').cfg(),
  comandos: () => require('../modulos/comandos').api?.lista() || [],
  git,
  executar: (cmd, cwd, dir) =>
    new Promise((ok) => {
      // roda um comando das Configurações > Comandos e devolve o código e o fim da saída
      const p = spawn(cmd, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000 });
      filhos.set(dir, p);
      let saida = '';
      const junta = (b) => {
        saida = (saida + b).slice(-6000);
      };
      p.stdout.on('data', junta);
      p.stderr.on('data', junta);
      p.on('error', (e) => {
        filhos.delete(dir);
        ok({ codigo: -1, saida: e.message });
      });
      p.on('close', (codigo) => {
        filhos.delete(dir);
        ok({ codigo: codigo ?? -1, saida: saida.trim() });
      });
    }),
  // Anexos do ticket, pai e irmãos que parecem evidência → <aba>/evidencias-ticket (jira.baixarAnexo com as credenciais da extensão).
  coletarEvidencias: (dir, anexos, s) =>
    reproducao.coletarEvidencias(dir, anexos, (a) =>
      require('../infra/provedores').provedorAtivo().baixarAnexo(s.secrets, a)
    ),
  salvarBranchPrincipal: async (caminho, nome) => {
    const c = require('../configuracao/configuracao'),
      cfg = c.cfg();
    const atual = cfg.get('repositorios') || [],
      base = atual.length ? atual : c.reposAuto(cfg.get('specsDir') || c.SPECS_PADRAO);
    await cfg.update(
      'repositorios',
      base.map((r) => (r.caminho === caminho ? { ...r, branchPrincipal: nome } : r)),
      require('vscode').ConfigurationTarget.Global
    );
  }
};

module.exports = { deps, git, filhos };
