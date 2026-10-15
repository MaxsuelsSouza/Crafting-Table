// @ts-check
// Reprodução do bug (etapa da esteira antes do Entendimento, só para ticket do tipo Bug/Defeito/Incidente): o Claude sobe a aplicação, executa o
// passo a passo relatado e confirma se o erro acontece. Cada cenário tem o formato do QA ({ id, titulo, texto, status, execucoes }) e usa o mesmo
// card (qa/card-cenario.js) e o mesmo registro do fluxo dos Incidentes (incidentes/fluxo.js, fluxo.json na pasta da aba). "falhou" = o erro aconteceu.
// Evidências: as que já estão no ticket, no pai ou nos irmãos (anexos do Jira) são baixadas para <aba>/evidencias-ticket/ e indexadas em
// .evidencias-ticket.json; o Claude as anexa ao cenário que falhou (reproducao-fluxo evidencia) junto com as que ele mesmo capturar.
// Resultado: reproducao.md (a extensão grava, para o Entendimento e o QA lerem). Sem vscode: roda em teste.
const fs = require('fs');
const path = require('path');
const fluxo = require('../incidentes/fluxo');
const cardCenario = require('../qa/card-cenario');
const { esc } = require('../infra/texto');
const { ehBug, REPRODUCAO } = require('./dossie');
const tipoTicket = require('../infra/tipo-ticket');

const PASTA = 'evidencias-ticket', INDICE = '.evidencias-ticket.json', MAX_ANEXOS = 20, MAX_BYTES = 40 * 1024 * 1024;
const EVIDENCIA = /\.(png|jpe?g|gif|webp|mp4|webm|mov|log|txt|har|pdf)$/i;
const BIN = path.join(__dirname, 'reproducao-fluxo');
const lerJson = (f, pad) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return pad; } };
const seguro = (n) => String(n).replace(/[^\w.\- ]+/g, '_').slice(0, 120);

// ── Evidências que o ticket (ou o pai e os irmãos) já traz ──
/** Baixa os anexos do Jira que parecem evidência (print, vídeo, log). `baixar(anexo)` devolve o conteúdo; falha em um não derruba os outros. */
async function coletarEvidencias(dir, anexos, baixar) {
  const alvo = path.join(dir, PASTA), feitos = lerJson(path.join(dir, INDICE), []);
  const itens = [...feitos];
  const novos = (anexos || []).filter((a) => a?.id && EVIDENCIA.test(a.nome || '') && !itens.some((i) => i.id === String(a.id)) && !(a.tamanho > MAX_BYTES)).slice(0, MAX_ANEXOS);
  fs.mkdirSync(alvo, { recursive: true });
  for (const a of novos) {
    try {
      const conteudo = await baixar(a);
      const nome = `${a.de ? `${seguro(a.de)}-` : ''}${seguro(a.nome)}`;
      fs.writeFileSync(path.join(alvo, nome), conteudo);
      itens.push({ id: String(a.id), nome, arquivo: path.join(PASTA, nome), de: a.de || null });
    } catch { /* anexo indisponível: segue com os outros */ }
  }
  fs.writeFileSync(path.join(dir, INDICE), JSON.stringify(itens, null, 2));
  return itens;
}
const evidenciasDoTicket = (dir) => lerJson(path.join(dir, INDICE), []);

// ── Resultado ──
const comEvidencia = (dir, p) => p.execucoes.some((x) => fluxo.arquivosDe(dir, x).length > 0);
/** @returns {{ passos: any[], falhou: any[], semEvidencia: any[], pendentes: any[], confirmou: boolean }} */
function resultado(dir) {
  const passos = fluxo.ler(dir).passos, falhou = passos.filter((p) => p.status === 'falhou');
  return { passos, falhou, semEvidencia: falhou.filter((p) => !comEvidencia(dir, p)), pendentes: passos.filter((p) => ['pendente', 'executando'].includes(p.status)),
    confirmou: falhou.length > 0 };
}
/** reproducao.md: cenários, o que falhou (o erro aconteceu) e os arquivos de evidência. */
function gravarResumo(dir, chave, aceitaSem = '') {
  const r = resultado(dir), rel = (f) => path.relative(dir, f);
  const evTicket = evidenciasDoTicket(dir);
  const linhas = [`# Reprodução · ${chave}`, '',
    r.confirmou ? `**Erro confirmado**: ${r.falhou.length} cenário(s) falharam (o comportamento relatado aconteceu).` : `**Erro não confirmado**${aceitaSem ? `: ${aceitaSem}` : ' pela reprodução.'}`, '',
    '## Cenários', ''];
  for (const p of r.passos) {
    const ex = p.execucoes.at(-1), arqs = ex ? fluxo.arquivosDe(dir, ex).map(rel) : [];
    linhas.push(`- **${p.id}** [${p.status}] ${p.titulo}${ex?.nota ? ` · ${ex.nota}` : ''}`, ...arqs.map((a) => `  - evidência: ${a}`));
  }
  if (!r.passos.length) linhas.push('- (nenhum cenário registrado)');
  if (evTicket.length) linhas.push('', '## Evidências já presentes no ticket (ticket, pai ou irmãos)', '', ...evTicket.map((e) => `- ${e.arquivo}${e.de ? ` (de ${e.de})` : ''}`));
  linhas.push('');
  fs.writeFileSync(path.join(dir, REPRODUCAO), linhas.join('\n'));
}
/** Guarda o fluxo anterior para replanejar do zero (as evidências ficam em evidencias/). */
function reiniciar(dir) {
  const f = path.join(dir, fluxo.ARQ);
  if (fs.existsSync(f)) fs.renameSync(f, path.join(dir, `fluxo.${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}.json`));
}

