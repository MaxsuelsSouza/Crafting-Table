// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');

// Conexão com a ferramenta de gestão de trabalho e mapeamento por IA.
// Parte pura (testável, em _teste): lista de provedores derivada do registro, entrada/prompt do mapeamento e validação da saída da IA.
// Parte com efeito (conectar, mapear): usa o vscode, o SecretStorage e o maestro (claude -p). O token NUNCA vai para a IA:
// a IA só lê entrada.json (metadados da conta + definições das variáveis) e grava saida.json.

// Provedores conhecidos (o que a tela lista). `disponivel` não é fixo: vem de haver adaptador no registro (provedores/index.js ADAPTADORES).
const CATALOGO = [
  { id: 'jira', nome: 'Jira', sigla: 'J' }, { id: 'monday', nome: 'Monday', sigla: 'M' }, { id: 'linear', nome: 'Linear', sigla: 'L' },
  { id: 'notion', nome: 'Notion', sigla: 'N' }, { id: 'clickup', nome: 'ClickUp', sigla: 'C' }, { id: 'azure', nome: 'Azure DevOps', sigla: 'A' }
];
/** Lista da tela: o catálogo com `disponivel` = existe adaptador em `adaptadores` (padrão: o registro real); os demais são "em breve". */
const listaProvedores = (adaptadores = require('../provedores').ADAPTADORES) => CATALOGO.map((p) => ({ ...p, disponivel: typeof adaptadores[p.id] === 'function' }))
  .sort((a, b) => Number(b.disponivel) - Number(a.disponivel));

// ── Mapeamento por IA ──
// Fora de ~/.claude: o Claude Code nega escrita lá no claude -p (infra/area-ia.js).
const pastaMapeamento = () => path.join(require('../infra/area-ia').RAIZ, 'mapeamento');
const norm = (x) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const SEGREDO = /token|senha|password|secret|authorization|credencia/i;
/** Copia o objeto sem nenhuma chave que pareça segredo (defesa: a entrada da IA nunca leva credencial). */
const semSegredos = (o) => (Array.isArray(o) ? o.map(semSegredos) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).filter(([k]) => !SEGREDO.test(k)).map(([k, v]) => [k, semSegredos(v)])) : o);

/** Conteúdo de entrada.json: descoberta + definições das variáveis + valores atuais. */
const montarEntrada = (provedor, descoberta, definicoes, atuais = {}) => semSegredos({
  provedor, descoberta,
  variaveis: definicoes.map((d) => ({ chave: d.chave, rotulo: d.rotulo, descricao: d.descricao, tipo: d.tipo, valorAtual: atuais[d.chave] ?? (d.tipo === 'lista' ? [] : '') }))
});

/** Valores que existem na conta, por variável (nomes normalizados → original). Só o que está aqui pode ser aplicado. */
function valoresPermitidos(descoberta, definicoes) {
  const d = descoberta || {};
  const conj = (xs) => new Map((xs || []).filter((x) => x !== undefined && x !== null && x !== '').map((x) => [norm(x), String(x)]));
  const etapas = (d.boards || []).flatMap((b) => (b.etapas || []).map((e) => e.nome));
  const status = conj([...(d.status || []), ...etapas]);
  const porChave = { site: conj([d.site]), projeto: conj((d.projetos || []).map((p) => p.chave)), ticket: conj((d.tiposItem || []).map((t) => t.nome)),
    tipoIncidente: conj((d.tiposItem || []).map((t) => t.nome)), etapas: conj(etapas.length ? etapas : [...status.values()]) };
  return Object.fromEntries(definicoes.map((df) => [df.chave, porChave[df.chave]
    || (df.escolha === 'boards' ? conj((d.boards || []).map((b) => b.nome)) : df.escolha === 'labels' ? conj(d.labels) : df.escolha === 'status' ? status : new Map())]));
}

/** Separa os valores que existem na descoberta dos que não. Alternativas "a|b" (etapas de QA) valem se cada parte existir. */
function filtrarValores(valores, permitidos) {
  const validos = [], invalidos = [];
  for (const v of valores) (String(v).split('|').map((x) => x.trim()).filter(Boolean).every((p) => permitidos.has(norm(p))) ? validos : invalidos).push(v);
  return { validos, invalidos };
}

/**
 * Confere a saída da IA ({ chave: { valor, justificativa } }): chave conhecida, tipo certo (texto = string, lista = array de strings) e valores
 * presentes na descoberta. Devolve { aceitas: [{ chave, valor, justificativa }], rejeitadas: [{ chave, motivo }] }.
 */
