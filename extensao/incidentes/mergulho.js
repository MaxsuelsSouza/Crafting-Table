// @ts-check
// Aba Mergulho dos Incidentes, etapas 1 a 4 (triagem, artefatos/PO, dados e logs, diagnóstico). A 5 (reprodução) é do reproducao.js.
// Contrato dos artefatos: ~/.claude/documentos/*/incidentes-mergulho-contrato.md. Estado em <aba>/.mergulho.json.
// Cada etapa é um `claude -p` (maestro.rodar) que grava o seu arquivo; a extensão confere o arquivo e segue para a próxima.
// Pausa: o Claude grava .pausa.json ({ motivo, pergunta, opcoes }); a extensão guarda no estado, mostra na aba e retoma com a resposta (.respostas.md).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../componentes/ao-vivo');
const caixaEtapas = require('../componentes/caixa-etapas');
const maestro = require('../painel/maestro');
const { execFileSync } = require('child_process');
const controle = require('./controle');
const fluxo = require('./fluxo');
const reproducao = require('./reproducao'); // etapa 5 e as suas subetapas
const vagas = require('../agentes/etapas'); // plugin de cada etapa (Configurações > Plugins)

const ESTADO = '.mergulho.json', PAUSA = '.pausa.json', RESPOSTAS = '.respostas.md', CONTEXTO = '.jira-contexto.md';
const ETAPAS = [
  { n: 1, nome: 'Triagem', arq: '1-triagem.md' },
  { n: 2, nome: 'Artefatos e input do PO', arq: '2-artefatos.md' },
  { n: 3, nome: 'Dados e logs', arq: '3-dados-logs.md' },
  { n: 4, nome: 'Diagnóstico', arq: '4-diagnostico.md' },
  { n: 5, nome: 'Ambiente e reprodução', arq: 'reproducao.json' },
  { n: 6, nome: 'Evidências', arq: 'resumo.md' }
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const lerJson = (arq, vazio) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return vazio; } };

// ── Estado ──
const estado = (dir) => ({ etapa: 1, fase: 'parado', pausa: null, obsPO: '', ...lerJson(path.join(dir, ESTADO), {}) });
const mudar = (dir, patch) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ESTADO), JSON.stringify({ ...estado(dir), ...patch, ...(patch.fase === 'rodando' ? { host: process.pid } : {}), atualizado: new Date().toISOString() }, null, 2));
};
// Situação única da tela (aba, cabeçalho e Ao vivo leem daqui, então nunca discordam): "rodando" no arquivo só vale com o Claude vivo ou com a
// janela dona (host) viva; senão a execução foi interrompida (janela recarregada/fechada) e conta como parada.
const vivoPid = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const situacao = (dir) => {
  const e = estado(dir), rodando = maestro.rodando(dir) || (e.fase === 'rodando' && vivoPid(e.host));
  return { e, rodando, fase: e.fase === 'rodando' && !rodando ? 'parado' : e.fase };
};
// ⏸/▶ do componente Ao vivo (componentes/ao-vivo.js controle): ⏸ rodando; ▶ parado, com erro ou pausado por você; nada aguardando aprovação ou concluído.
const controlesDe = (sit) => ({ pausar: 'mergulhoPausar', dicaPausar: 'Pausar o Mergulho: o Claude para e a etapa recomeça ao retomar',
  retomar: ['parado', 'erro'].includes(sit.fase) || (sit.fase === 'pausado' && sit.e.pausa?.motivo === 'manual') ? 'mergulhoRetomar' : null,
  dicaRetomar: 'Retomar o Mergulho da etapa em que parou' });
const existe = (dir, n) => fs.existsSync(path.join(dir, ETAPAS[n - 1].arq));

// ── Gatekeeper da etapa 2: anexos do Jira ainda não baixados (mesma conta da aba Docs) ──
const anexosFaltando = (s, t) => {
  const { ler, ORIGEM } = require('../refinamento/locais');
  return require('../componentes/aba-docs').pendentes(s.cacheJira[t.id]?.anexos, ler(path.join(s.pasta(t.id), ORIGEM), {}));
};

