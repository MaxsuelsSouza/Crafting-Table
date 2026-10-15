// @ts-check
// node teste-reproducao.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const rep = require('./reproducao');
const { travaDml } = rep._teste;

// Trava: INSERT novo passa; mexer na chave real, DDL e comando vazio são recusados.
const real = "select * from tarefa where id_tarefa = 987654 and cod = 'PED-2024-77'";
assert.ok(travaDml("insert into tarefa (id_tarefa, cod) values (123456, 'PED-TESTE-1');", real).ok);
assert.ok(!travaDml('update tarefa set status = 1 where id_tarefa = 987654;', real).ok);
assert.ok(!travaDml("delete from tarefa where cod = 'PED-2024-77';", real).ok);
assert.ok(!travaDml('drop table tarefa;', real).ok);
assert.ok(!travaDml('  ', real).ok);

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rep-'));
const ler = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const base = (dir, ordem, falha, aprovada = true) => ({
  semPadrao: true, banco: { ambiente: 'copia-producao' }, esperar: async (teste) => teste(),
  comandos: { lista: () => [{ nome: 'API', comando: 'dotnet run' }, { nome: 'Metro', comando: 'yarn react-native start' }, { nome: 'Start', comando: 'yarn android' }],
    rodar: (n) => ordem.push(`cmd:${n}`) },
  emulador: { aparelhos: async () => (ordem.includes('emulador') ? [{ serial: 'e' }] : []), ligar: () => ordem.push('emulador'), pronto: async () => true },
  portaAberta: async (p) => ordem.includes(p === 5111 ? 'cmd:API' : 'cmd:Metro'),
  metroStatus: async () => true,
  appInstalado: async () => ordem.includes('cmd:Start') && falha !== 'start',
  executarSql: async (sql) => { ordem.push('sql'); return { ok: true, saida: '' }; },
  gravarTela: () => ordem.push('gravar'), pararTela: () => ordem.push('parar'),
  claude: async ({ titulo }) => {
    ordem.push(titulo);
    if (/fluxo/.test(titulo)) require('./fluxo').plano(dir, [{ titulo: 'Abrir a tela', texto: 'x' }, { titulo: 'Finalizar sem completar', texto: 'y' }]);
    if (/massa/.test(titulo)) { fs.writeFileSync(path.join(dir, 'massa-teste.sql'), "insert into tarefa (id_tarefa) values (111111);"); if (aprovada) rep.aprovarMassa(dir); } // aprovada: o dev já leu e aprovou
    if (/emulador/.test(titulo)) { fs.mkdirSync(path.join(dir, 'evidencias'), { recursive: true }); fs.writeFileSync(path.join(dir, 'evidencias', '01-tela.png'), 'x'); fs.writeFileSync(path.join(dir, '.reproducao-claude.json'), JSON.stringify({ ok: true, acao: 'repetiu', prints: [{ arquivo: '01-tela.png', legenda: 'Tela' }] })); }
    if (/resumo/.test(titulo)) fs.writeFileSync(path.join(dir, 'resumo.md'), '# ok');
    return true;
  }
});
const servicos = (dir) => ({ pastaAba: () => dir });
const novoDir = () => { const d = mk(); fs.writeFileSync(path.join(d, 'massa-real.sql'), real); fs.writeFileSync(path.join(d, '4-diagnostico.md'), '# dx'); return d; };

