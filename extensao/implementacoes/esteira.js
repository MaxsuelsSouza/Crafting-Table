// @ts-check
// Esteira de Implementação: roda por baixo dos panos (cada etapa com IA é um `claude -p` via maestro.rodar) e só para para perguntar.
//   1 Dossiê (extensão) → 2 Entendimento → 3 Varredura → 4 Plano de mudança (portão) → 5 Implementação → 6 Verificação (extensão) → 7 Resumo
// Estado em <aba>/.esteira.json. Pausa: o Claude grava .pausa.json ({ motivo, pergunta, opcoes }); a extensão mostra na aba e retoma com a
// resposta (.respostas.md). Portões (aprovação humana): Entendimento só com prontidão abaixo de "alta"; Plano de mudança sempre, porque a
// etapa 5 é a primeira do produto que escreve código. Sem commit nem push: a esteira trabalha na branch impl/<CHAVE>-<slug> de cada repositório.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const aoVivo = require('../componentes/ao-vivo');
const caixaEtapas = require('../componentes/caixa-etapas');
const maestro = require('../painel/maestro');
const controle = require('../incidentes/controle');
const vagas = require('../agentes/etapas');
const { markdown } = require('../componentes/markdown');
const { esc } = require('../infra/texto');
const dossie = require('./dossie');
const prompts = require('./prompts');

const ESTADO = '.esteira.json', { PAUSA, RESPOSTAS, CONTEXTO, GRAVAR, ARQ } = prompts;
const ETAPAS = [
  { n: 1, nome: 'Dossiê', arq: dossie.JSON_, vaga: null },
  { n: 2, nome: 'Entendimento', arq: ARQ[2], vaga: null },
  { n: 3, nome: 'Varredura do código', arq: ARQ[3], vaga: 'impl.mapa' },
  { n: 4, nome: 'Plano de mudança', arq: ARQ[4], vaga: 'impl.mapa' },
  { n: 5, nome: 'Implementação', arq: ARQ[5], vaga: null },
  { n: 6, nome: 'Verificação', arq: ARQ[6], vaga: null },
  { n: 7, nome: 'Resumo', arq: ARQ[7], vaga: null }
];
const TENTAR = 'Tentar de novo', SEGUIR = 'Continuar assim mesmo', CORRIGIR = 'Tentar corrigir mais uma vez', RESUMIR = 'Seguir para o resumo assim mesmo', REPETIR = 'Rodar a implementação de novo', VERIFICAR = 'Seguir para a verificação';
const MAX_CORRECOES = 2;
const lerJson = (arq, vazio) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return vazio; } };
const ehDocumento = (t) => require('../provedores/documento').ehDocumento(t);

// Dependências com o mundo de fora (VS Code, git, terminal). Os testes trocam por _teste.deps.
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const filhos = new Map(); // pasta -> processo da verificação em andamento
const deps = {
  cfg: () => require('../configuracao/configuracao').cfg(),
  comandos: () => require('../modulos/comandos').api?.lista() || [],
  git,
  executar: (cmd, cwd, dir) => new Promise((ok) => { // roda um comando das Configurações > Comandos e devolve o código e o fim da saída
    const p = spawn(cmd, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000 });
    filhos.set(dir, p);
    let saida = '';
    const junta = (b) => { saida = (saida + b).slice(-6000); };
    p.stdout.on('data', junta); p.stderr.on('data', junta);
    p.on('error', (e) => { filhos.delete(dir); ok({ codigo: -1, saida: e.message }); });
    p.on('close', (codigo) => { filhos.delete(dir); ok({ codigo: codigo ?? -1, saida: saida.trim() }); });
  }),
  salvarBranchPrincipal: async (caminho, nome) => {
    const c = require('../configuracao/configuracao'), cfg = c.cfg();
    const atual = cfg.get('repositorios') || [], base = atual.length ? atual : c.reposAuto(cfg.get('specsDir') || c.SPECS_PADRAO);
    await cfg.update('repositorios', base.map((r) => (r.caminho === caminho ? { ...r, branchPrincipal: nome } : r)), require('vscode').ConfigurationTarget.Global);
  }
};