// ── Prompts ──
// A pasta ~/.claude é bloqueada para Write/Edit no claude -p: a gravação dos artefatos passa por mergulho-gravar (como o qa-state do QA).
const GRAVAR = path.join(__dirname, 'mergulho-gravar');
const FERRAMENTAS = (mapa) => ['Read', 'Glob', 'Grep', `Bash(${GRAVAR}:*)`, `Bash(${mapa}/bin/mapa-db:*)`, `Bash(${mapa}/bin/mapa-git:*)`,
  'Bash(ls:*)', 'Bash(ffmpeg:*)', 'Bash(ffprobe:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)', 'Bash(mkdir:*)'];
const html2txt = (h) => String(h || '').replace(/<(br|\/p|\/li|\/tr|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
// Descrição e comentários do Jira em texto, para o Claude ler sem depender de outra ferramenta.
const contextoJira = (j) => `# ${j.key} · ${j.resumo}\nStatus: ${j.status} · Tipo: ${j.tipo}\n\n## Descrição\n\n${html2txt(j.descricao)}\n\n## Comentários (mais recente primeiro)\n\n`
  + ((j.comentarios || []).map((c) => `### ${c.autor} · ${c.data}\n${html2txt(c.corpo)}`).join('\n\n') || '(sem comentários)');

const TAREFA = {
  1: (d) => `ETAPA 1 · TRIAGEM. Leia ${CONTEXTO} (descrição do ticket). Identifique Módulo, Submódulo e Fluxo do WMS e explique em qual etapa específica do fluxo o problema ocorreu. Use o código dos repositórios só para confirmar nomes de módulo/fluxo. Grave em ${d}/${ETAPAS[0].arq}, seções: Módulo, Submódulo, Fluxo, Etapa do fluxo em que o problema ocorreu (com a justificativa).`,
  2: (d, o) => `ETAPA 2 · ARTEFATOS E INPUT DO PO. Leia ${CONTEXTO} (todos os comentários), os arquivos baixados do ticket (pasta ${d}/.. e ${d}) e a observação do PO: ${o ? `"${o}"` : '(nenhuma)'}. Grave em ${d}/${ETAPAS[1].arq}: resumo dos comentários, dos anexos e da observação do PO, mais duas seções: "Massa de dados" (IDs, números de pedido/tarefa, payloads citados, literalmente como aparecem) e "Comportamento relatado" (o que o usuário disse que fez/viu, ex.: "app crashou"). Vídeos (.mp4/.webm): não dá para abri-los com Read; extraia quadros com: ffmpeg -i <video> -vf fps=1/2 -frames:v 12 /tmp/mergulho-${path.basename(path.dirname(d))}/quadro-%02d.png (crie a pasta antes com mkdir -p) e leia os PNGs com Read; descreva o que o vídeo mostra. Imagens (.png/.jpg) leia direto com Read. Não invente: o que não está nas fontes fica fora. Se algum anexo não puder ser lido, liste-o em "Não analisado" no arquivo com o motivo.`,
  3: (d) => `ETAPA 3 · DADOS E LOGS (base de BKP). Leia ${d}/${ETAPAS[0].arq} e ${d}/${ETAPAS[1].arq}. (a) MASSA: prioridade 1 é a massa já citada no ticket/comentários/anexos (seção "Massa de dados"). Só se ela não estiver no ticket, procure a massa na base de BKP com mapa-db (somente SELECT; nunca altere nem grave nada no banco). Grave as consultas/estrutura da massa real em ${d}/massa-real.sql. (b) LOGS: no código dos repositórios, identifique as tabelas de log ligadas a essa massa/módulo e o caminho do código que grava nelas. No banco, consulte a tabela de log e confira se há registros recentes. Se a tabela achada NÃO tiver uso recente (ou houver mais de uma candidata e você não souber qual), PAUSE e pergunte ao usuário qual tabela consultar. Se estiver ativa, busque a movimentação específica da massa do incidente. Grave em ${d}/${ETAPAS[2].arq}: onde a massa foi achada (ticket ou BKP), tabelas de log (com o caminho do código) e os registros de movimentação encontrados.`,
  4: (d) => `ETAPA 4 · DIAGNÓSTICO. Leia ${d}/${ETAPAS[0].arq}, ${d}/${ETAPAS[1].arq}, ${d}/${ETAPAS[2].arq} e ${d}/massa-real.sql. Cruze o estado da massa, o log e o relato do PO e defina a ação exata do usuário, ou a falha de ambiente, que gerou a anomalia (ex.: "tentou finalizar a tarefa sem completar todos os cards"; "app crashou no meio da requisição e o usuário reiniciou o celular"). Grave em ${d}/${ETAPAS[3].arq}: a ação/falha, as evidências que a sustentam (cite arquivo e registro) e o grau de certeza. Se não houver base para concluir, PAUSE e pergunte exatamente o que falta.`
};
const REGRAS = (d) => `\n\nRegras: português; você roda em segundo plano, SEM ninguém para aprovar permissões: ação que pede aprovação é negada, então nunca diga que algo "precisa de aprovação" — use outra ferramenta ou registre a limitação no arquivo; só leia em ${d} (e no código dos repositórios). ESCRITA: Write/Edit são bloqueados nesta pasta; para gravar qualquer arquivo dela ("Grave em ${d}/NOME") use ${GRAVAR} NOME <<'FIM' … FIM (texto pela entrada padrão, só o nome do arquivo, sem a pasta); no Bash use um comando simples por vez (sem ; && | encadeados: pedem aprovação e são bloqueados), prefira Read/Glob/Grep; banco SOMENTE SELECT via mapa-db; não invente nada que não esteja nas fontes. Grave o arquivo da etapa só quando ela estiver pronta. Para PAUSAR e perguntar ao usuário (sem AskUserQuestion), grave ${d}/${PAUSA} com {"motivo":"...","pergunta":"...","opcoes":["..."]} (opcoes pode ser vazio) e NÃO grave o arquivo da etapa; termine em seguida.`;

const prompt = (t, dir, n, repos, banco, ajuste = false) => {
  const resp = fs.existsSync(path.join(dir, RESPOSTAS)) ? `\nRespostas do usuário a perguntas anteriores (use-as): ${path.join(dir, RESPOSTAS)}` : '';
  return `[segundo plano] [Crafting Table · Incidente ${t.chave}] Mergulho no incidente ${t.link || t.chave}.\nPasta de trabalho: ${dir}\nRepositórios de código: ${repos.map((r) => `${r.camada}: ${r.caminho}`).join(' · ') || 'nenhum configurado'}\nBanco: ${banco}${resp}\n\n${TAREFA[n](dir, estado(dir).obsPO)}${ajuste ? `\n\nAJUSTE: ${path.join(dir, ETAPAS[n - 1].arq)} já existe e o usuário pediu mudança: leia a ÚLTIMA entrada de ${path.join(dir, RESPOSTAS)}, aplique o pedido e regrave o arquivo completo, sem refazer o que já está certo.` : ''}${REGRAS(dir)}`;
};

// ── Branch dos repositórios (etapa 3) ──
// O código lido na etapa 3 tem de ser o de produção: backend em master-md, frontend (mobile/web) em main. Outra branch mostra outro cenário.
const BRANCH_DA_CAMADA = { backend: 'master-md', mobile: 'main', web: 'main' };
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const branchesErradas = (repos) => repos.flatMap((r) => {
  const esperada = BRANCH_DA_CAMADA[r.camada];
  if (!esperada) return [];
  let atual; try { atual = git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']); } catch { atual = '(não é um repositório git)'; }
  return atual === esperada ? [] : [{ ...r, esperada, atual }];
});
// Etapa 3: repositórios já na branch de produção ficam iguais a origin/<branch> (fetch + pull --ff-only). Devolve os problemas ("repo: motivo"); vazio = tudo certo.
const sincronizarRepos = (repos, anotar = () => {}) => repos.flatMap((r) => {
  const esperada = BRANCH_DA_CAMADA[r.camada], nome = path.basename(r.caminho);
  if (!esperada) return [];
  try {
    if (git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']) !== esperada) return []; // "Continuar assim mesmo" em outra branch: não mexe
    git(r.caminho, ['fetch', 'origin', esperada]);
    if (!Number(git(r.caminho, ['rev-list', '--count', `${esperada}..origin/${esperada}`]))) return [];
    git(r.caminho, ['pull', '--ff-only', 'origin', esperada]); anotar(`${nome}: pull de origin/${esperada}`);
    return [];
  } catch (x) { return [`${nome} (${esperada}): ${String(x.stderr || x.message).trim().split('\n')[0]}`]; }
});
const TROCAR = 'Trocar para a branch correta e continuar', SEGUIR = 'Continuar assim mesmo', TENTAR = 'Tentar de novo';

// ── Execução ──
const rodarEtapa = async (s, t, n, rodada, ajuste = false) => {
  const dir = s.pastaAba(t.id), { cfg } = require('../configuracao/configuracao');
  if (n <= 2) { // gatekeeper: todos os anexos do ticket precisam estar baixados
    if (!s.cacheJira[t.id] && s.atualizarJira) await s.atualizarJira(t.id);
    if (!controle.valida(dir, rodada)) return;
    const falta = anexosFaltando(s, t);
    if (falta.length) {
      mudar(dir, { etapa: n, fase: 'pausado', pausa: { motivo: 'anexos', pergunta: `${falta.length} anexo(s) do ticket ainda não foram baixados (${falta.map((a) => a.nome).join(', ')}). Baixe e continue.`, opcoes: [] } });
      aoVivo.anotar(dir, { tipo: 'aviso', texto: 'Mergulho pausado: faltam anexos do ticket para baixar' });
      return s.render();
    }
  }
  if (n === 3 && !estado(dir).branchOk) { // etapa 3 lê código: confere master-md / main antes
    const erradas = branchesErradas(s.reposDe(t));
    if (erradas.length) {
      mudar(dir, { etapa: n, fase: 'pausado', pausa: { motivo: 'branch', pergunta: `Repositório fora da branch correta: ${erradas.map((r) => `${path.basename(r.caminho)} (${r.camada}) está em ${r.atual}, o esperado é ${r.esperada}`).join('; ')}. Em outra branch o código pode mostrar um cenário diferente do incidente.`, opcoes: [TROCAR, SEGUIR] } });
      aoVivo.anotar(dir, { tipo: 'aviso', texto: `Mergulho pausado: ${erradas.map((r) => `${path.basename(r.caminho)} em ${r.atual} (esperado ${r.esperada})`).join(', ')}` });
      return s.render();
    }
  }
  if (n === 3 && !estado(dir).syncOk) { // e atualizados com a origem (pull) antes de ler o código
    const falhas = sincronizarRepos(s.reposDe(t), (texto) => aoVivo.anotar(dir, { tipo: 'acao', texto }));
    if (falhas.length) {
      mudar(dir, { etapa: n, fase: 'pausado', pausa: { motivo: 'sync', pergunta: `Não consegui atualizar com a origem: ${falhas.join('; ')}. Código desatualizado pode não refletir o que está em produção.`, opcoes: [TENTAR, SEGUIR] } });
      aoVivo.anotar(dir, { tipo: 'aviso', texto: `Mergulho pausado: ${falhas.join(', ')}` });
      return s.render();
    }
  }
  const j = s.cacheJira[t.id];
  if (j && !j.erro) fs.writeFileSync(path.join(dir, CONTEXTO), contextoJira(j));
  const mapa = vagas.raiz('incidentes.mapa') || '', conexao = cfg().get('bancoConexao') || '', amb = cfg().get('bancoAmbiente') || '';
  const repos = s.reposDe(t), banco = conexao && amb && amb !== 'producao' ? `configurado (${amb === 'qas' ? 'QAS' : 'cópia de produção'}): mapa-db, só leitura` : 'NÃO configurado: não consulte banco; registre como pendência';
  const arqEtapa = path.join(dir, ETAPAS[n - 1].arq), antes = ajuste && fs.existsSync(arqEtapa) ? fs.statSync(arqEtapa).mtimeMs : 0;
  if (!ajuste) fs.rmSync(arqEtapa, { force: true }); // ajuste mantém o documento: o Claude o atualiza
  fs.rmSync(path.join(dir, PAUSA), { force: true });
  mudar(dir, { etapa: n, fase: 'rodando', pausa: null, aprovacao: null });
  let tratou = false;
  const ok = maestro.rodar(dir, {
    prompt: prompt(t, dir, n, repos, banco, ajuste) + vagas.aviso('incidentes.mapa'), titulo: `Mergulho · Etapa ${n}: ${ETAPAS[n - 1].nome}${ajuste ? ' (ajuste)' : ''}`, ferramentas: FERRAMENTAS(mapa),
    env: { MAPA_DB_CONEXAO: conexao, MAPA_DB_AMBIENTE: amb, MAPA_DB_SQLCL: cfg().get('bancoSqlcl') || '', MAPA_DB_SENSIVEIS: (cfg().get('bancoColunasSensiveis') || []).join(','), MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'), MERGULHO_DIR: dir },
    extras: [...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : []), ...vagas.pluginDirs('incidentes.mapa'), '--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir', dir, '--add-dir', s.pasta(t.id), ...repos.map((r) => r.caminho)],
    aoMudar: () => { s.render(); if (!tratou && !maestro.rodando(dir)) { tratou = true; aposEtapa(s, t, n, rodada, antes); } }
  });
  if (!ok) mudar(dir, { fase: 'parado' });
  s.render();
};

// Etapa terminou: pausa pedida pelo Claude, artefato gravado (segue) ou erro.
const aposEtapa = async (s, t, n, rodada, mtimeAntes = 0) => {
  const dir = s.pastaAba(t.id), p = lerJson(path.join(dir, PAUSA), null);
  if (!controle.valida(dir, rodada)) return s.render(); // pausado por você: o Claude morto não é erro
  if (p?.pergunta) {
    fs.rmSync(path.join(dir, PAUSA), { force: true });
    mudar(dir, { fase: 'pausado', pausa: { motivo: String(p.motivo || ''), pergunta: String(p.pergunta), opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [] } });
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Mergulho pausado na etapa ${n}: aguardando sua resposta` });
  } else if (!existe(dir, n) || (mtimeAntes && fs.statSync(path.join(dir, ETAPAS[n - 1].arq)).mtimeMs <= mtimeAntes)) {
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: `A etapa ${n} terminou sem ${mtimeAntes ? 'atualizar' : 'gravar'} ${ETAPAS[n - 1].arq}` });
  } else aguardarAprovacao(s, t, n);
  s.render();
};

// Documento da etapa criado: como no refinamento, o Mergulho para e espera você abrir, aprovar (segue sozinho para a próxima) ou pedir ajuste.
const aguardarAprovacao = (s, t, n) => {
  const dir = s.pastaAba(t.id);
  mudar(dir, { etapa: n, fase: 'aguardando', pausa: null, aprovacao: { etapa: n, lido: false } });
  aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq} criado. Aguardando sua aprovação` });
  s.render();
};

// Etapa 4 concluída → etapa 5 (reproducao.js atualiza fase/etapa daí em diante).
const reproduzir = async (s, t, rodada) => {
  const dir = s.pastaAba(t.id);
  mudar(dir, { etapa: 5, fase: 'rodando', pausa: null });
  s.render();
  try { await reproducao.executar(s, t, { rodada }); } catch (e) {
    if (!controle.valida(dir, rodada)) return s.render();
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: `Etapa 5 falhou: ${e.message}` });
  }
  s.render();
};

// Iniciar/Continuar/Retomar: da etapa guardada em diante.
const seguir = (s, t) => {
  const dir = s.pastaAba(t.id), e = estado(dir);
  if (maestro.rodando(dir) || e.fase === 'aguardando') return; // aguardando: a saída é Aprovar ou Pedir ajuste no card
  if (e.etapa <= 4 && e.fase === 'rodando' && !situacao(dir).rodando && existe(dir, e.etapa)) return aguardarAprovacao(s, t, e.etapa); // interrompida depois de gravar o documento
  const rodada = controle.nova(dir);
  return e.etapa >= 5 ? reproduzir(s, t, rodada) : rodarEtapa(s, t, e.etapa, rodada);
};
// ⏸ em qualquer etapa: cancela a rodada, mata o Claude em andamento e guarda a pausa; ▶ retoma da etapa em que parou.
const pausarManual = (s, t) => {
  const dir = s.pastaAba(t.id);
  controle.cancelar(dir);
  maestro.parar(dir);
  fluxo.descartarEmAndamento(dir); // o passo em andamento volta para a fila; os feitos ficam para a retomada rápida
  mudar(dir, { fase: 'pausado', pausa: { motivo: 'manual', pergunta: 'Mergulho pausado por você. A etapa em andamento recomeça ao retomar.', opcoes: [] } });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: 'Mergulho pausado por você' });
  s.render();
};
const retomar = (s, t) => { mudar(s.pastaAba(t.id), { pausa: null }); return seguir(s, t); };

