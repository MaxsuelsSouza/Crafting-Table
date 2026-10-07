const vscode = require('vscode');
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { esc } = require('./ticket')._teste;
const { pagina, icone, ESTILO_NOTAS } = require('./comandos').ui;
const { RAIZ } = require('./sessao');

// Segredos para o Claude USAR sem receber o valor. Valores no SecretStorage do VS Code (cifrado pelo
// chaveiro do sistema); só nomes e a flag env ficam no globalState. O Claude roda `bin/cofre '<comando>'`:
// o comando executa AQUI, com os segredos env no ambiente, e a saída volta mascarada. Não existe
// pedido "me dá o valor" no protocolo.
// ponytail: o Claude roda como o usuário; um comando que transforma o valor (rev, cut, xxd) escapa da
// máscara. Protege contra vazamento acidental (log, echo, erro), não contra quem quer extrair.
const SOCKET = path.join(RAIZ, '.cofre.sock');
const NOMES = path.join(RAIZ, '.cofre-nomes'); // só nomes, para o hook avisar o Claude
const NOME_VALIDO = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const MAX = 256;

// Cada valor e as formas em que ele costuma vazar: puro, base64, URL e as aspas do JSON.
function mascarar(texto, valores) {
  for (const v of valores) {
    for (const forma of new Set([v, Buffer.from(v).toString('base64'), encodeURIComponent(v), JSON.stringify(v).slice(1, -1)])) {
      if (forma.length >= 3) texto = texto.split(forma).join('••••');
    }
  }
  return texto;
}

const estiloCofre = ESTILO_NOTAS + `<style>
  .aviso { display: flex; gap: 8px; margin: 0 12px 10px; padding: 8px 10px; font-size: 11px; line-height: 1.5; color: var(--text-dim);
    border-radius: var(--r-lg); background: color-mix(in srgb, var(--accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); }
  .aviso code { font-size: 10.5px; }
  .cartoes > li { display: flex; align-items: center; gap: 10px; }
  .cadeado { flex: none; width: 32px; height: 32px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center;
    color: #e3a43b; background: color-mix(in srgb, #e3a43b 14%, transparent); }
  .off .cadeado { color: var(--text-dim); background: var(--surface-2); }
  .cadeado svg { width: 16px; height: 16px; }
  .corpo { flex: 1; min-width: 0; }
  .corpo .nome { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .corpo .valor { font-size: 11px; letter-spacing: .15em; color: var(--text-dim); margin-top: 2px; }
  .chave { flex: none; display: flex; align-items: center; gap: 6px; height: 26px; background: none; padding: 0 6px; border-radius: var(--r-md);
    font-weight: 500; font-size: 11px; color: var(--text-dim); }
  .chave:hover { background: var(--surface-2); }
  .trilho { width: 26px; height: 14px; border-radius: 7px; background: rgba(128,128,128,.4); position: relative; transition: background .15s; }
  .trilho::after { content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: #fff; transition: left .15s; }
  .chave[aria-checked="true"] { color: var(--ok); }
  .chave[aria-checked="true"] .trilho { background: var(--ok); }
  .chave[aria-checked="true"] .trilho::after { left: 14px; }
</style>`;

const CADEADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';

const tela = (itens) => `${estiloCofre}
  <div class="topo"><span class="rotulo">Cofre</span><span class="titulo"></span>
    <span class="extra">${itens.length ? `${itens.length} segredo${itens.length === 1 ? '' : 's'}` : ''}</span></div>
  <div class="barras">
    <span class="dica">${itens.length ? `${itens.filter((s) => s.env).length} liberado${itens.filter((s) => s.env).length === 1 ? '' : 's'} para o Claude` : ''}</span>
    <span class="espaco"></span>
    <button class="primario" data-acao="adicionar">＋ Segredo</button>
  </div>
  <div class="aviso"><span>🔒</span><span>Com a chave <b>Claude</b> ligada, o Claude usa o segredo como <code>$NOME</code> pelo comando <code>cofre</code>, sem ver o valor.</span></div>
  ${itens.length ? `<ul class="cartoes">${itens.map((s) => `<li class="${s.env ? '' : 'off'}">
    <span class="cadeado">${CADEADO}</span>
    <div class="corpo"><div class="nome">${esc(s.nome)}</div><div class="valor">••••••••</div></div>
    <span class="mini">
      <button data-acao="mencionar" data-id="${esc(s.nome)}" title="Mencionar no Claude">@</button>
      <button class="ico" data-acao="editar" data-id="${esc(s.nome)}" title="Trocar o valor">${icone('editar')}</button>
      <button class="ico perigo" data-acao="remover" data-id="${esc(s.nome)}" title="Remover">${icone('lixo')}</button>
    </span>
    <button class="chave" role="switch" aria-checked="${s.env}" data-acao="env" data-id="${esc(s.nome)}"
      title="${s.env ? 'O Claude pode usar (clique para bloquear)' : 'Bloqueado para o Claude (clique para liberar)'}"><span class="trilho"></span>Claude</button>
  </li>`).join('')}</ul>`
    : '<div class="folha"><div class="centro"><div class="icone">🔑</div>Nenhum segredo guardado.<br>Clique em <b>＋ Segredo</b>.</div></div>'}`;