// ── Estado ──
const estado = (dir) => ({ etapa: 1, fase: 'parado', pausa: null, aprovacao: null, tentativas: 0, correcao: false, branches: {}, ...lerJson(path.join(dir, ESTADO), {}) });
const mudar = (dir, patch) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ESTADO), JSON.stringify({ ...estado(dir), ...patch, ...(patch.fase === 'rodando' ? { host: process.pid } : {}), atualizado: new Date().toISOString() }, null, 2));
};
const vivoPid = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// "rodando" no arquivo só vale com o Claude vivo ou a janela dona viva; senão a execução foi interrompida e conta como parada.
const situacao = (dir) => {
  const e = estado(dir), rodando = maestro.rodando(dir) || filhos.has(dir) || (e.fase === 'rodando' && vivoPid(e.host));
  return { e, rodando, fase: e.fase === 'rodando' && !rodando ? 'parado' : e.fase };
};
const controlesDe = (sit) => ({ pausar: 'esteiraPausar', dicaPausar: 'Pausar a esteira: o Claude para e a etapa recomeça ao retomar',
  retomar: ['parado', 'erro'].includes(sit.fase) || (sit.fase === 'pausado' && sit.e.pausa?.motivo === 'manual') ? 'esteiraRetomar' : null,
  dicaRetomar: 'Retomar a esteira da etapa em que parou' });
const existe = (dir, n) => fs.existsSync(path.join(dir, ETAPAS[n - 1].arq));
const pausar = (dir, etapa, pausa, aviso) => {
  mudar(dir, { etapa, fase: 'pausado', pausa: { opcoes: [], ...pausa } });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: aviso || `Esteira pausada na etapa ${etapa}: aguardando sua resposta` });
};

// ── Ambiente: repositórios, banco, comandos ──
const ambiente = (s, t) => {
  const c = deps.cfg(), repos = s.reposDe(t);
  return { repos, banco: { conexao: c.get('bancoConexao') || '', ambiente: c.get('bancoAmbiente') || '', sqlcl: c.get('bancoSqlcl') || '', sensiveis: c.get('bancoColunasSensiveis') || [] }, modelo: c.get('modelo') || '' };
};
const textoBanco = (b) => (b.conexao && b.ambiente && b.ambiente !== 'producao' ? `configurado (${b.ambiente === 'qas' ? 'QAS' : 'cópia de produção'}): mapa-db, só leitura` : 'NÃO configurado: não consulte banco; registre como pendência');
// Papéis dos comandos das Configurações > Comandos usados na verificação (build e teste), pelo nome do botão ou pelo comando.
const PAPEIS = { build: { nomeRe: /\bbuild\b|compil/i, cmdRe: /\b(build|assemble|compile|tsc)\b/i }, teste: { nomeRe: /\btest(e|es|s)?\b/i, cmdRe: /\b(test|jest|vitest|pytest|mocha)\b/i } };
const comandosDe = (papel) => deps.comandos().filter((b) => PAPEIS[papel].nomeRe.test(b.nome) || PAPEIS[papel].cmdRe.test(b.comando || ''));
const verificacaoComandos = () => [...comandosDe('build').map((b) => ({ ...b, papel: 'build' })), ...comandosDe('teste').filter((b) => !comandosDe('build').some((x) => x.id === b.id)).map((b) => ({ ...b, papel: 'teste' }))];

