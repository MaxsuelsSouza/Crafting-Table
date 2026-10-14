// @ts-check
const vscode = require('vscode');

// Credenciais por provedor: cada adaptador declara `camposCredencial` (contrato.js) e aqui se pede, guarda e lê.
// Segredos ficam no SecretStorage com o prefixo do provedor: `<provedor>.<campo>` (Jira: jira.email, jira.token, as chaves de sempre).
// Campo não secreto com `variavel` (ex.: o site) vira variável do provedor, não segredo.

/** Chave do SecretStorage de um campo do provedor. */
const chaveSegredo = (provedorId, campoId) => `${provedorId}.${campoId}`;

/** Segredos guardados do provedor: { campo: valor } (só os campos secretos; vazio onde falta). */
async function lerSegredos(provedor, secrets) {
  const r = {};
  for (const c of provedor.camposCredencial.filter((x) => x.segredo)) r[c.id] = (await secrets.get(chaveSegredo(provedor.id, c.id))) || '';
  return r;
}

/** Há todos os segredos do provedor guardados? */
const completas = async (provedor, secrets) => Object.values(await lerSegredos(provedor, secrets)).every(Boolean);

/** Esquece os segredos do provedor. */
async function esquecer(provedor, secrets) {
  for (const c of provedor.camposCredencial.filter((x) => x.segredo)) await secrets.delete(chaveSegredo(provedor.id, c.id));
}

/**
 * Pede ao usuário os campos de credencial (InputBox; segredo com password: true) e guarda os segredos.
 * @param {import('./contrato').Provedor} provedor
 * @param {any} secrets
 * @param {{ incluirVariaveis?: boolean, atuais?: Record<string, string> }} [o]  incluirVariaveis: pede também os campos não secretos (site); atuais: valor inicial deles
 * @returns {Promise<Record<string, string> | null>} valores dos campos pedidos (null se o usuário cancelou)
 */
async function pedir(provedor, secrets, { incluirVariaveis = false, atuais = {} } = {}) {
  const valores = {};
  for (const c of provedor.camposCredencial) {
    if (!c.segredo && !incluirVariaveis) continue;
    const v = await vscode.window.showInputBox({ title: `${provedor.nome}: ${c.rotulo}`, prompt: c.rotulo + (c.exemplo ? ` (${c.exemplo})` : ''), value: c.segredo ? '' : atuais[c.id] || '',
      password: !!c.segredo, ignoreFocusOut: true });
    if (!v || !v.trim()) return null;
    valores[c.id] = c.id === 'site' ? v.trim().replace(/\/+$/, '') : v.trim();
  }
  for (const c of provedor.camposCredencial.filter((x) => x.segredo && valores[x.id])) await secrets.store(chaveSegredo(provedor.id, c.id), valores[c.id]);
  return valores;
}

module.exports = { chaveSegredo, lerSegredos, completas, esquecer, pedir };
