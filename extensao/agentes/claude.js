// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Plugins e skills do Claude Code: marketplaces (qualquer um: URL, caminho ou repositório GitHub), o que está instalado,
// o catálogo dos marketplaces e a verificação por IA de um substituto para uma etapa. Tudo pelo CLI `claude plugin …`
// (nada fica preso a um marketplace). Usado só pela aba Plugins (configuracao.js) via agentes/index.js.

const claudeBin = () => [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'].find((p) => fs.existsSync(p)) || 'claude';
// Git sem pedir senha (marketplace privado sem credencial falha em vez de travar).
const ENV_GIT = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' };
const exec = (cmd, args, opts = {}) => new Promise((ok) => execFile(cmd, args, { timeout: 60000, maxBuffer: 64 * 1024 * 1024, env: ENV_GIT, ...opts },
  (e, out, err) => ok({ ok: !e, out: String(out || '').trim(), err: String(err || e?.message || '').trim() })));
const claude = (...a) => exec(claudeBin(), a);
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };

// ── Marketplaces
/** @returns {Promise<{ nome: string, origem: string }[]>} */
const marketplaces = async () => (json((await claude('plugin', 'marketplace', 'list', '--json')).out) || [])
  .map((m) => ({ nome: m.name, origem: m.repo || m.url || m.path || m.source || '' }));
const adicionarMarketplace = (origem) => claude('plugin', 'marketplace', 'add', origem);
const removerMarketplace = (nome) => claude('plugin', 'marketplace', 'remove', nome);
const atualizarMarketplaces = () => claude('plugin', 'marketplace', 'update');

// ── Plugins
/** @returns {Promise<{ id: string, versao: string, ligado: boolean, caminho: string }[]>} */
const instalados = async () => (json((await claude('plugin', 'list', '--json')).out) || [])
  .map((p) => ({ id: p.id, versao: p.version || '', ligado: p.enabled !== false, caminho: p.installPath }));
// Catálogo de todos os marketplaces adicionados (milhares de itens: a tela filtra no QuickPick).
const disponiveis = async () => json((await claude('plugin', 'list', '--available', '--json')).out)?.available || [];
const instalar = (id) => claude('plugin', 'install', id);
const atualizar = (id) => claude('plugin', 'update', id);
const alternar = (id, ligar) => claude('plugin', ligar ? 'enable' : 'disable', id);
// Plugins instalados com commit novo na origem (git ls-remote, sem baixar). { id: true }
async function novidades() {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {}), inst = reg.plugins || reg;
  const nova = {};
  await Promise.all((await disponiveis()).filter((a) => a.source?.url && inst[a.pluginId]).map(async (a) => {
    const sha = (Array.isArray(inst[a.pluginId]) ? inst[a.pluginId][0] : inst[a.pluginId])?.gitCommitSha;
    const r = await exec('git', ['ls-remote', a.source.url, a.source.ref || 'HEAD'], { timeout: 15000 });
    const novo = r.ok && r.out.split(/\s/)[0];
    if (sha && novo && novo !== sha) nova[a.pluginId] = true;
  }));
  return nova;
}

