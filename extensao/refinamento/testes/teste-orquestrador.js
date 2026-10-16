// @ts-check
// node refinamento/testes/teste-orquestrador.js — orquestrador do refinamento: carrega com o mock do vscode, expõe a interface e
// avisarImpactos marca como erro o que o Claude deixou sem registro. (etapa/seguir/vigia chamam o claude e o Jira: não testados aqui.)
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-home-'));
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
Module._load = (r, ...a) =>
  r === 'vscode'
    ? new Proxy(
        {},
        {
          get: (_, k) =>
            k === 'workspace'
              ? { getConfiguration: () => ({ get: () => undefined }) }
              : new Proxy(function () {}, { get: () => () => {}, apply: () => Promise.resolve() })
        }
      )
    : load(r, ...a);
const orq = require('../orquestrador');
const tickets = require('../../infra/ticket/tickets');
const { NIVEL } = require('../etapas/comentarios');

for (const n of [
  'iniciar',
  'etapa',
  'seguir',
  'filaTarefas',
  'vigiarComentarios',
  'sdd',
  'estadoDe',
  'reposDe',
  'avisarImpactos'
])
  assert.strictEqual(typeof orq[n], 'function', n);
assert.deepStrictEqual(orq.respondidas, []);
assert.ok(NIVEL.alto && NIVEL.nenhum);

const chave = 'ORQ-1',
  dir = tickets.pasta(chave),
  arq = path.join(dir, '.impactos.json');
fs.mkdirSync(dir, { recursive: true });
const imp = (id, status, extra = {}) => ({
  id,
  autor: 'Fulano',
  data: '2026-10-08T10:00:00Z',
  link: 'https://j/' + id,
  texto: 'x',
  status,
  ...extra
});
fs.writeFileSync(
  arq,
  JSON.stringify([
    imp('1', 'triando'),
    imp('2', 'analisando'),
    imp('3', 'aplicando'),
    imp('4', 'analisado', { nivel: 'nenhum' }),
    imp('5', 'na_fila')
  ])
);
orq.iniciar(
  {
    render() {},
    gravar: (id, nome, dado) => fs.writeFileSync(path.join(tickets.pasta(id), nome), JSON.stringify(dado)),
    abrirAba() {},
    secrets: {}
  },
  { subscriptions: [] }
);
orq.avisarImpactos({ chave });
const l = JSON.parse(fs.readFileSync(arq, 'utf8'));
assert.deepStrictEqual(
  l.map((i) => i.status),
  ['erro', 'erro', 'erro', 'analisado', 'na_fila']
);
assert.match(l[0].resumo, /triagem/);
assert.match(l[1].resumo, /análise/);
assert.match(l[2].resumo, /aplicação/);
assert.strictEqual(l[3].avisado, true, 'impacto resolvido é marcado como avisado (nível "nenhum" não notifica)');

// Memória do passo: ajuste e respostas rodam em execução nova (continuar=false) e o prompt traz passo, artefato, memória e pedido.
const maestro = require('../../infra/agentes/maestro');
const chamadas = [];
maestro.rodar = (p, o) => {
  chamadas.push(o);
  return true;
};
const tk = { chave, spec: { repo: dir, dir: 'spec-x' } };
orq.ajustar(tk, 3, 'troque o índice');
assert.strictEqual(chamadas[0].continuar, false);
assert.match(chamadas[0].prompt, /plan\.md/);
assert.match(chamadas[0].prompt, /troque o índice/);
assert.match(chamadas[0].prompt, /Não há memória/);
assert.match(chamadas[0].prompt, /Ajuste \d{4}-\d\d-\d\d/);
const area = require('../../infra/agentes/area-ia').areaIA(dir);
assert.strictEqual(orq.memoriaPasso(tk, 3), path.join(area, '.memoria-passo-3.md'));
assert.ok(fs.existsSync(area), 'etapa cria a área da IA');
assert.ok(chamadas[0].extras.includes(area), 'área da IA entra no --add-dir');
fs.writeFileSync(orq.memoriaPasso(tk, 3), 'decisão X');
assert.ok(orq.promptAjuste(tk, 3, 'y').includes(orq.memoriaPasso(tk, 3)));
assert.doesNotMatch(orq.promptAjuste(tk, 3, 'y'), /Não há memória/);
orq.aplicarRespostas(tk, 3, ['Q1 → sim']);
assert.strictEqual(chamadas[1].continuar, false);
assert.match(chamadas[1].prompt, /Q1 → sim/);
assert.match(chamadas[1].prompt, /\.memoria-passo-3\.md/);
assert.match(orq.promptRespostas(tk, 3, ['a']), /grave com .*refinamento-gravar \.memoria-passo-3\.md/);

// Passo 3 em subetapas: 3.1 só mapeia (sem plan.md/concluir); 3.2 só roda com os mapas em disco, lê os mapas e conclui; estado no ticket.
const ch3 = 'ORQ-3',
  dir3 = tickets.pasta(ch3),
  spec3 = path.join(dir3, 'repo', 'spec-y');