// ── Branch de trabalho (etapa 5) ──
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
const ramo = (t) => { const s = slug(t.titulo || t.documento?.nome); return `impl/${t.chave}${s ? `-${s}` : ''}`; };
// Camadas do plano ("Repositórios afetados: backend, mobile"); sem a linha, todos os repositórios.
const afetados = (dir, repos) => {
  let txt = ''; try { txt = fs.readFileSync(path.join(dir, ARQ[4]), 'utf8'); } catch { /* sem plano */ }
  const linha = txt.match(/^\W*Reposit[óo]rios afetados:\s*(.+)$/im)?.[1];
  const alvo = linha ? linha.toLowerCase().split(/[,;]| e /).map((x) => x.trim()).filter(Boolean) : [];
  const sel = alvo.length ? repos.filter((r) => alvo.some((a) => a === r.camada || a === path.basename(r.caminho).toLowerCase())) : repos;
  return sel.length ? sel : repos;
};
/** Cria/seleciona a branch de trabalho a partir de origin/<principal>. true = pronto; false = pausou (já gravou a pausa). */
async function prepararBranches(s, t, dir) {
  const { repos } = ambiente(s, t), alvo = afetados(dir, repos), nome = ramo(t), feitos = {};
  if (!alvo.length) { pausar(dir, 5, { motivo: 'repos', pergunta: 'Nenhum repositório de código configurado. Adicione em Configurações > Geral > Repositórios de código e continue.', opcoes: [TENTAR] }); return false; }
  for (const r of alvo) {
    const base = path.basename(r.caminho);
    if (!r.branchPrincipal) {
      pausar(dir, 5, { motivo: 'branchPrincipal', repo: r.caminho, pergunta: `Qual é a branch principal de ${base} (${r.camada})? A branch de trabalho ${nome} parte dela. Também dá para definir em Configurações > Geral > Repositórios de código.`, opcoes: [] });
      return false;
    }
    try {
      const atual = deps.git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (atual !== nome) {
        if (deps.git(r.caminho, ['status', '--porcelain'])) {
          pausar(dir, 5, { motivo: 'sujo', pergunta: `${base} tem alterações não commitadas em ${atual}. Guarde ou commite e continue: a esteira não mexe em trabalho seu.`, opcoes: [TENTAR] });
          return false;
        }
        if (!estado(dir).syncOk) {
          try { deps.git(r.caminho, ['fetch', 'origin', r.branchPrincipal]); } catch (x) {
            pausar(dir, 5, { motivo: 'sync', pergunta: `${base}: não consegui buscar origin/${r.branchPrincipal}: ${String(x.stderr || x.message).trim().split('\n')[0]}`, opcoes: [TENTAR, SEGUIR] });
            return false;
          }
        }
        if (atual !== r.branchPrincipal) deps.git(r.caminho, ['checkout', r.branchPrincipal]);
        if (!estado(dir).syncOk) {
          try { deps.git(r.caminho, ['pull', '--ff-only', 'origin', r.branchPrincipal]); } catch (x) {
            pausar(dir, 5, { motivo: 'sync', pergunta: `${base}: não consegui atualizar ${r.branchPrincipal} com a origem: ${String(x.stderr || x.message).trim().split('\n')[0]}`, opcoes: [TENTAR, SEGUIR] });
            return false;
          }
        }
        let jaExiste = true; try { deps.git(r.caminho, ['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`]); } catch { jaExiste = false; }
        deps.git(r.caminho, jaExiste ? ['checkout', nome] : ['checkout', '-b', nome]);
        aoVivo.anotar(dir, { tipo: 'acao', texto: `${base}: branch ${nome} (a partir de ${r.branchPrincipal})` });
      }
      feitos[r.caminho] = nome;
    } catch (x) {
      pausar(dir, 5, { motivo: 'git', pergunta: `${base}: erro de git: ${String(x.stderr || x.message).trim().split('\n')[0]}`, opcoes: [TENTAR] });
      return false;
    }
  }
  mudar(dir, { branches: feitos });
  return true;
}

// ── Etapa 1: dossiê (sem IA) ──
async function prepararDossie(s, t) {
  const dir = s.pastaAba(t.id), contexto = require('../infra/contexto');
  s.cacheJira = s.cacheJira || {};
  let j = s.cacheJira[t.id];
  if (ehDocumento(t)) {
    await contexto.prepararDocumento(t);
    j = s.cacheJira[t.id] = require('../provedores/documento').buscarSync({ key: t.chave });
  } else if (!j && s.atualizarJira) { await s.atualizarJira(t.id); j = s.cacheJira[t.id]; }
  if (j && !j.erro) contexto.gravarContexto(dir, CONTEXTO, j, t); // no Jira o refinamento não grava a descrição em arquivo: a esteira grava
  const env = ambiente(s, t), d = dossie.montar(t, { j: j && !j.erro ? j : undefined, banco: env.banco, repos: env.repos });
  dossie.gravar(dir, d);
  return d;
}
const briefingExiste = (dir) => { try { return fs.statSync(path.join(dir, dossie.BRIEFING)).size > 0; } catch { return false; } };

async function passoDossie(s, t, rodada) {
  const dir = s.pastaAba(t.id);
  mudar(dir, { etapa: 1, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Etapa 1: Dossiê' });
  s.render();
  const d = await prepararDossie(s, t);
  if (!controle.valida(dir, rodada)) return s.render();
  aoVivo.anotar(dir, { tipo: 'fala', texto: `Dossiê pronto: modo ${dossie.ROTULO_MODO[d.modo]}, prontidão ${d.prontidao}.`, detalhe: d.lacunas.join('\n') });
  if (d.modo === 'perguntar' && !briefingExiste(dir)) {
    pausar(dir, 1, { motivo: 'briefing', pergunta: 'O ticket não tem descrição, documento nem diagnóstico: só o título. Explique o que precisa ser feito (o que o usuário vê, o que deve mudar, como saber que ficou certo). O que você escrever vira a fonte "verbal" do dossiê.', opcoes: [] });
    return s.render();
  }
  mudar(dir, { etapa: 2, fase: 'parado', modo: d.modo, tentativas: 0, correcao: false });
  return rodarEtapa(s, t, 2, rodada);
}

// ── Etapas com IA (2, 3, 4, 5, 7) ──
const LEITURA = (mapa) => ['Read', 'Glob', 'Grep', `Bash(${GRAVAR}:*)`, `Bash(${mapa}/bin/mapa-db:*)`, `Bash(${mapa}/bin/mapa-git:*)`, `Bash(${mapa}/bin/mapa-conferir:*)`,
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)'];
const FERRAMENTAS = (n, mapa) => (n === 5 ? [...LEITURA(mapa), 'Edit', 'Write'] : LEITURA(mapa));

// O que a esteira alterou em cada repositório (sem commit: está no working tree da branch de trabalho): status curto + diff --stat contra HEAD.
const resumoGit = (repos, branches) => repos.filter((r) => branches[r.caminho]).map((r) => {
  try { return `${path.basename(r.caminho)} (${branches[r.caminho]}):\n${[deps.git(r.caminho, ['status', '--short']), deps.git(r.caminho, ['diff', '--stat', 'HEAD'])].filter(Boolean).join('\n') || '(sem diferenças)'}`; }
  catch (x) { return `${path.basename(r.caminho)}: ${String(x.message).split('\n')[0]}`; }
}).join('\n');
const houveMudanca = (repos, branches) => Object.keys(branches).some((c) => {
  const r = repos.find((x) => x.caminho === c);
  try { return !!deps.git(c, ['status', '--porcelain']) || !!deps.git(c, ['rev-list', '--count', `${r?.branchPrincipal || 'HEAD'}..HEAD`]).replace(/^0$/, ''); } catch { return false; }
});

const rodarEtapa = async (s, t, n, rodada, ajuste = false) => {
  const dir = s.pastaAba(t.id);
  if (!controle.valida(dir, rodada)) return;
  if (!dossie.lerGravado(dir)) await prepararDossie(s, t);
  if (n === 5 && !(await prepararBranches(s, t, dir))) return s.render();
  const env = ambiente(s, t), mapa = vagas.raiz('impl.mapa') || '', e0 = estado(dir), d = dossie.lerGravado(dir);
  const arqEtapa = path.join(dir, ETAPAS[n - 1].arq), antes = ajuste && fs.existsSync(arqEtapa) ? fs.statSync(arqEtapa).mtimeMs : 0;
  if (!ajuste && n !== 5) fs.rmSync(arqEtapa, { force: true });
  if (n === 5) fs.rmSync(arqEtapa, { force: true }); // o log de cada tentativa é novo
  fs.rmSync(path.join(dir, PAUSA), { force: true });
  mudar(dir, { etapa: n, fase: 'rodando', pausa: null, aprovacao: null });
  let falhas = '';
  if (n === 5 && e0.correcao) { const v = lerJson(path.join(dir, ARQ[6]), {}); falhas = (v.rodadas || []).filter((r) => r.codigo !== 0).map((r) => `- ${r.nome} (${r.comando}):\n${String(r.saida || '').slice(-1500)}`).join('\n'); }
  let tratou = false;
  const ok = maestro.rodar(dir, {
    prompt: prompts.prompt(n, { dir, t, d, repos: env.repos, banco: textoBanco(env.banco), branches: e0.branches, correcao: e0.correcao, falhas, ajuste,
      gitResumo: n === 7 ? resumoGit(env.repos, e0.branches) : '' }) + vagas.aviso('impl.mapa'),
    titulo: `Esteira · Etapa ${n}: ${ETAPAS[n - 1].nome}${ajuste ? ' (ajuste)' : e0.correcao && n === 5 ? ` (correção ${e0.tentativas})` : ''}`, ferramentas: FERRAMENTAS(n, mapa),
    env: { MAPA_DB_CONEXAO: env.banco.conexao, MAPA_DB_AMBIENTE: env.banco.ambiente, MAPA_DB_SQLCL: env.banco.sqlcl, MAPA_DB_SENSIVEIS: env.banco.sensiveis.join(','),
      MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'), IMPLEMENTACAO_DIR: dir },
    extras: [...(env.modelo ? ['--model', env.modelo] : []), ...vagas.pluginDirs('impl.mapa'), '--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir', dir, '--add-dir', s.pasta(t.id), ...env.repos.map((r) => r.caminho)],
    aoMudar: () => { s.render(); if (!tratou && !maestro.rodando(dir)) { tratou = true; aposEtapa(s, t, n, rodada, antes); } }
  });
  if (!ok) mudar(dir, { fase: 'parado' });
  s.render();
};

// Etapa terminou: pausa pedida pelo Claude, artefato gravado (avança) ou erro.
const aposEtapa = async (s, t, n, rodada, mtimeAntes = 0) => {
  const dir = s.pastaAba(t.id), p = lerJson(path.join(dir, PAUSA), null);
  if (!controle.valida(dir, rodada)) return s.render(); // pausado por você: o Claude morto não é erro
  if (p?.pergunta) {
    fs.rmSync(path.join(dir, PAUSA), { force: true });
    pausar(dir, n, { motivo: String(p.motivo || ''), pergunta: String(p.pergunta), opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [] });
  } else if (!existe(dir, n) || (mtimeAntes && fs.statSync(path.join(dir, ETAPAS[n - 1].arq)).mtimeMs <= mtimeAntes)) {
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: `A etapa ${n} terminou sem ${mtimeAntes ? 'atualizar' : 'gravar'} ${ETAPAS[n - 1].arq}` });
  } else if (n === 5 && !houveMudanca(ambiente(s, t).repos, estado(dir).branches)) {
    pausar(dir, 5, { motivo: 'sem-mudanca', pergunta: 'A implementação terminou, mas nenhum repositório tem alteração na branch de trabalho. O Claude pode ter decidido que nada precisava mudar (veja o log) ou não ter editado nada.', opcoes: [REPETIR, VERIFICAR] });
  } else await avancar(s, t, n, rodada);
  s.render();
};

// Etapa n pronta: portão de aprovação ou segue sozinha para a próxima.
const avancar = async (s, t, n, rodada) => {
  const dir = s.pastaAba(t.id), d = dossie.lerGravado(dir);
  const portao = n === 4 || (n === 2 && d?.exigeAprovacaoEntendimento);
  if (portao) {
    mudar(dir, { etapa: n, fase: 'aguardando', pausa: null, aprovacao: { etapa: n, lido: false } });
    aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq} criado. Aguardando sua aprovação` });
    return;
  }
  aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq}` });
  return proxima(s, t, n, rodada);
};
const proxima = async (s, t, n, rodada) => {
  const dir = s.pastaAba(t.id);
  if (n >= 7) { mudar(dir, { etapa: 7, fase: 'concluido', pausa: null }); aoVivo.anotar(dir, { tipo: 'fim', texto: 'Esteira concluída: implementacao.md é a entrada do QA' }); return; }
  mudar(dir, { etapa: n + 1, fase: 'parado', pausa: null });
  if (n + 1 === 6) return verificar(s, t, controle.valida(dir, rodada) ? rodada : controle.nova(dir));
  return rodarEtapa(s, t, n + 1, rodada);
};

// ── Etapa 6: verificação (a extensão roda os comandos de build e teste de Configurações > Comandos) ──
async function verificar(s, t, rodada) {
  const dir = s.pastaAba(t.id), cmds = verificacaoComandos(), e = estado(dir);
  mudar(dir, { etapa: 6, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Etapa 6: Verificação' });
  s.render();
  const rodadas = [];
  for (const c of cmds) {
    aoVivo.anotar(dir, { tipo: 'acao', texto: `${c.papel === 'build' ? 'Build' : 'Teste'}: ${c.nome} (${c.comando})` });
    const r = await deps.executar(c.comando, c.pasta, dir);
    if (!controle.valida(dir, rodada)) return s.render();
    rodadas.push({ nome: c.nome, papel: c.papel, comando: c.comando, pasta: c.pasta, codigo: r.codigo, saida: r.saida });
    s.render();
  }
  const ok = rodadas.every((r) => r.codigo === 0);
  const pendencias = cmds.length ? [] : ['Nenhum comando de build ou teste em Configurações > Comandos (botões com "build" ou "test" no nome ou no comando): nada foi verificado automaticamente.'];
  fs.writeFileSync(path.join(dir, ARQ[6]), JSON.stringify({ ok, em: new Date().toISOString(), tentativa: e.tentativas, rodadas, pendencias }, null, 2));
  if (ok) {
    aoVivo.anotar(dir, { tipo: 'fim', texto: cmds.length ? `Verificação passou (${rodadas.length} comando(s))` : 'Verificação sem comandos configurados: registrada como pendência' });
    mudar(dir, { tentativas: 0, correcao: false });
    return proxima(s, t, 6, rodada);
  }
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `Verificação falhou: ${rodadas.filter((r) => r.codigo !== 0).map((r) => r.nome).join(', ')}` });
  if (e.tentativas < MAX_CORRECOES) {
    mudar(dir, { etapa: 5, fase: 'parado', tentativas: e.tentativas + 1, correcao: true });
    return rodarEtapa(s, t, 5, rodada);
  }
  pausar(dir, 6, { motivo: 'verificacao', pergunta: `A verificação falhou depois de ${MAX_CORRECOES} correções (veja ${ARQ[6]}).`, opcoes: [CORRIGIR, RESUMIR] });
  return s.render();
}

// ── Controle: iniciar, pausar, retomar, responder ──
const seguir = async (s, t) => {
  const dir = s.pastaAba(t.id), e = estado(dir);
  if (maestro.rodando(dir) || filhos.has(dir) || e.fase === 'aguardando') return; // aguardando: a saída é Aprovar ou Pedir ajuste no card
  if (e.fase === 'concluido') return;
  if (e.fase === 'rodando' && !situacao(dir).rodando && e.etapa >= 2 && e.etapa !== 5 && e.etapa !== 6 && existe(dir, e.etapa)) return avancar(s, t, e.etapa, controle.nova(dir)); // interrompida depois de gravar
  const rodada = controle.nova(dir);
  try {
    if (e.etapa <= 1) return await passoDossie(s, t, rodada);
    if (e.etapa === 6) return await verificar(s, t, rodada);
    return await rodarEtapa(s, t, e.etapa, rodada);
  } catch (x) {
    if (!controle.valida(dir, rodada)) return s.render();
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: `Esteira falhou na etapa ${estado(dir).etapa}: ${x.message}` });
    s.render();
  }
};
const pausarManual = (s, t) => {
  const dir = s.pastaAba(t.id);
  controle.cancelar(dir);
  maestro.parar(dir);
  try { filhos.get(dir)?.kill('SIGTERM'); } catch { /* já terminou */ }
  pausar(dir, estado(dir).etapa, { motivo: 'manual', pergunta: 'Esteira pausada por você. A etapa em andamento recomeça ao retomar.' }, 'Esteira pausada por você');
  s.render();
};
const retomar = (s, t) => { mudar(s.pastaAba(t.id), { pausa: null }); return seguir(s, t); };