// Resposta do usuário à pausa: vai para .respostas.md e a mesma etapa roda de novo.
const responder = (s, t, resposta) => {
  const dir = s.pastaAba(t.id), e = estado(dir);
  if (!e.pausa || !String(resposta || '').trim()) return;
  if (e.pausa.motivo === 'branch') { // não vai para as respostas do Claude: a extensão resolve
    if (resposta === TROCAR) {
      for (const r of branchesErradas(s.reposDe(t))) {
        try { git(r.caminho, ['checkout', r.esperada]); aoVivo.anotar(dir, { tipo: 'acao', texto: `${path.basename(r.caminho)}: branch ${r.esperada}` }); }
        catch (x) { aoVivo.anotar(dir, { tipo: 'erro', texto: `Não consegui trocar ${path.basename(r.caminho)} para ${r.esperada}: ${String(x.stderr || x.message).trim().split('\n')[0]}` }); return s.render(); } // segue pausado: troque à mão e continue
      }
      mudar(dir, { pausa: null });
    } else if (resposta === SEGUIR) mudar(dir, { pausa: null, branchOk: true });
    else return; // texto livre não resolve a pausa de branch
    return seguir(s, t);
  }
  if (e.pausa.motivo === 'sync') {
    if (resposta === SEGUIR) mudar(dir, { pausa: null, syncOk: true });
    else if (resposta === TENTAR) mudar(dir, { pausa: null });
    else return;
    return seguir(s, t);
  }
  fs.appendFileSync(path.join(dir, RESPOSTAS), `## Etapa ${e.etapa} · ${e.pausa.pergunta}\n${String(resposta).trim()}\n\n`);
  mudar(dir, { pausa: null });
  return seguir(s, t);
};