fs.mkdirSync(spec3, { recursive: true });
const passos = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ n, titulo: `P${n}`, status: n < 3 ? 'aprovado' : 'pendente' }));
const estadoArq = path.join(spec3, ['sdd', 'state.json'].join('-'));
fs.writeFileSync(estadoArq, JSON.stringify({ proximoPasso: 3, perguntas: [], achados: [], passos }));
const t3 = { chave: ch3, id: ch3, spec: { repo: path.join(dir3, 'repo'), dir: 'spec-y' } };
tickets.gravar({ ...t3, conversas: [], refinamento: { estado: 'rodando' } });
const sub = () => tickets.ler(ch3).refinamento.sub3;
chamadas.length = 0;
assert.strictEqual(orq.seguir(t3), true);
assert.match(chamadas[0].prompt, /SUBETAPA 3\.1/);
assert.match(chamadas[0].prompt, /NÃO escreva o plan\.md e NÃO rode concluir/);
assert.doesNotMatch(
  chamadas[0].prompt,
  /grave com .*\.memoria-passo-3\.md/,
  'o mapeamento não escreve a memória do passo'
);
assert.strictEqual(chamadas[0].continuar, false);
assert.strictEqual(sub().mapa, 'rodando');
assert.deepStrictEqual(
  orq.subetapas3(t3, passos[3], true).map((x) => x.estado),
  ['rodando', 'pendente']
);
// Terminou sem mapas: erro, a 3.2 não começa e o Ao vivo recebe o motivo.
chamadas[0].aoMudar();
assert.strictEqual(sub().mapa, 'erro');
assert.strictEqual(chamadas.length, 1);
// Retoma a 3.1 (não há mapas); agora ela deixa o mapa e a extensão segue sozinha para a 3.2.
assert.strictEqual(orq.seguir(t3), true);
assert.match(chamadas[1].prompt, /SUBETAPA 3\.1/);
fs.writeFileSync(path.join(spec3, 'mapa-backend.md'), '# mapa');
chamadas[1].aoMudar();
assert.strictEqual(sub().mapa, 'concluida');
assert.strictEqual(chamadas.length, 3);
const p2 = chamadas[2].prompt;
assert.match(p2, /SUBETAPA 3\.2/);
assert.match(p2, /NÃO o refaça/);
assert.match(p2, /mapa-backend\.md/);
assert.match(p2, /plan\.md/);
assert.match(p2, /concluir 3/);
assert.match(p2, /\.memoria-passo-3\.md/);
assert.strictEqual(sub().plano, 'rodando');
assert.deepStrictEqual(
  orq.subetapas3(t3, passos[3], true).map((x) => x.estado),
  ['concluida', 'rodando']
);
// Recarregar com a 3.1 concluída: retoma direto na 3.2. Mapas sumidos: erro claro e nada roda.
assert.strictEqual(orq.seguir(t3), true);
assert.match(chamadas[3].prompt, /SUBETAPA 3\.2/);
fs.rmSync(path.join(spec3, 'mapa-backend.md'));
assert.strictEqual(orq.seguir(t3), false);
assert.strictEqual(chamadas.length, 4);
assert.strictEqual(sub().mapa, 'erro');
// Passo concluído: as duas aparecem concluídas.
assert.deepStrictEqual(
  orq.subetapas3(t3, { status: 'aguardando_revisao' }, false).map((x) => x.estado),
  ['concluida', 'concluida']
);
// O Ao vivo grava com atraso (fila): confere os dois erros depois.
setTimeout(() => {
  const log = fs.readFileSync(path.join(dir3, '.ao-vivo.jsonl'), 'utf8');
  assert.match(log, /terminou sem gravar mapa-backend\.md/);
  assert.match(log, /3\.2 não começou/);
  console.log('orquestrador ok');
  process.exit(0); // o vigia deixa um setTimeout de 20 s
}, 2500);

// Tipo do ticket (hierarquia): só "quebrar" muda o prompt.
const tq = 'ORQ-TIPO';
fs.mkdirSync(tickets.pasta(tq), { recursive: true });
tickets.gravar({ chave: tq, refinamento: { papel: 'quebrar', tipoTicket: 'Epic', filho: 'Feature' } });
assert.deepStrictEqual(orq.papelDoTicket({ chave: tq }), { papel: 'quebrar', tipo: 'Epic', filho: 'Feature' });
assert.match(orq.blocoTipo({ chave: tq }), /papel: quebrar/);
assert.match(orq.blocoTipo({ chave: tq }), /"Feature"/);
assert.match(orq.blocoTipo({ chave: tq }), /Decomposição/);
tickets.gravar({ chave: tq, refinamento: { papel: 'desenvolver' } });
assert.strictEqual(orq.blocoTipo({ chave: tq }), '');
assert.strictEqual(orq.papelDoTicket({ chave: 'SEM-TICKET' }).papel, 'desenvolver'); // refinamento antigo, sem papel
console.log('orquestrador tipo ok');