// Resposta do usuário à pausa. As pausas da extensão (branch, sync, git, verificação…) se resolvem aqui; as do Claude vão para .respostas.md.
const responder = async (s, t, resposta) => {
  const dir = s.pastaAba(t.id), e = estado(dir), r = String(resposta || '').trim();
  if (!e.pausa || !r) return;
  const m = e.pausa.motivo;
  if (m === 'briefing') {
    fs.appendFileSync(path.join(dir, dossie.BRIEFING), `${r}\n\n`);
    mudar(dir, { pausa: null, etapa: 1 });
    return seguir(s, t);
  }
  if (m === 'branchPrincipal') {
    await deps.salvarBranchPrincipal(e.pausa.repo, r);
    mudar(dir, { pausa: null });
    return seguir(s, t);
  }
  if (['sujo', 'git', 'repos'].includes(m)) { if (r !== TENTAR) return; mudar(dir, { pausa: null }); return seguir(s, t); }
  if (m === 'sync') {
    if (r === SEGUIR) mudar(dir, { pausa: null, syncOk: true }); else if (r === TENTAR) mudar(dir, { pausa: null }); else return;
    return seguir(s, t);
  }
  if (m === 'sem-mudanca') {
    if (r === REPETIR) { mudar(dir, { pausa: null, etapa: 5, fase: 'parado' }); return seguir(s, t); }
    if (r === VERIFICAR) { mudar(dir, { pausa: null }); return proxima(s, t, 5, controle.nova(dir)); }
    return;
  }
  if (m === 'verificacao') {
    if (r === CORRIGIR) { mudar(dir, { pausa: null, etapa: 5, fase: 'parado', tentativas: 1, correcao: true }); return seguir(s, t); }
    if (r === RESUMIR) { mudar(dir, { pausa: null }); return proxima(s, t, 6, controle.nova(dir)); }
    return;
  }
  fs.appendFileSync(path.join(dir, RESPOSTAS), `## Etapa ${e.etapa} · ${e.pausa.pergunta}\n${r}\n\n`);
  mudar(dir, { pausa: null });
  return seguir(s, t);
};

