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
const base = (dir, ordem, falha) => ({
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
    if (/massa/.test(titulo)) fs.writeFileSync(path.join(dir, 'massa-teste.sql'), "insert into tarefa (id_tarefa) values (111111);");
    if (/emulador/.test(titulo)) { fs.mkdirSync(path.join(dir, 'evidencias'), { recursive: true }); fs.writeFileSync(path.join(dir, 'evidencias', '01-tela.png'), 'x'); fs.writeFileSync(path.join(dir, '.reproducao-claude.json'), JSON.stringify({ ok: true, acao: 'repetiu', prints: [{ arquivo: '01-tela.png', legenda: 'Tela' }] })); }
    if (/resumo/.test(titulo)) fs.writeFileSync(path.join(dir, 'resumo.md'), '# ok');
    return true;
  }
});
const servicos = (dir) => ({ pastaAba: () => dir });

(async () => {
  // Caminho feliz: ordem Emulador, API, Metro, Start; Start só depois do Metro; massa antes de tudo.
  let dir = mk(), ordem = [];
  fs.writeFileSync(path.join(dir, 'massa-real.sql'), real);
  fs.writeFileSync(path.join(dir, '.mergulho.json'), JSON.stringify({ etapa: 4, fase: 'rodando', obsPO: 'nota' }));
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem));
  const cmds = ordem.filter((x) => /^(emulador|cmd:)/.test(x));
  assert.deepStrictEqual(cmds, ['emulador', 'cmd:API', 'cmd:Metro', 'cmd:Start']);
  assert.ok(ordem.indexOf('sql') < ordem.indexOf('emulador'));
  const m = ler(dir, '.mergulho.json');
  assert.deepStrictEqual([m.etapa, m.fase, m.obsPO], [6, 'concluido', 'nota']);
  const r = ler(dir, 'reproducao.json');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.midias, [{ tipo: 'print', arquivo: 'evidencias/01-tela.png', legenda: 'Tela' }]);
  assert.ok(fs.existsSync(path.join(dir, 'resumo.md')));

  // Passo falha (Start não sobe): pausa com pergunta e não conclui.
  dir = mk(); ordem = [];
  fs.writeFileSync(path.join(dir, 'massa-real.sql'), real);
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem, 'start'));
  const p = ler(dir, '.mergulho.json');
  assert.strictEqual(p.fase, 'pausado');
  assert.ok(p.pausa.motivo && p.pausa.pergunta && p.pausa.opcoes.length);
  assert.ok(!ordem.includes('gravar') && !fs.existsSync(path.join(dir, 'resumo.md')));

  // Massa que mexe na Massa Real: nada é executado no banco.
  dir = mk(); ordem = [];
  fs.writeFileSync(path.join(dir, 'massa-real.sql'), real);
  fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'update tarefa set status = 1 where id_tarefa = 987654;');
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, base(dir, ordem));
  assert.strictEqual(ler(dir, '.mergulho.json').fase, 'pausado');
  assert.ok(!ordem.includes('sql'));

  // ⏸ no meio da subida do ambiente: a rodada é cancelada, nada mais roda e a fase não vira erro nem concluído.
  const controle = require('./controle');
  dir = mk(); ordem = [];
  fs.writeFileSync(path.join(dir, 'massa-real.sql'), real);
  const rodada = controle.nova(dir), d = base(dir, ordem);
  d.comandos.rodar = (n) => { ordem.push(`cmd:${n}`); if (n === 'API') controle.cancelar(dir); };
  await rep.executar(servicos(dir), { id: 'x', chave: 'WMS-1' }, { ...d, rodada });
  assert.ok(!ordem.includes('cmd:Metro') && !ordem.includes('cmd:Start') && !ordem.includes('gravar'));
  assert.ok(!['erro', 'concluido'].includes(ler(dir, '.mergulho.json').fase));
  console.log('ok');
})();
