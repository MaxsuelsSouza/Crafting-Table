// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');

// Etapas de cada módulo e o plugin ou skill que cada uma usa (só para agentes com plugins, hoje o Claude Code).
// Uma "vaga" (slot) é o lugar de um plugin/skill no fluxo; várias etapas podem dividir a mesma vaga. A pessoa troca o ocupante
// em Configurações > Plugins (craftingTable.pluginsEtapa = { vaga: Escolha }); sem troca vale o padrão. O código das etapas
// pergunta aqui o caminho (raiz, pastaSkill, pluginDirs) em vez de ter o caminho fixo, então a troca vale na próxima execução.
//   Escolha = { tipo: 'plugin' (instalado no agente) | 'skill' (pasta com SKILL.md) | 'local' (plugin da extensão, --plugin-dir),
//               id, nome, caminho? (skill/local), skill? (plugin: qual skill dele) }

const LOCAL = (n) => path.join(__dirname, '..', 'plugins', n);

// contrato: o que a extensão espera de quem ocupa a vaga (base da verificação por IA de um substituto).
const VAGAS = {
  ...require('../../janelas/refinamento/etapas').VAGAS, // vagas do Refinamento: janelas/refinamento/etapas/index.js
  ...require('../../janelas/qa/etapas').VAGAS, // vagas do QA: janelas/qa/etapas/index.js
  ...require('../../janelas/implementacoes/etapas').VAGAS, // vaga da Implementação: janelas/implementacoes/etapas/index.js
  ...require('../../janelas/incidentes/etapas').VAGAS // vagas do Incidente: janelas/incidentes/etapas/index.js
};

// subetapas: [{ nome, vaga }] — a etapa-mãe não tem vaga própria; cada subetapa tem a sua (Etapa 4 → 4.1, 4.2).
// Etapas na ordem de cada módulo (a tela numera: Etapa 1, Etapa 2…); vaga null = a etapa não usa plugin nem skill (só o prompt da extensão).
// todas: vale para todas as etapas do módulo (aparece no fim, sem número).
/** @type {{ id: string, nome: string, etapas: { nome: string, vaga?: string | null, obs?: string, subetapas?: { nome: string, vaga: string }[], todas?: boolean }[] }[]} */
const MODULOS = [
  { id: 'refinamento', nome: 'Refinamento', etapas: require('../../janelas/refinamento/etapas').ETAPAS.map(({ n, arquivo, ...e }) => e) }, // janelas/refinamento/etapas/index.js
  { id: 'impl', nome: 'Implementação', etapas: require('../../janelas/implementacoes/etapas').ETAPAS.map(({ n, arq, ...e }) => e) }, // janelas/implementacoes/etapas/index.js
  { id: 'qa', nome: 'QA', etapas: require('../../janelas/qa/etapas').ETAPAS.map(({ n, arquivo, ...e }) => e) }, // janelas/qa/etapas/index.js
  { id: 'incidentes', nome: 'Incidentes', etapas: require('../../janelas/incidentes/etapas').ETAPAS.map(({ nome, vaga }) => ({ nome, vaga })) }
];
// Marca de cada etapa na ordem do módulo: "Etapa N" (ou "Todas as etapas") + nome; subs = [{ marca: "N.1", nome, vaga }]. titulos = o texto corrido ("Etapa N. Nome").
const marcas = (m) => { let n = 0; return m.etapas.map((e) => { const marca = e.todas ? 'Todas as etapas' : `Etapa ${++n}`;
  return { marca, nome: e.nome, subs: (e.subetapas || []).map((x, i) => ({ marca: `${n}.${i + 1}`, nome: x.nome, vaga: x.vaga })) }; }); };
const titulos = (m) => marcas(m).map((x) => (x.marca.startsWith('Etapa') ? `${x.marca}. ${x.nome}` : `${x.marca} · ${x.nome}`));

const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const config = () => { try { return require('vscode').workspace.getConfiguration('craftingTable'); } catch { return null; } }; // sem vscode (testes): só o padrão
const trocas = () => config()?.get?.('pluginsEtapa') || {};

/** @returns {{ tipo: string, id: string, nome: string, caminho?: string, skill?: string }} */
const escolha = (vaga) => trocas()[vaga] || VAGAS[vaga].padrao;
const ehPadrao = (vaga) => !trocas()[vaga];
// Caminho de instalação de um plugin do Claude Code (installed_plugins.json), null se não instalado.
function instalado(id) {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {});
  const v = (reg.plugins || reg)[id];
  return (Array.isArray(v) ? v[0] : v)?.installPath || null;
}
// Raiz do ocupante: pasta do plugin (bins, hooks) ou da skill. null = não está na máquina.
const raiz = (vaga) => { const e = escolha(vaga); return e.tipo === 'plugin' ? instalado(e.id) : e.caminho || null; };
// Pasta da skill (onde está o SKILL.md): plugin com skill → <raiz>/skills/<skill>; skill avulsa → a própria pasta.
const pastaSkill = (vaga) => { const e = escolha(vaga), r = raiz(vaga); return r && e.tipo !== 'skill' && e.skill ? path.join(r, 'skills', e.skill) : r; };
// --plugin-dir para o claude: só o que mora fora do registro do agente (plugins da extensão). Instalados já carregam sozinhos.
const pluginDirs = (vaga) => { const e = escolha(vaga); return e.tipo === 'local' && e.caminho ? ['--plugin-dir', e.caminho] : []; };
// Nome curto para o prompt ("plugin:skill" ou "skill").
const rotulo = (vaga) => { const e = escolha(vaga); return e.skill && e.tipo !== 'skill' ? `${e.nome}:${e.skill}` : e.nome; };
// Frase para o prompt quando a vaga foi trocada: o texto da etapa cita o padrão; o Claude usa o substituto no lugar.
const aviso = (vaga) => (ehPadrao(vaga) ? '' : `\nNo lugar de ${VAGAS[vaga].padrao.nome}, use ${rotulo(vaga)} (${pastaSkill(vaga) || 'não instalado'}): onde o texto citar ${VAGAS[vaga].padrao.nome}, siga ${rotulo(vaga)}.`);
// Onde a vaga aparece (para o card dizer que trocar vale para todas as etapas dela): "Módulo · Etapa N. Nome" ou "Módulo · Etapa N.K Subetapa".
const usos = (vaga) => MODULOS.flatMap((m) => { const t = titulos(m), ms = marcas(m);
  return m.etapas.flatMap((e, i) => [...(e.vaga === vaga ? [`${m.nome} · ${t[i]}`] : []), ...ms[i].subs.filter((x) => x.vaga === vaga).map((x) => `${m.nome} · Etapa ${x.marca} ${x.nome}`)]); });

module.exports = { VAGAS, MODULOS, marcas, titulos, escolha, ehPadrao, raiz, pastaSkill, pluginDirs, rotulo, aviso, usos, instalado };