// ── Tela ──
const CSS = `<style>${caixaEtapas.CSS}
  .es-obs { width: 100%; box-sizing: border-box; min-height: 90px; resize: vertical; padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: 12.5px/1.5 var(--fc-font); }
  .es-obs:focus { outline: none; border-color: var(--accent); }
  .es-barra { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .es-pausa { border-left: 3px solid var(--accent); padding-left: 10px; font-size: 12.5px; line-height: 1.55; }
  .es-pausa p { margin: 0 0 8px; }
  .es-resumo { font-size: 12px; line-height: 1.6; } .es-resumo b { color: var(--text); }
  .es-doc h3, .es-doc h4, .es-doc h5 { margin: 12px 0 4px; } .es-doc ul { margin: 4px 0; padding-left: 18px; } .es-doc li, .es-doc p { font-size: 12.5px; line-height: 1.55; }
  .es-doc pre { overflow: auto; }
</style>`;
const btn = (txt, acao, extra = '', cls = 'bt bt-contorno') => `<button class="${cls}" data-acao="${acao}"${extra}>${txt}</button>`;

const resumoDossie = (d) => (d ? `<div class="es-resumo">Modo: <b>${esc(dossie.ROTULO_MODO[d.modo])}</b> · Prontidão: <b>${esc(d.prontidao)}</b> · Banco: <b>${d.capacidades.banco === 'leitura' ? 'leitura' : 'indisponível'}</b>
  ${d.lacunas.length ? `<br>${d.lacunas.map((l) => `⚠ ${esc(l)}`).join('<br>')}` : ''}</div>` : '');