function validarSaida(saida, descoberta, definicoes) {
  const aceitas = [], rejeitadas = [];
  if (!saida || typeof saida !== 'object' || Array.isArray(saida)) return { aceitas, rejeitadas: [{ chave: '(saída)', motivo: 'a saída não é um objeto { chave: { valor, justificativa } }' }] };
  const permitidos = valoresPermitidos(descoberta, definicoes);
  for (const [chave, item] of Object.entries(saida)) {
    const d = definicoes.find((x) => x.chave === chave);
    const rej = (motivo) => rejeitadas.push({ chave, motivo });
    if (!d) { rej('variável desconhecida'); continue; }
    if (!item || typeof item !== 'object' || !('valor' in item)) { rej('faltou { valor, justificativa }'); continue; }
    const { valor } = item, justificativa = String(item.justificativa ?? '').trim();
    if (d.tipo === 'lista' ? !Array.isArray(valor) || valor.some((x) => typeof x !== 'string') : typeof valor !== 'string') { rej(`tipo errado: esperava ${d.tipo === 'lista' ? 'lista de textos' : 'texto'}`); continue; }
    const itens = d.tipo === 'lista' ? valor.map((x) => x.trim()).filter(Boolean) : [valor.trim()].filter(Boolean);
    if (!itens.length) { rej('valor vazio'); continue; }
    const { validos, invalidos } = filtrarValores(itens, permitidos[chave]);
    if (invalidos.length) { rej(`valor fora da conta: ${invalidos.join(', ')}`); continue; }
    // Troca pelo nome exato da conta (a IA pode ter errado só a caixa).
    const exato = (v) => v.split('|').map((p) => permitidos[chave].get(norm(p)) ?? p.trim()).join('|');
    aceitas.push({ chave, valor: d.tipo === 'lista' ? validos.map(exato) : exato(validos[0]), justificativa });
  }
  return { aceitas, rejeitadas };
}

/** Prompt do mapeamento: a IA lê entrada.json e grava saida.json. Não leva credencial (só caminhos e regras). */
const montarPrompt = (pasta) => `[segundo plano] [Crafting Table · mapeamento das variáveis do provedor]
Você vai mapear as variáveis da extensão para a conta de gestão de trabalho do usuário.
1. Leia ${path.join(pasta, 'entrada.json')}: "descoberta" tem os metadados da conta (projetos, boards com colunas, status, tipos de item, labels) e "variaveis" tem cada variável (chave, rótulo, descrição, tipo texto ou lista, valorAtual).
2. Grave ${path.join(pasta, 'saida.json')} com um objeto JSON: { "<chave>": { "valor": <texto ou lista de textos, conforme o tipo>, "justificativa": "<uma frase em português dizendo por que>" } }.
Regras:
- Use SOMENTE valores que existem na descoberta, escritos exatamente como lá (nomes de board, status, tipos de item, labels, chaves de projeto). Nunca invente.
- Tipo "texto": valor é um texto. Tipo "lista": valor é uma lista de textos. Em etapas de QA, um nome alternativo do mesmo status se escreve com "|" (ex.: "Pronto para QA|Pronto p/ QA").
- Omita a variável quando não houver correspondência segura. Se já há valorAtual coerente, pode repeti-lo.
- Leia e escreva apenas nessa pasta. Não use rede, não rode comandos e não procure credenciais.
- Responda com uma frase curta ao terminar.`;

