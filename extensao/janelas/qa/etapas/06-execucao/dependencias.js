// @ts-check
// Dependências externas da Etapa 6 (a jornada 6.2): o ambiente (infra/ambientes: flow, bipe, prints), banco só leitura, API (api.js) e ~/.wms-testes.env.
// d = dependências do painel (abas/acoes/dependencias.js): d.ambiente, d.adb, d.serial, d.banco.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { consultar } = require('../05-massa/dependencias');
const ambientes = require('../../../../infra/ambientes');

// ~/.wms-testes.env (WMS_ENV_FILE troca o caminho): a sessão vence o arquivo; vazio ou placeholder <…> é ignorado.
function lerEnvWms() {
  const arq = process.env.WMS_ENV_FILE || path.join(os.homedir(), '.wms-testes.env'),
    r = {};
  let tx = '';
  try {
    tx = fs.readFileSync(arq, 'utf8');
  } catch {
    /* sem arquivo: só a sessão */
  }
  for (const l of tx.split('\n').map((x) => x.trim())) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const [k, ...v] = l.split('='),
      val = v
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
    if (k.trim() && val && !val.startsWith('<')) r[k.trim()] = val;
  }
  const de = (k) => process.env[k] || r[k];
  return Object.fromEntries(
    [...new Set([...Object.keys(r), ...Object.keys(process.env).filter((k) => k.startsWith('WMS_'))])]
      .map((k) => [k, de(k)])
      .filter(([, v]) => v)
  );
}
// O runner passa ao Maestro como MATRICULA, SENHA, APP_ID e FILIAL (subflows/login.yaml da skill; FILIAL: flow de início).
function envWms() {
  const e = lerEnvWms(),
    de = (k) => e[k];
  return Object.fromEntries(
    [
      ['MATRICULA', de('WMS_API_LOGIN')],
      ['SENHA', de('WMS_API_SENHA')],
      ['APP_ID', de('WMS_APP_ID')],
      ['FILIAL', de('WMS_FILIAL') || de('WMS_EMPRESA')]
    ].filter(([, v]) => v)
  );
}

// Deps da jornada (6.2) pelo ambiente do ticket (infra/ambientes): flow (Maestro no Android, Playwright no web), bipe (só Android) e os
// arquivos de prova. Os nomes antigos ficam (maestro = etapa flow) para os testes e a 6.2. amb: o ambiente pronto (serial do aparelho, url).
// Sem serial: o primeiro emulador ligado (como antes); o aparelho físico vem de craftingTable.aparelhoSerial (d.serial).
function jornada(d, amb = {}) {
  const a = ambientes.obter(amb?.nome || d.ambiente),
    ctx = { adb: d.adb, serial: amb?.serial || d.serial || '', url: amb?.url || d.webUrl, web: amb?.web };
  return {
    envBase: envWms(),
    validarFlow: a.validarFlow, // a 6.2 valida o roteiro com o flow do ambiente
    temBipe: !!a.etapas.bipe,
    maestro: (arquivo, env, o) => a.etapas.flow(arquivo, env, o, ctx),
    bipe: a.etapas.bipe
      ? (codigo, acao) => a.etapas.bipe(codigo, ctx, acao)
      : async () => ({ ok: false, saida: `o ambiente ${a.nome} não tem bipe` }),
    esperar: (s) => new Promise((ok) => setTimeout(ok, s * 1000)),
    http: (e) => require('./api').chamarApi(e), // etapa http: a API com o login da skill (api.js)
    consultar: async (sql) => {
      const res = await consultar(d.banco, [sql]);
      if (res.erro) return { ok: false, erro: res.erro };
      const x = res.resultados[0];
      return x.ok ? { ok: true, colunas: x.colunas, itens: x.itens, base: res.base } : { ok: false, erro: x.erro };
    },
    // Prova que o ambiente gravou na pasta da execução (Maestro: PNGs do --test-output-dir; web: .png e .webm): só deste cenário.
    prints: (pasta) => a.evidencia.arquivos(pasta)
  };
}

module.exports = { jornada, envWms, lerEnvWms };