(async () => {
  // Caminho feliz: ordem Emulador, API, Metro, Start; Start só depois do Metro; massa antes de tudo.
  let dir = novoDir(), ordem = [];
  fs.writeFileSync(path.join(dir, '.mergulho.json'), JSON.stringify({ etapa: 4, fase: 'rodando', obsPO: 'nota' }));
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem));
  const cmds = ordem.filter((x) => /^(emulador|cmd:)/.test(x));
  assert.deepStrictEqual(cmds, ['emulador', 'cmd:API', 'cmd:Metro', 'cmd:Start']);
  assert.ok(ordem.indexOf('sql') < ordem.indexOf('emulador'));
  // ordem das subetapas: 5.1 fluxo, 5.2 massa (+ sql), 5.3 ambiente, 5.4 reprodução; todas concluídas e gravadas no estado
  const claudes = ordem.filter((x) => /^Incidente/.test(x));
  assert.deepStrictEqual(claudes, ['Incidente · Planejando o fluxo da reprodução', 'Incidente · Preparando a massa de teste', 'Incidente · Reproduzindo no emulador', 'Incidente · Escrevendo o resumo analítico']);
  assert.ok(ordem.indexOf(claudes[0]) < ordem.indexOf(claudes[1]) && ordem.indexOf(claudes[1]) < ordem.indexOf('sql') && ordem.indexOf('sql') < ordem.indexOf('emulador') && ordem.indexOf('cmd:Start') < ordem.indexOf(claudes[2]));
  assert.deepStrictEqual(rep.SUBETAPAS.map((x) => x.n), ['5.1', '5.2', '5.3', '5.4']);
  assert.deepStrictEqual(Object.values(ler(dir, '.mergulho.json').sub), ['concluida', 'concluida', 'concluida', 'concluida']);
  assert.strictEqual(rep.proximaSub(dir), null);
  const m = ler(dir, '.mergulho.json');
  assert.deepStrictEqual([m.etapa, m.fase, m.obsPO], [6, 'concluido', 'nota']);
  const r = ler(dir, 'reproducao.json');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.midias, [{ tipo: 'print', arquivo: 'evidencias/01-tela.png', legenda: 'Tela' }]);
  assert.ok(fs.existsSync(path.join(dir, 'resumo.md')));

  // Passo falha (Start não sobe): pausa com pergunta e não conclui.
  dir = novoDir(); ordem = [];
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem, 'start'));
  const p = ler(dir, '.mergulho.json');
  assert.strictEqual(p.fase, 'pausado');
  assert.ok(p.pausa.motivo && p.pausa.pergunta && p.pausa.opcoes.length);
  assert.ok(!ordem.includes('gravar') && !fs.existsSync(path.join(dir, 'resumo.md')));

  // Massa que mexe na Massa Real: nada é executado no banco.
  dir = novoDir(); ordem = [];
  fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'update tarefa set status = 1 where id_tarefa = 987654;');
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem));
  assert.strictEqual(ler(dir, '.mergulho.json').fase, 'pausado');
  assert.ok(!ordem.includes('sql'));

  // ⏸ no meio da subida do ambiente: a rodada é cancelada, nada mais roda e a fase não vira erro nem concluído.
  const controle = require('./controle');
  dir = novoDir(); ordem = [];
  const rodada = controle.nova(dir), d = base(dir, ordem);
  d.comandos.rodar = (n) => { ordem.push(`cmd:${n}`); if (n === 'API') controle.cancelar(dir); };
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, { ...d, rodada });
  assert.ok(!ordem.includes('cmd:Metro') && !ordem.includes('cmd:Start') && !ordem.includes('gravar'));
  assert.ok(!['erro', 'concluido'].includes(ler(dir, '.mergulho.json').fase));

  // 5.2 exige o fluxo.json: sem ele não chama o Claude da massa nem o banco e para com erro claro (subetapa 5.2 em "erro")
  dir = novoDir(); ordem = [];
  const { exigir } = rep._teste, S = rep.SUBETAPAS;
  assert.throws(() => exigir(dir, S[1]), /5\.2 Massa de teste precisa de fluxo\.json/);
  assert.throws(() => exigir(mk(), S[0]), /4-diagnostico\.md/);
  assert.doesNotThrow(() => exigir(dir, S[0]));
  const semFluxo = base(dir, ordem); const claudeOrig = semFluxo.claude;
  semFluxo.claude = async (o) => (/fluxo/.test(o.titulo) ? (ordem.push(o.titulo), true) : claudeOrig(o)); // o plano não grava nada
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, semFluxo);
  assert.strictEqual(ler(dir, '.mergulho.json').fase, 'pausado'); // 5.1 sem fluxo: pausa, e a 5.2 nem começa
  assert.ok(!ordem.includes('sql') && !ordem.some((x) => /massa/.test(x)));
  rep._teste.marcarSub(dir, 'plano', 'concluida'); // concluída sem artefato em disco não vale
  assert.strictEqual(rep.estadoSubs(dir).plano, 'pendente');

  // retomada: com 5.1 e 5.2 prontas (artefatos + estado) e a pausa no ambiente, recomeça no 5.3 sem chamar o Claude do fluxo/massa nem o banco
  dir = novoDir(); ordem = [];
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem, 'start'));
  assert.deepStrictEqual([ler(dir, '.mergulho.json').fase, rep.proximaSub(dir)?.n], ['pausado', '5.3']);
  assert.deepStrictEqual(rep.estadoSubs(dir), { plano: 'concluida', massa: 'concluida', ambiente: 'rodando', reproducao: 'pendente' });
  const ordem2 = [];
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem2));
  assert.ok(!ordem2.some((x) => /fluxo|massa/.test(x)) && !ordem2.includes('sql'));
  assert.deepStrictEqual([ler(dir, '.mergulho.json').fase, rep.proximaSub(dir)], ['concluido', null]);
  // erro no meio marca a subetapa em "erro" e a retomada recomeça nela
  dir = novoDir(); ordem = [];
  const quebra = base(dir, ordem); quebra.executarSql = async () => { throw new Error('banco caiu'); };
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, quebra);
  assert.deepStrictEqual([ler(dir, '.mergulho.json').fase, rep.estadoSubs(dir).massa, rep.proximaSub(dir)?.n], ['erro', 'erro', '5.2']);
  console.log('ok');
})();