const corpo = (t, d0, dir) => {
  const sit = situacao(dir), e = sit.e, fase = sit.fase, dos = dossie.lerGravado(dir);
  const estadoAtual = ({ rodando: 'rodando', pausado: 'pausada', erro: 'erro', parado: 'pendente', aguardando: 'aguardando', concluido: 'concluida' })[fase] || 'pendente';
  const etapas = ETAPAS.map((x) => {
    const feita = fase === 'concluido' || (x.n < e.etapa && existe(dir, x.n));
    const atual = x.n === e.etapa && !feita;
    return { n: x.n, nome: x.nome, estado: feita ? 'concluida' : atual ? estadoAtual : 'pendente', ...(atual && fase === 'parado' ? { rotulo: 'pronta para iniciar' } : {}),
      ...(x.n === 5 && e.correcao && atual ? { rotulo: `correção ${e.tentativas} de ${MAX_CORRECOES}` } : {}) };
  });
  const nova = e.etapa === 1 && fase === 'parado';
  const pausa = e.pausa && fase === 'pausado' ? `<div class="caixa-t">Pausa da esteira</div><div class="folha"><div class="es-pausa"><p>${esc(e.pausa.pergunta)}</p>
    ${e.pausa.motivo === 'manual' ? `<div class="es-barra">${btn('▶ Retomar', 'esteiraRetomar', '', 'bt bt-principal')}</div>`
      : `${e.pausa.opcoes.length ? `<div class="es-barra">${e.pausa.opcoes.map((o, i) => btn(esc(o), 'esteiraResponder', ` data-op="${i}"`)).join('')}</div>` : ''}
      ${['sujo', 'git', 'repos'].includes(e.pausa.motivo) || (e.pausa.opcoes.length && ['sync', 'sem-mudanca', 'verificacao'].includes(e.pausa.motivo)) ? ''
        : `<textarea class="es-obs" data-texto placeholder="Sua resposta…" style="margin-top:8px"></textarea><div class="es-barra">${btn('Responder e continuar', 'esteiraResponder', '', 'bt bt-principal')}</div>`}`}</div></div>` : '';
  const et = ETAPAS[e.etapa - 1], lido = !!e.aprovacao?.lido;
  const aprovacao = fase === 'aguardando' && et ? `<div class="agora"><div class="atitulo">Revise a etapa ${et.n} · ${esc(et.nome)}</div>
    <div class="atexto">Abra <b>${esc(et.arq)}</b>, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.${et.n === 4 ? ' Aprovar libera a esteira a alterar o código dos repositórios (em branch própria, sem commit).' : ''}</div>
    <div class="aacoes"><div class="format-bar arquivo"><button class="fb-btn" data-acao="esteiraAbrir" data-id="${et.n}" title="${esc(path.join(dir, et.arq))}">Abrir ${esc(et.arq)}</button></div>
      <div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-acao="esteiraAprovar" ${lido ? '' : 'disabled'} title="${lido ? 'Aprovar esta etapa: a esteira segue sozinha' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
        <button data-acao="esteiraAjuste">Pedir ajuste</button></div></div></div>` : '';
  const briefing = (() => { try { return fs.readFileSync(path.join(dir, dossie.BRIEFING), 'utf8').trim(); } catch { return ''; } })();
  const conversa = btn('Conduzir em conversa', 'claude', ' title="Abre o chat do Claude neste ticket, com o dossiê e os artefatos já citados"');
  return `${CSS}${caixaEtapas.caixa({ titulo: 'Esteira de implementação', acao: nova ? btn('▶ Iniciar', 'esteiraIniciar', '', 'bt bt-principal') : '', etapas, atual: e.etapa })}
  ${dos ? `<div class="folha">${resumoDossie(dos)}</div>` : ''}
  ${nova ? `<div class="caixa-t">Quer explicar o que precisa ser feito?<span>opcional</span></div>
  <div class="folha"><textarea class="es-obs" data-texto data-obs-impl placeholder="Explique com suas palavras (o que mudar, como saber que ficou certo). Vira a fonte verbal do dossiê.">${esc(briefing)}</textarea>
    <div class="es-barra">${conversa}</div></div>`
    : `<div class="folha"><div class="es-barra" style="margin-top:0">${conversa}</div></div>`}${aprovacao}${pausa}
  ${aoVivo.caixa(dir, sit.rodando, 'esteira', controlesDe(sit)) || '<div class="folha"><div class="vazio-aba">Nada ao vivo ainda.</div></div>'}`;
};

