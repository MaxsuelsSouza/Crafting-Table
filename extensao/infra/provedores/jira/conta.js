// @ts-check
// Conta do Jira: o que pedir para conectar, o cabeçalho Basic (pede o que faltar), conta guardada, sair e quem é você (eu).
// O adaptador (index.js) e a api.js requerem este arquivo; por isso o adaptador e a api entram aqui dentro da função (ciclo).
const credenciaisLib = require('../credenciais');

// O que pedir para conectar: site (vira a variável "site"), e-mail e API token (segredos jira.email e jira.token).
const camposCredencial = [
  { id: 'site', rotulo: 'Site do Jira', segredo: false, variavel: 'site', exemplo: 'https://<org>.atlassian.net' },
  { id: 'email', rotulo: 'E-mail da conta Jira', segredo: true, visivel: true }, // guardado como segredo, mas aparece ao digitar
  { id: 'token', rotulo: 'API token do Jira (id.atlassian.com/manage-profile/security/api-tokens)', segredo: true }
];

// Cabeçalho Basic; se faltar e-mail ou token, pede (só os segredos: o site é pedido ao conectar).
async function credenciais(secrets) {
  const jira = require('.'); // ciclo: index → conta
  let { email, token } = await credenciaisLib.lerSegredos(jira, secrets);
  if (!email || !token) {
    const v = await credenciaisLib.pedir(jira, secrets);
    if (!v) return null;
    ({ email, token } = v);
  }
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// Há conta guardada (sem pedir nada); sairConta esquece, e a próxima chamada pede de novo.
const conectado = (secrets) => credenciaisLib.completas(require('.'), secrets); // ciclo: index → conta
async function sairConta(secrets) {
  const jira = require('.'); // ciclo: index → conta
  await credenciaisLib.esquecer(jira, secrets);
  for (const k of Object.keys(eus)) delete eus[k];
}

// Quem é você no Jira (accountId e nome), guardado depois da primeira busca.
const eus = {};
async function eu(secrets, site) {
  const { api } = require('./api'); // ciclo: api → conta
  if (!eus[site]) { const m = await api(secrets, site, 'myself'); eus[site] = { id: m.accountId, nome: m.displayName }; }
  return eus[site];
}

module.exports = { camposCredencial, credenciais, conectado, sairConta, eus, eu };