// ── Prompt ──
const REGRAS = (dir, gravar) => `\n\nRegras: português; segundo plano, SEM ninguém para aprovar permissões (ação negada: use outra ferramenta ou registre como bloqueado). `
  + `Registre TUDO por ${BIN} (a pasta vem em IMPLEMENTACAO_DIR): plano <<'FIM' [{"titulo":"...","texto":"o que fazer e o que esperar"}] FIM · iniciar Pnn · acao Pnn "<comando que repete>" · evidencia Pnn <arquivo> · concluir Pnn passou|falhou|bloqueado --nota "o que viu" · status. `
  + `Em cada cenário: "falhou" significa que o ERRO RELATADO ACONTECEU (é o que queremos confirmar); "passou" = o comportamento estava correto; "bloqueado" = não deu para executar (diga o motivo na nota). `
  + `Todo cenário "falhou" EXIGE evidência anexada (print, vídeo ou log) por ${BIN} evidencia: capture a sua (adb exec-out screencap -p > /tmp/repro-Pnn.png) ou reaproveite um arquivo de ${path.join(dir, PASTA)}. `
  + `Proibido: alterar código, commit, push, INSERT/UPDATE/DELETE/DDL no banco, publicar na ferramenta de tickets. Consultas ao banco só por mapa-db (leitura). Não invente: o que não consta nas fontes é "não identificado". `
  + `Se precisar perguntar ao usuário (ex.: falta o passo a passo), grave ${gravar} .pausa.md <<'FIM' com "motivo:", "pergunta:" e "opcoes:" (lista com "- ") e termine.`;

/** @param {{ dir: string, t: any, d: any, comandos: { nome: string, comando: string, pasta?: string }[], repos: { caminho: string, camada: string }[], gravar: string, retomada: boolean }} c */
function prompt(c) {
  const ev = evidenciasDoTicket(c.dir);
  return `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] ETAPA · REPRODUÇÃO DO BUG (antes de qualquer desenvolvimento). Ticket ${c.t.link || c.t.chave}${c.t.titulo ? ` · ${c.t.titulo}` : ''} (tipo ${c.d?.tipoTicket || 'bug'}).\n`
    + `Pasta de trabalho: ${c.dir}\nLeia ${path.join(c.dir, 'dossie.md')}, ${path.join(c.dir, '.contexto-ticket.md')} (descrição e comentários, se existir), o diagnóstico/spec que o dossiê citar e os anexos do ticket na pasta ${path.dirname(c.dir)}.\n`
    + `Repositórios: ${c.repos.map((r) => `${r.camada}: ${r.caminho}`).join(' · ') || 'nenhum configurado'}\n`
    + `Comandos configurados nas Configurações > Comandos (use para subir a aplicação e o emulador; a skill de testes funcionais/Maestro cobre a jornada mobile): ${c.comandos.map((b) => `${b.nome} = ${b.comando}`).join(' | ') || '(nenhum)'}\n`
    + `Evidências já presentes no ticket, no pai ou nos irmãos (baixadas em ${path.join(c.dir, PASTA)}): ${ev.length ? ev.map((e) => `${e.arquivo}${e.de ? ` (de ${e.de})` : ''}`).join(', ') : 'nenhuma. Procure nas descrições/comentários do ticket, do pai e dos irmãos se há print, vídeo ou log citado'}.\n\n`
    + (c.retomada ? `RETOMADA: o fluxo já foi planejado; estado atual:\n${fluxo.estadoParaPrompt(c.dir)}\nRefaça rápido, pela ação registrada, o que já foi feito e siga do primeiro pendente. `
      : `1) Monte o passo a passo do relato (cada passo/condição relatada vira um cenário, com o resultado esperado) e registre com plano. `)
    + `2) Suba a aplicação (e o emulador, se for mobile) e execute os cenários na ordem, registrando iniciar, acao, evidencia e concluir. `
    + `3) Ao final, o cenário em que o erro apareceu deve estar "falhou", com a evidência anexada. Se NENHUM cenário falhar, o erro NÃO foi confirmado: diga isso na nota do último cenário (não force falha).`
    + REGRAS(c.dir, c.gravar);
}