// Aba Dossiê: o que a esteira sabe do ticket, recalculado ao abrir (não depende de a esteira ter rodado). d: dados da aba (d.jira).
const corpoDossie = (t, d0, dir) => {
  let d = dossie.lerGravado(dir);
  try {
    const env = ambiente({ reposDe: require('../refinamento/orquestrador').reposDe }, t);
    d = dossie.montar(t, { j: d0?.jira && !d0.jira.erro ? d0.jira : undefined, banco: env.banco, repos: env.repos });
  } catch { /* sem configuração (teste): fica o gravado */ }
  if (!d) return '<div class="folha"><div class="vazio-aba">Sem dossiê ainda.</div></div>';
  return `${CSS}<div class="caixa-t">Dossiê<span>${esc(d.gerado ? new Date(d.gerado).toLocaleString('pt-BR') : '')}</span></div><div class="folha es-doc">${markdown(dossie.paraMarkdown(d))}</div>`;
};

const dentro = (s, nome) => { const t = s.ticketAberto(), dir = t && s.pastaAba(t.id), f = dir && typeof nome === 'string' && path.resolve(nome); return f && (f === dir || f.startsWith(dir + path.sep)) ? f : null; };
/** ⏸/▶ do cabeçalho do ticket em Implementações (b monta o data-acao/data-painel). */
const botaoPlay = (dir, b) => { const sit = situacao(dir); return aoVivo.controle(sit.rodando, controlesDe(sit), b); };