/** Última fala ou erro do Ao vivo da pasta (o que a IA disse ao terminar), para explicar uma falha. */
function ultimaFala(pasta) {
  try {
    const linhas = fs.readFileSync(path.join(pasta, '.ao-vivo.jsonl'), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const l = linhas.reverse().find((x) => x && (x.tipo === 'fala' || x.tipo === 'erro'));
    return l ? String(l.detalhe || l.texto).slice(0, 300) : '';
  } catch { return ''; }
}

/** Lê e confere o saida.json; devolve { aceitas, rejeitadas } ou lança erro legível. */
function lerSaida(pasta, descoberta, definicoes) {
  let texto;
  try { texto = fs.readFileSync(path.join(pasta, 'saida.json'), 'utf8'); } catch {
    const ultima = ultimaFala(pasta);
    throw new Error(`A IA não gravou o saida.json${ultima ? `. Última mensagem dela: "${ultima}"` : ''}`);
  }
  let json;
  try { json = JSON.parse(texto); } catch { throw new Error('O saida.json não é um JSON válido'); }
  return validarSaida(json, descoberta, definicoes);
}

// O que a IA mapeia: tudo menos site e projetos, que a pessoa escolhe (o mapeamento parte deles).
const NAO_MAPEAVEIS = ['site', 'projeto'];
const MAPEAVEIS = (defs) => defs.filter((d) => !NAO_MAPEAVEIS.includes(d.chave));

// ── Efeitos (VS Code) ──
const TEMPO_MAX = 5 * 60 * 1000;

/** Roda o mapeamento: descobre, grava a entrada, roda o claude -p e oferece as variáveis. `aoTerminar` redesenha a tela. */
async function mapear(ctx, { aoTerminar = () => {} } = {}) {
  const vscode = require('vscode'), maestro = require('../painel/maestro'), variaveis = require('../provedores/variaveis');
  const { provedorAtivo } = require('../provedores');
  const provedor = provedorAtivo(), pasta = pastaMapeamento();
  const site = String(variaveis.ler('site') || '');
  if (!site || !(await provedor.conectado(ctx.secrets))) return vscode.window.showWarningMessage(`Conecte ao ${provedor.nome} antes de mapear.`);
  // Só depois dos projetos: a IA mapeia boards, etapas e labels DELES (sem projeto, as sugestões não servem para nada).
  if (![].concat(variaveis.ler('projeto') || []).length) return vscode.window.showWarningMessage('Escolha os projetos antes de mapear com IA.');
  if (maestro.rodando(pasta)) return vscode.window.showInformationMessage('O mapeamento já está rodando.');
  const resultado = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Mapeando o ${provedor.nome} com IA`, cancellable: true }, async (progresso, cancelar) => {
    try {
      progresso.report({ message: 'lendo os metadados da conta…' });
      const descoberta = await provedor.descobrir(ctx.secrets, site, [].concat(variaveis.ler('projeto') || []));
      fs.mkdirSync(pasta, { recursive: true });
      fs.rmSync(path.join(pasta, 'saida.json'), { force: true });
      const atuais = Object.fromEntries(variaveis.todas().map((v) => [v.chave, v.valor]));
      fs.writeFileSync(path.join(pasta, 'entrada.json'), JSON.stringify(montarEntrada(provedor.id, descoberta, MAPEAVEIS(variaveis.definicoes), atuais), null, 2));
      progresso.report({ message: 'a IA está mapeando as variáveis…' });
      const modelo = vscode.workspace.getConfiguration('craftingTable').get('modelo');
      await new Promise((ok, falha) => {
        let fim = false;
        const terminar = (e) => { if (fim) return; fim = true; clearTimeout(timer); e ? falha(e) : ok(undefined); };
        const timer = setTimeout(() => { maestro.parar(pasta); terminar(new Error('Tempo esgotado (5 min) esperando a IA')); }, TEMPO_MAX);
        cancelar.onCancellationRequested(() => { maestro.parar(pasta); terminar(new Error('Cancelado')); });
        const comecou = maestro.rodar(pasta, { prompt: montarPrompt(pasta), titulo: 'Mapeando variáveis do provedor', cwd: pasta, ferramentas: ['Read', 'Write'],
          extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', pasta, ...(modelo ? ['--model', modelo] : [])],
          aoMudar: () => { if (!maestro.rodando(pasta)) terminar(); } });
        if (!comecou) terminar(new Error('Já há um mapeamento rodando'));
      });
      return { descoberta, ...lerSaida(pasta, descoberta, MAPEAVEIS(variaveis.definicoes)) };
    } catch (e) { return { erro: e.message }; }
  });
  if (resultado.erro) return vscode.window.showErrorMessage(`Mapeamento não concluído: ${resultado.erro}`);
  const { aceitas, rejeitadas } = resultado;
  if (!aceitas.length) return vscode.window.showWarningMessage(`A IA não sugeriu nenhuma variável válida.${rejeitadas.length ? ` Descartadas: ${rejeitadas.map((r) => `${r.chave} (${r.motivo})`).join('; ')}` : ''}`);
  const rotulo = (c) => variaveis.definicoes.find((d) => d.chave === c)?.rotulo || c;
  const escolhidas = await vscode.window.showQuickPick(aceitas.map((a) => ({ label: rotulo(a.chave), description: [].concat(a.valor).join(', '), detail: a.justificativa, picked: true, a })),
    { canPickMany: true, title: 'Aplicar estas variáveis?', placeHolder: rejeitadas.length ? `${rejeitadas.length} sugestão(ões) descartada(s) por não existirem na conta` : 'Desmarque o que não quiser aplicar', ignoreFocusOut: true });
  if (!escolhidas?.length) return;
  for (const x of escolhidas) await variaveis.gravar(x.a.chave, x.a.valor, 'ia');
  vscode.window.showInformationMessage(`${escolhidas.length} variável(is) aplicada(s).`);
  aoTerminar();
}

/** Conecta a um provedor: pede os campos, grava craftingTable.provedor e testa a conexão (eu). Devolve { nome } ou null. */
async function conectar(ctx, id) {
  const vscode = require('vscode'), variaveis = require('../provedores/variaveis'), credenciais = require('../provedores/credenciais');
  const { ADAPTADORES } = require('../provedores');
  if (typeof ADAPTADORES[id] !== 'function') return null;
  const provedor = ADAPTADORES[id]();
  const campoSite = provedor.camposCredencial.find((c) => c.variavel === 'site');
  const v = await credenciais.pedir(provedor, ctx.secrets, { incluirVariaveis: true, atuais: { site: String(variaveis.ler('site') || '') } });
  if (!v) return null;
  if (campoSite) await variaveis.gravar('site', v[campoSite.id]);
  await vscode.workspace.getConfiguration('craftingTable').update('provedor', id, vscode.ConfigurationTarget.Global);
  try { return await provedor.eu(ctx.secrets, String(variaveis.ler('site') || '')); } catch (e) {
    await provedor.sairConta(ctx.secrets);
    vscode.window.showErrorMessage(`Não consegui conectar ao ${provedor.nome}: ${e.message}`);
    return null;
  }
}

module.exports = { CATALOGO, listaProvedores, pastaMapeamento, conectar, mapear, _teste: { MAPEAVEIS, listaProvedores, montarEntrada, montarPrompt, validarSaida, filtrarValores, valoresPermitidos, semSegredos, lerSaida } };