const pedirValor = (nome) => vscode.window.showInputBox({
  title: `Valor de ${nome}`, password: true, ignoreFocusOut: true,
  validateInput: (v) => (!v ? 'Informe o valor' : v.length > MAX ? `Máximo de ${MAX} caracteres (tem ${v.length})` : null)
});

exports.provider = (ctx) => {
  const itens = () => ctx.globalState.get('cofre', []); // [{ nome, env }]
  const salvar = async (l) => {
    await ctx.globalState.update('cofre', l);
    fs.writeFileSync(NOMES, l.filter((s) => s.env).map((s) => s.nome).join('\n'));
    render();
  };
  let view;
  const render = () => view && (view.webview.html = pagina(crypto.randomBytes(16).toString('hex'), tela(itens())));

  const acoes = {
    async adicionar() {
      const nome = await vscode.window.showInputBox({
        title: 'Nome do segredo', placeHolder: 'NOME_DA_CHAVE', ignoreFocusOut: true,
        validateInput: (n) => (!NOME_VALIDO.test(n) ? 'Só MAIÚSCULAS, números e _ (ex.: SENHA_BANCO_QA)'
          : itens().some((s) => s.nome === n) ? 'Já existe um segredo com esse nome' : null)
      });
      if (!nome) return;
      const valor = await pedirValor(nome);
      if (!valor) return;
      await ctx.secrets.store(`cofre:${nome}`, valor);
      await salvar([...itens(), { nome, env: true }]);
    },
    async editar({ id }) {
      const valor = await pedirValor(id);
      if (valor) await ctx.secrets.store(`cofre:${id}`, valor);
    },
    async remover({ id }) {
      const ok = await vscode.window.showWarningMessage(`Remover o segredo ${id}?`, { modal: true }, 'Remover');
      if (!ok) return;
      await ctx.secrets.delete(`cofre:${id}`);
      await salvar(itens().filter((s) => s.nome !== id));
    },
    mencionar({ id }) {
      const s = itens().find((x) => x.nome === id);
      require('./claude').mencionar(s?.env
        ? `$${id} (segredo do Cofre: use rodando ~/.vscode/extensions/claude-abas/bin/cofre '<comando que usa $${id}>'; o valor não aparece)`
        : `$${id} (segredo do Cofre, bloqueado para o Claude: peça para liberar na aba Cofre)`);
    },
    env: ({ id }) => salvar(itens().map((s) => (s.nome === id ? { ...s, env: !s.env } : s)))
  };

  // Servidor local: recebe {comando, cwd}, roda com os segredos env e devolve a saída mascarada.
  fs.mkdirSync(RAIZ, { recursive: true });
  try { fs.unlinkSync(SOCKET); } catch {}
  const servidor = net.createServer((sock) => {
    let buf = '';
    sock.on('data', async (d) => {
      buf += d;
      if (!buf.includes('\n')) return;
      let pedido;
      try { pedido = JSON.parse(buf.slice(0, buf.indexOf('\n'))); } catch { return sock.end(JSON.stringify({ fim: 2 }) + '\n'); }
      buf = '\0'; // só um pedido por conexão
      if (pedido.nomes) return sock.end(JSON.stringify({ saida: itens().filter((s) => s.env).map((s) => s.nome).join('\n') + '\n' }) + '\n' + JSON.stringify({ fim: 0 }) + '\n');
      const env = { ...process.env };
      const valores = [];
      for (const s of itens().filter((x) => x.env)) {
        const v = await ctx.secrets.get(`cofre:${s.nome}`);
        if (v) { env[s.nome] = v; valores.push(v); }
      }
      const filho = spawn('bash', ['-c', String(pedido.comando || '')], { cwd: pedido.cwd || RAIZ, env });
      const enviar = (canal) => (b) => sock.writable && sock.write(JSON.stringify({ [canal]: mascarar(b.toString(), valores) }) + '\n');
      filho.stdout.on('data', enviar('saida'));
      filho.stderr.on('data', enviar('erro'));
      filho.on('close', (code) => sock.writable && sock.end(JSON.stringify({ fim: code ?? 1 }) + '\n'));
      sock.on('close', () => filho.exitCode === null && filho.kill());
    });
    sock.on('error', () => {});
  });
  servidor.listen(SOCKET, () => fs.chmodSync(SOCKET, 0o600));
  fs.writeFileSync(NOMES, itens().filter((s) => s.env).map((s) => s.nome).join('\n'));

  return vscode.Disposable.from(
    { dispose: () => { servidor.close(); try { fs.unlinkSync(SOCKET); } catch {} } },
    require('./grupo').registrar('claudeAbas.cofre', {
      resolveWebviewView(v) {
        view = v;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((m) => acoes[m.acao]?.(m));
        render();
      }
    })
  );
};

exports._teste = { mascarar, NOME_VALIDO };