// ── Tela ──
const CSS = `<style>${cardCenario.CSS}
  .rp-res { font-size: 12.5px; line-height: 1.6; } .rp-res b { color: var(--text); }
  .rp-ok { color: var(--ok, #3fb950); } .rp-no { color: var(--warn, #d29922); }
  .rp-ev { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .rp-ev .cev { cursor: pointer; }
  .cens { margin: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
  .cen .cdet code { display: block; white-space: pre-wrap; font-size: 11px; margin: 4px 0; color: var(--text); }
</style>`;
const IMG = /\.(png|jpe?g|gif|webp)$/i;

/** Aba "Reprodução": cenários (card do QA), o que falhou e as evidências já presentes no ticket. d: { uri(arquivo) → URI da webview }. */
function corpo(t, d, dir) {
  const grav = (() => { try { return require('./dossie').lerGravado(dir); } catch { return null; } })();
  const tipo = d?.jira?.tipo || grav?.tipoTicket || '';
  const r = resultado(dir), exige = ehBug(tipo) || grav?.exigeReproducao || r.passos.length > 0;
  if (!exige) return `${CSS}<div class="folha"><div class="vazio-aba">Esta etapa vale para tickets do tipo Bug, Defeito ou Incidente${tipo ? ` (este é ${esc(tipo)})` : ''}.</div></div>`;
  const uri = d?.uri || (() => ''), ctx = { dir, uri, arquivos: (x) => fluxo.arquivosDe(dir, x), acoes: { abrir: 'fluxoAbrir', pasta: 'fluxoPasta', copiar: 'fluxoCopiar', refazer: 'fluxoRefazer' } };
  const ev = evidenciasDoTicket(dir);
  const miniatura = (e) => { const f = path.join(dir, e.arquivo); return `<span class="cev" data-acao="fluxoAbrir" data-nome="${esc(f)}" title="${esc(e.nome)}${e.de ? ` · de ${esc(e.de)}` : ''}">${IMG.test(e.nome) && uri(f) ? `<img src="${esc(uri(f))}">` : esc(path.extname(e.nome).slice(1).toUpperCase() || 'ARQ')}</span>`; };
  const resumo = !r.passos.length ? 'A reprodução ainda não rodou: ela acontece quando a esteira assume o ticket, antes do Entendimento.'
    : r.confirmou ? `<span class="rp-ok">Erro confirmado</span>: ${r.falhou.length} cenário(s) falharam${r.semEvidencia.length ? ` · <span class="rp-no">sem evidência: ${esc(r.semEvidencia.map((p) => p.id).join(', '))}</span>` : ''}.`
    : r.pendentes.length ? 'Reprodução em andamento.' : '<span class="rp-no">Erro não confirmado</span>: nenhum cenário falhou.';
  return `${CSS}<div class="caixa-t">Reprodução do bug<span>${r.passos.filter((p) => p.status !== 'pendente').length}/${r.passos.length} cenários</span></div>
  <div class="folha"><div class="rp-res">Tipo do ticket: <b>${esc(tipo || '—')}</b><br>${resumo}</div></div>
  ${r.passos.length ? `<div class="cens">${r.passos.map((p) => cardCenario.card({ ...p, resumo: [p.texto, p.acao && `Ação: ${p.acao}`].filter(Boolean).join('\n') }, ctx)).join('')}</div>` : ''}
  <div class="caixa-t">Evidências do ticket, do pai e dos irmãos<span>${ev.length}</span></div>
  <div class="folha">${ev.length ? `<div class="rp-ev">${ev.map(miniatura).join('')}</div>` : '<div class="vazio-aba">Nenhum print, vídeo ou log encontrado nos anexos.</div>'}</div>`;
}

module.exports = { corpo, prompt, resultado, gravarResumo, coletarEvidencias, evidenciasDoTicket, reiniciar, BIN, PASTA, INDICE, ehBug, _teste: { comEvidencia } };