// ── Tela ──
const CSS = `<style>${caixaEtapas.CSS}
  .mg-obs { width: 100%; box-sizing: border-box; min-height: 90px; resize: vertical; padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: 12.5px/1.5 var(--fc-font); }
  .mg-obs:focus { outline: none; border-color: var(--accent); }
  .mg-barra { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .mg-pausa { border-left: 3px solid var(--accent); padding-left: 10px; font-size: 12.5px; line-height: 1.55; }
  .mg-pausa p { margin: 0 0 8px; }
</style>`;
const btn = (txt, acao, extra = '', cls = 'bt bt-contorno') => `<button class="${cls}" data-acao="${acao}"${extra}>${txt}</button>`;

const corpo = (t, d, dir) => {
  const sit = situacao(dir), e = sit.e, vivo = sit.rodando, fase = sit.fase; // execução interrompida (janela recarregada) conta como parada
  const subs = reproducao.estadoSubs(dir);
  const estadoAtual = ({ rodando: 'rodando', pausado: 'pausada', erro: 'erro', parado: 'pendente', aguardando: 'aguardando', concluido: 'concluida' })[fase] || 'pendente';
  const etapas = ETAPAS.map((x) => {
    const feita = existe(dir, x.n) && (x.n < e.etapa || (x.n === e.etapa && fase === 'concluido'));
    const atual = x.n === e.etapa && !feita;
    return { n: x.n, nome: x.nome, estado: feita ? 'concluida' : atual ? estadoAtual : 'pendente', ...(atual && fase === 'parado' ? { rotulo: 'pronta para iniciar' } : {}),
      // etapa 5: ao entrar nela a caixa expande com 5.1 a 5.4 antes de qualquer processo; só a subetapa em andamento herda a fase (pausa, erro, parada)
      ...(x.n === 5 ? { subetapas: reproducao.SUBETAPAS.map((r) => ({ n: r.n, nome: r.nome, estado: subs[r.id] === 'rodando' ? (atual ? estadoAtual : 'pendente') : subs[r.id] === 'erro' && !atual ? 'pendente' : subs[r.id] })) } : {}) };
  });
  const nova = e.etapa === 1 && fase === 'parado' && !existe(dir, 1);
  const pausa = e.pausa && fase === 'pausado' ? `<div class="caixa-t">Pausa do Mergulho</div><div class="folha"><div class="mg-pausa"><p>${esc(e.pausa.pergunta)}</p>
    ${e.pausa.motivo === 'manual' ? `<div class="mg-barra">${btn('▶ Retomar', 'mergulhoRetomar', '', 'bt bt-principal')}</div>`
      : e.pausa.motivo === 'anexos' ? `<div class="mg-barra">${btn('↓ Baixar todos', 'anexoTodos')}${btn('Continuar', 'mergulhoContinuar', '', 'bt bt-principal')}</div>`
      : `${e.pausa.opcoes.length ? `<div class="mg-barra">${e.pausa.opcoes.map((o, i) => btn(esc(o), 'mergulhoResponder', ` data-op="${i}"`)).join('')}</div>` : ''}
      <textarea class="mg-obs" data-texto placeholder="Sua resposta…" style="margin-top:8px"></textarea><div class="mg-barra">${btn('Responder e continuar', 'mergulhoResponder', '', 'bt bt-principal')}</div>`}</div></div>` : '';
  const et = ETAPAS[e.etapa - 1], lido = !!e.aprovacao?.lido;
  // Mesmo visual do refinamento (refinamento/spec.js): cartão "Agora" com o título e o texto, "Abrir <arquivo>" e os botões Aprovar (verde, travado até ler) e Pedir ajuste.
  const aprovacao = fase === 'aguardando' && et ? `<div class="agora"><div class="atitulo">Revise a etapa ${et.n} · ${esc(et.nome)}</div>
    <div class="atexto">Abra <b>${esc(et.arq)}</b>, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.</div>
    <div class="aacoes"><div class="format-bar arquivo"><button class="fb-btn" data-acao="mergulhoAbrir" data-id="${et.n}" title="${esc(path.join(dir, et.arq))}">Abrir ${esc(et.arq)}</button></div>
      <div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-acao="mergulhoAprovar" ${lido ? '' : 'disabled'} title="${lido ? 'Aprovar esta etapa: o Mergulho segue sozinho' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
        <button data-acao="mergulhoAjuste">Pedir ajuste</button></div></div></div>` : '';
  return `${CSS}${caixaEtapas.caixa({ titulo: 'Mergulho', acao: nova ? btn('▶ Iniciar', 'mergulhoIniciar', '', 'bt bt-principal') : '', etapas, atual: e.etapa })}
  ${nova ? `<div class="caixa-t">Há alguma observação adicional deixada pelo PO?<span>opcional</span></div>
  <div class="folha"><textarea class="mg-obs" data-texto data-obs placeholder="Cole aqui o que o PO comentou fora do ticket (opcional)…">${esc(e.obsPO)}</textarea></div>`
    : e.obsPO ? `<div class="caixa-t">Observação do PO</div><div class="folha"><div style="white-space:pre-wrap">${esc(e.obsPO)}</div></div>` : ''}${aprovacao}${pausa}
  ${aoVivo.caixa(dir, vivo, 'mergulho', controlesDe(sit)) || '<div class="folha"><div class="vazio-aba">Nada ao vivo ainda.</div></div>'}
  ${fluxo.html(dir, d?.uri)}`;
};