// ── Skills
// Pastas com SKILL.md até 3 níveis abaixo de dir (skills avulsas ficam em ~/.claude/skills/<nome> ou em subpastas sincronizadas).
function skillsEm(dir, nivel = 3) {
  if (!dir || nivel < 0 || !fs.existsSync(dir)) return [];
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return [dir];
  let itens = [];
  try { itens = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')); } catch {}
  return itens.flatMap((d) => skillsEm(path.join(dir, d.name), nivel - 1));
}
const skillsAvulsas = () => skillsEm(path.join(os.homedir(), '.claude', 'skills')).map((p) => ({ nome: path.basename(p), caminho: p }));
const skillsDoPlugin = (raiz) => skillsEm(path.join(raiz || '', 'skills'), 1).map((p) => path.basename(p));

// ── Opções para trocar o plugin/skill de uma etapa: instalados (cada skill do plugin), skills avulsas, plugins da extensão e o catálogo.
// Cada opção = Escolha (agentes/etapas.js) + origem ('instalado' | 'skill' | 'extensao' | 'marketplace') e, no catálogo, a fonte para baixar.
async function opcoes(locais = []) {
  const [inst, disp] = await Promise.all([instalados(), disponiveis()]);
  const ids = new Set(inst.map((p) => p.id));
  return [
    ...inst.flatMap((p) => {
      const nome = p.id.split('@')[0], sk = skillsDoPlugin(p.caminho);
      return (sk.length ? sk : [undefined]).map((skill) => ({ tipo: 'plugin', id: p.id, nome, skill, origem: 'instalado', descricao: `${p.id} · ${p.versao}${p.ligado ? '' : ' · desligado'}` }));
    }),
    ...skillsAvulsas().map((s) => ({ tipo: 'skill', id: s.nome, nome: s.nome, caminho: s.caminho, origem: 'skill', descricao: s.caminho.replace(os.homedir(), '~') })),
    ...locais.map((l) => ({ ...l, origem: 'extensao', descricao: 'plugin da extensão' })),
    ...disp.filter((a) => !ids.has(a.pluginId)).map((a) => ({ tipo: 'plugin', id: a.pluginId, nome: a.name, origem: 'marketplace', descricao: a.description || '', fonte: a.source, marketplace: a.marketplaceName }))
  ];
}

// Pasta com o conteúdo de um plugin do catálogo ainda não instalado (para a IA ler antes de instalar): caminho dentro do marketplace
// ou clone raso do repositório (só a subpasta, quando é git-subdir). Fica na pasta temporária do sistema.
async function baixar(op) {
  const f = op.fonte;
  if (typeof f === 'string') {
    const loc = json((await claude('plugin', 'marketplace', 'list', '--json')).out)?.find((m) => m.name === op.marketplace)?.installLocation;
    return loc ? path.join(loc, f) : null;
  }
  const url = f?.url || (f?.repo ? `https://github.com/${f.repo}.git` : '');
  if (!url) return null;
  const dest = path.join(os.tmpdir(), 'crafting-plugins', op.id.replace(/[^\w.-]/g, '_'));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const sub = f.source === 'git-subdir' && f.path;
  const r = await exec('git', ['clone', '--depth', '1', ...(f.ref ? ['--branch', f.ref] : []), ...(sub ? ['--filter=blob:none', '--sparse'] : []), url, dest], { timeout: 120000 });
  if (!r.ok) throw new Error(`não consegui baixar ${url}: ${r.err.split('\n').pop()}`);
  if (sub) { await exec('git', ['-C', dest, 'sparse-checkout', 'set', sub], { timeout: 120000 }); return path.join(dest, sub); }
  return dest;
}

// Verificação por IA: o substituto atende ao que a etapa espera? Compara com o que a extensão usa hoje (atual) e com o contrato.
// Só leitura (Read, Glob, Grep). Devolve { veredito: 'atende' | 'parcial' | 'nao_atende', resumo, falta[], observacoes }.
async function verificar({ etapas, contrato, atual, candidato, modelo }) {
  const prompt = `[segundo plano · Crafting Table] Avalie se um plugin/skill do Claude Code pode substituir o que a extensão usa hoje nestas etapas: ${etapas.join('; ')}.\n\n`
    + `O que a extensão espera (contrato):\n${contrato}\n\n`
    + `Usado hoje: ${atual.rotulo}${atual.pasta ? ` (pasta ${atual.pasta}: leia para comparar)` : ' (não está nesta máquina; compare só com o contrato)'}.\n`
    + `Candidato: ${candidato.rotulo} (pasta ${candidato.pasta}). Leia o plugin.json/SKILL.md, os bins, os hooks e as referências dele.\n\n`
    + 'Só leia; não rode nada. Compare item a item com o contrato e com o que é usado hoje (arquivos produzidos, comandos e bins, formatos, hooks, modo não interativo). '
    + 'Responda SOMENTE com um JSON, sem texto antes ou depois: {"veredito":"atende|parcial|nao_atende","resumo":"1 a 2 frases","falta":["o que falta para atender, um item por linha"],"observacoes":"riscos ou diferenças que não impedem"}';
  const dirs = [atual.pasta, candidato.pasta].filter((d) => d && fs.existsSync(d));
  const r = await exec(claudeBin(), ['-p', prompt, '--output-format', 'json', '--allowedTools', 'Read', 'Glob', 'Grep', ...dirs.flatMap((d) => ['--add-dir', d]),
    '--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), ...(modelo ? ['--model', modelo] : [])], { timeout: 15 * 60000, cwd: candidato.pasta });
  const texto = json(r.out)?.result || '';
  const achado = json((texto.match(/\{[\s\S]*\}/) || [''])[0]);
  if (!achado?.veredito) throw new Error(r.ok ? `resposta da IA fora do formato: ${texto.slice(0, 200)}` : r.err.split('\n').pop() || 'claude falhou');
  return { veredito: achado.veredito, resumo: String(achado.resumo || ''), falta: [].concat(achado.falta || []).map(String), observacoes: String(achado.observacoes || '') };
}

module.exports = { marketplaces, adicionarMarketplace, removerMarketplace, atualizarMarketplaces, instalados, disponiveis, instalar, atualizar, alternar, novidades,
  skillsAvulsas, skillsDoPlugin, opcoes, baixar, verificar, claudeBin };
