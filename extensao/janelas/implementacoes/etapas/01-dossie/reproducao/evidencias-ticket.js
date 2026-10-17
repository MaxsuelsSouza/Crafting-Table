// @ts-check
// Evidências que o ticket (ou o pai e os irmãos) já traz: anexos do Jira que parecem evidência (print, vídeo, log), baixados para
// <aba>/evidencias-ticket/ e indexados em .evidencias-ticket.json (os quadros dos vídeos: evidencias-ticket/quadros/). Sem vscode: roda em teste.
const fs = require('fs');
const path = require('path');

const PASTA = 'evidencias-ticket',
  INDICE = '.evidencias-ticket.json',
  EVIDENCIAS_MD = 'evidencias-ticket.md', // o que a IA extraiu na 1.2 (massa, fluxo, esperado × obtido…)
  MAX_ANEXOS = 20,
  MAX_BYTES = 40 * 1024 * 1024;
const EVIDENCIA = /\.(png|jpe?g|gif|webp|mp4|webm|mov|log|txt|har|pdf)$/i;
const lerJson = (f, pad) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return pad;
  }
};
const seguro = (n) =>
  String(n)
    .replace(/[^\w.\- ]+/g, '_')
    .slice(0, 120);

/** Baixa os anexos do Jira que parecem evidência (print, vídeo, log). `baixar(anexo)` devolve o conteúdo; falha em um não derruba os outros. */
async function coletarEvidencias(dir, anexos, baixar) {
  const alvo = path.join(dir, PASTA),
    feitos = lerJson(path.join(dir, INDICE), []);
  const itens = [...feitos];
  const novos = (anexos || [])
    .filter(
      (a) =>
        a?.id && EVIDENCIA.test(a.nome || '') && !itens.some((i) => i.id === String(a.id)) && !(a.tamanho > MAX_BYTES)
    )
    .slice(0, MAX_ANEXOS);
  fs.mkdirSync(alvo, { recursive: true });
  for (const a of novos) {
    try {
      const conteudo = await baixar(a);
      const nome = `${a.de ? `${seguro(a.de)}-` : ''}${seguro(a.nome)}`;
      fs.writeFileSync(path.join(alvo, nome), conteudo);
      itens.push({ id: String(a.id), nome, arquivo: path.join(PASTA, nome), de: a.de || null });
    } catch {
      /* anexo indisponível: segue com os outros */
    }
  }
  fs.writeFileSync(path.join(dir, INDICE), JSON.stringify(itens, null, 2));
  return itens;
}
const evidenciasDoTicket = (dir) => lerJson(path.join(dir, INDICE), []);

module.exports = { coletarEvidencias, evidenciasDoTicket, PASTA, INDICE, EVIDENCIAS_MD };