const acoes = (s) => ({
  esteiraAbrir({ id }) {
    const t = s.ticketAberto(), n = Number(id), et = ETAPAS[n - 1];
    if (!t || !et) return;
    const dir = s.pastaAba(t.id), arq = path.join(dir, et.arq), vscode = require('vscode');
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    mudar(dir, { aprovacao: { etapa: n, lido: true } });
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
    s.render();
  },
  async esteiraAprovar() {
    const t = s.ticketAberto(), vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id), e = estado(dir), et = ETAPAS[e.etapa - 1];
    if (e.fase !== 'aguardando' || !et) return;
    if (!e.aprovacao?.lido) return vscode.window.showWarningMessage('Abra e leia o documento antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(`Aprovar a etapa ${et.n} (${et.nome})?`, { modal: true,
      detail: et.n === 4 ? 'Depois de aprovado, a esteira cria a branch de trabalho e altera o código dos repositórios (sem commit nem push).' : 'Depois de aprovada, a esteira segue sozinha para a próxima etapa.' }, 'Aprovar');
    if (!ok) return;
    aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${et.n} aprovada por você` });
    await proxima(s, t, et.n, controle.nova(dir));
  },
  async esteiraAjuste() {
    const t = s.ticketAberto(), vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id), e = estado(dir), et = ETAPAS[e.etapa - 1];
    if (e.fase !== 'aguardando' || !et) return;
    const texto = await vscode.window.showInputBox({ title: `Ajuste na etapa ${et.n} (${et.nome})`, prompt: 'O que o Claude deve mudar?', ignoreFocusOut: true });
    if (!texto?.trim()) return;
    fs.appendFileSync(path.join(dir, RESPOSTAS), `## Ajuste pedido na etapa ${et.n} (${et.arq})\n${texto.trim()}\n\n`);
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Ajuste pedido na etapa ${et.n}: ${texto.trim().slice(0, 120)}` });
    await rodarEtapa(s, t, et.n, controle.nova(dir), true);
  },
  esteiraPausar() { const t = s.ticketAberto(); if (t) pausarManual(s, t); },
  async esteiraRetomar() { const t = s.ticketAberto(); if (t) await retomar(s, t); },
  // Guarda a explicação do dev ao sair do campo (moldura.js manda o texto no focusout).
  esteiraObs({ texto }) {
    const t = s.ticketAberto();
    if (!t || typeof texto !== 'string') return;
    const f = path.join(s.pastaAba(t.id), dossie.BRIEFING);
    if (texto.trim()) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texto.trim() + '\n'); } else fs.rmSync(f, { force: true });
  },
  async esteiraIniciar({ texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    if (typeof texto === 'string' && texto.trim()) { const f = path.join(s.pastaAba(t.id), dossie.BRIEFING); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texto.trim() + '\n'); }
    await seguir(s, t);
  },
  async esteiraResponder({ op, texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    const p = estado(s.pastaAba(t.id)).pausa;
    await responder(s, t, op !== undefined && op !== '' ? p?.opcoes?.[Number(op)] : texto);
  }
});

module.exports = { corpo, corpoDossie, acoes, botaoPlay, ETAPAS, _teste: { deps, estado, mudar, situacao, seguir, aposEtapa, responder, prepararBranches, prepararDossie, verificar, afetados, ramo, slug, verificacaoComandos,
  FERRAMENTAS, rodarEtapa, avancar, proxima, ESTADO, PAUSA, RESPOSTAS, TENTAR, SEGUIR, CORRIGIR, RESUMIR, REPETIR, VERIFICAR, MAX_CORRECOES, filhos, dentro } };
