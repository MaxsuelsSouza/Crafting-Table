// @ts-check
// Ambientes de teste: onde a aplicação roda para o QA, a reprodução de Incidentes e o teste da Implementação. Ambiente novo = 1 pasta
// aqui + 1 linha no REGISTRO. Na v1, um ambiente por ticket (escolher.js) e um ambiente por máquina (portas e aparelho únicos).
//   escolher.js   qual ambiente o ticket usa (estado → camada dos repositórios → craftingTable.ambientePadrao)
//   aplicacao/    papéis (API 5111, Metro 8081, Start, web 9009), portas, subir um papel pelo Comando, saúde, sha
//   android/      adb, Maestro (flow), bipe, validação do flow, evidências (comum a emulador e aparelho)
//   emulador/ · aparelho/ · web/   os ambientes
// Como usar: const ambientes = require('../infra/ambientes'); const a = ambientes.obter('web'); await a.subir(dir, ctx, vivo).
// Usado por: QA (03-ambiente, 04-precondicao, 06-execucao), Incidentes (5.3, 5.1/5.4), infra/integracoes/testes.js.

/**
 * Contrato de um ambiente.
 * @typedef {(tipo: string, texto: string) => void} Vivo  linha no Ao vivo ('acao' | 'aviso' | 'erro' | 'fim')
 * @typedef {{ nome: string, fonte: string, terminais: string[], parou_em: null, itens: any[], backend?: string,
 *   mobile?: string|null, web?: string|null, url?: string, serial?: string, app?: string|null,
 *   sha: Record<string, string|null> }} Pronto  ambiente de pé; sha: commit do código que está rodando, por repositório
 * @typedef {{ parou_em: string, erro: string, falta?: 'comandos'|'app', fonte?: string, terminais?: string[] }} Parou
 *   falta: o que outro preparador (o script da skill no QA) ainda pode completar
 * @typedef {Object} Ambiente
 * @property {string} nome  chave do registro (vai no card.json, no .ambiente.json e no prefixo dos Conhecimentos: <nome>:inicio)
 * @property {string} rotulo  como aparece nos textos ("emulador", "aparelho", "navegador")
 * @property {'android'|'web'} plataforma  android: flows do Maestro e bipe; web: specs do Playwright
 * @property {string[]} papeis  papéis de aplicacao/papeis.js que ele sobe
 * @property {(ctx?: any) => string[]} requisitos  o que falta na máquina (vazio = pode subir)
 * @property {(dir: string, ctx: any, vivo: Vivo) => Promise<Pronto|Parou>} subir  idempotente: reaproveita o que já responde na porta
 * @property {(amb?: any) => Promise<{ ok: boolean, motivo?: string }>} saude  portas dos papéis + a API respondendo HTTP
 * @property {{ flow: (arquivo: string, env: Record<string,string>, o: { junit: string, cwd?: string, saidaTeste?: string }, ctx?: any)
 *   => Promise<{ rc: number, saida: string }>, bipe?: (codigo: string, ctx?: any, acao?: string) => Promise<{ ok: boolean, saida: string }> }} etapas
 *   etapas do roteiro que dependem do ambiente (ctx: { adb, serial } no Android; { url, web } no web)
 * @property {(arquivo: string, env?: Record<string,string>) => string[]} validarFlow  erros do flow/spec antes de rodar (vazio = ok)
 * @property {{ gravar: (destino: string|null, o?: { chave?: string, sid?: string, serial?: string }) => void, parar: () => void,
 *   arquivos: (pasta: string) => string[] }} evidencia  vídeo da tela e os arquivos de prova (prints, vídeos) de uma pasta
 * @property {(amb?: any) => string} texto  o ambiente em 1 linha para o prompt ("API http://localhost:5111 · Metro 8081 · emulador ligado")
 * @property {() => string} guia  como a IA olha a aplicação para achar seletores (e prova o que viu)
 * @property {(arquivo: string, amb?: any) => string} comoPrint  como a IA tira um print para esse arquivo
 * @property {string[]} ferramentas  --allowedTools da IA para dirigir o ambiente
 * @property {(dirEvidencias: string) => { mcpServers: Record<string, any> }} [mcp]  servidor MCP da sessão (vai no --mcp-config)
 * @property {() => boolean} [ligado]  o aparelho do ambiente está ligado (rodapé do QA; só o emulador sabe dizer sem rede)
 * @property {() => any} [derrubar]  derruba o que subiu (nenhum ambiente derruba hoje: os Comandos ficam de pé)
 */

const REGISTRO = {
  emulador: () => require('./emulador'),
  aparelho: () => require('./aparelho'),
  web: () => require('./web')
};
const PADRAO = 'emulador';
const NOMES = Object.keys(REGISTRO);

/** @returns {Ambiente} */
function obter(nome = PADRAO) {
  if (!REGISTRO[nome]) throw new Error(`ambiente desconhecido: ${nome} (use ${NOMES.join(', ')})`);
  return REGISTRO[nome]();
}
/** @returns {Ambiente[]} */
const lista = () => NOMES.map((n) => obter(n));

module.exports = { obter, lista, NOMES, PADRAO, escolher: (ctx) => require('./escolher').escolher(ctx) };