const dentro = (s, nome) => { const t = s.ticketAberto(), dir = t && s.pastaAba(t.id), f = dir && typeof nome === 'string' && path.resolve(nome); return f && (f === dir || f.startsWith(dir + path.sep)) ? f : null; };

// ⏸/▶ do cabeçalho do ticket em Incidentes (b = data-acao/data-painel já montado pelo cabecalho()), em qualquer aba.
const botaoPlay = (dir, b) => { const sit = situacao(dir); return aoVivo.controle(sit.rodando, controlesDe(sit), b); };

const acoes = (s) => ({
  // Card do fluxo (etapa 5): abrir evidência, pasta, copiar caminho e refazer um passo; só caminhos dentro da pasta da aba.
  fluxoAbrir({ nome }) { const f = dentro(s, nome); if (f) require('vscode').commands.executeCommand('vscode.open', require('vscode').Uri.file(f), require('vscode').ViewColumn.Beside); },
  fluxoPasta({ nome }) { const f = dentro(s, nome); if (f) { fs.mkdirSync(f, { recursive: true }); require('vscode').env.openExternal(require('vscode').Uri.file(f)); } },
  async fluxoCopiar({ nome }) { const f = dentro(s, nome); if (f) { await require('vscode').env.clipboard.writeText(f); require('vscode').window.showInformationMessage('Caminho das evidências do passo copiado.'); } },
  fluxoRefazer({ id }) { const t = s.ticketAberto(); if (t && typeof id === 'string' && fluxo.refazer(s.pastaAba(t.id), id)) s.render(); },
  // Etapa 1 a 4 concluída: abrir o documento libera o Aprovar (nunca aprovar sem ler); Aprovar segue sozinho; Pedir ajuste roda a etapa de novo sobre o documento.
  mergulhoAbrir({ id }) {
    const t = s.ticketAberto(), n = Number(id), et = ETAPAS[n - 1];
    if (!t || !et) return;
    const dir = s.pastaAba(t.id), arq = path.join(dir, et.arq), vscode = require('vscode');
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    mudar(dir, { aprovacao: { etapa: n, lido: true } });
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
    s.render();
  },
  async mergulhoAprovar() {
    const t = s.ticketAberto(), vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id), e = estado(dir), et = ETAPAS[e.etapa - 1];
    if (e.fase !== 'aguardando' || !et) return;
    if (!e.aprovacao?.lido) return vscode.window.showWarningMessage('Abra e leia o documento antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(`Aprovar a etapa ${et.n} (${et.nome})?`, { modal: true, detail: 'Depois de aprovada, o Mergulho segue sozinho para a próxima etapa.' }, 'Aprovar');
    if (!ok) return;
    aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${et.n} aprovada por você` });
    mudar(dir, { etapa: et.n + 1, fase: 'parado', aprovacao: null });
    await seguir(s, t);
  },
  async mergulhoAjuste() {
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
  mergulhoPausar() { const t = s.ticketAberto(); if (t) pausarManual(s, t); },
  async mergulhoRetomar() { const t = s.ticketAberto(); if (t) await retomar(s, t); },
  // Guarda a observação do PO ao sair do campo (moldura.js manda o texto no focusout).
  mergulhoObs({ texto }) { const t = s.ticketAberto(); if (t && typeof texto === 'string') mudar(s.pastaAba(t.id), { obsPO: texto }); },
  async mergulhoIniciar({ texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    if (typeof texto === 'string') mudar(s.pastaAba(t.id), { obsPO: texto });
    await seguir(s, t);
  },
  async mergulhoContinuar() { const t = s.ticketAberto(); if (t) await seguir(s, t); },
  async mergulhoResponder({ op, texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    const p = estado(s.pastaAba(t.id)).pausa;
    await responder(s, t, op !== undefined && op !== '' ? p?.opcoes?.[Number(op)] : texto);
  }
});

module.exports = { corpo, acoes, botaoPlay, sincronizarRepos, _teste: { situacao, branchesErradas, FERRAMENTAS, estado, mudar, anexosFaltando, aposEtapa, responder, prompt, ETAPAS, ESTADO, PAUSA, RESPOSTAS } };
