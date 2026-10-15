// @ts-check
// Contrato do provedor de gestão de trabalho (Jira hoje; Monday, Linear, Notion… depois). A extensão só fala com a
// ferramenta por estas operações: cada adaptador (provedores/<id>.js) traduz para a API dela. Texto entra e sai em
// Markdown (o formato da ferramenta, como o ADF do Jira, fica dentro do adaptador); a descrição e os comentários de
// buscar() vêm em HTML pronto para a aba Ticket.
// alvo = { key, site }: o ticket (key = id interno no provedor; no Jira é a própria chave) e o endereço da ferramenta (site da organização).
// A identidade do ticket tem duas partes: `id` (o que a API do provedor usa) e `chave` (o que a tela mostra; vira o nome da pasta).

/**
 * @typedef {{ key: string, site: string }} Alvo
 * @typedef {{ id: string, chave: string, projeto?: string, site: string }} TicketLido  `id` interno, `chave` de exibição, `projeto` (se a ferramenta tiver)
 * @typedef {{ id: string, nome: string }} Pessoa
 * @typedef {{ id: string, nome: string, tamanho?: number, url: string, criado?: string, de?: string | null }} Anexo
 * @typedef {{ key: string, resumo: string, updated?: string, status?: string, md: string }} Filho
 * @typedef {{ nome: string, ids: string[] }} Etapa
 * @typedef {{ id: string, rotulo: string, segredo: boolean, visivel?: boolean, variavel?: string, exemplo?: string }} CampoCredencial  `segredo`: vai para o SecretStorage (chave `<provedor>.<id>`, input com máscara, salvo `visivel`); `variavel`: campo não secreto que vira variável do provedor (ex.: site)
 * @typedef {{ site: string, projetos: { chave: string, nome: string }[], boards: { id: number | string, nome: string, tipo?: string, projeto: string, etapas: Etapa[] }[], status: string[], tiposItem: { nome: string, subtarefa?: boolean }[], labels: string[] }} Descoberta  só metadados da conta (nunca credenciais nem conteúdo de tickets)
 * @typedef {{ statusIds?: string[], label?: string, tipos?: string, boardId?: number | string, projeto?: string }} FiltroMeus
 * @typedef {{ subtarefas: boolean, anexos: boolean, comentarios: boolean, mencoes: boolean, labels: boolean, board: boolean, estimativa: boolean }} Capacidades
 *
 * @typedef {Object} Provedor
 * @property {string} id
 * @property {string} nome  nome que aparece na tela ("Jira")
 * @property {Capacidades} capacidades  o que a ferramenta tem; a tela esconde o que faltar
 * @property {CampoCredencial[]} camposCredencial  o que pedir ao usuário para conectar (Jira: site, e-mail, token; outros: tipicamente só o token)
 * @property {(link: string) => TicketLido} lerLink  link colado → identidade do ticket (erro se não for um link de ticket)
 * @property {(texto: string) => string | null} chaveDaBranch  chave do ticket dentro do nome de uma branch (ou outro texto)
 * @property {(site: string, key: string) => string} linkDo  ticket → link para abrir no navegador
 * @property {(secrets: any) => Promise<string | null>} credenciais  cabeçalho de autenticação (pede ao usuário se faltar)
 * @property {(secrets: any) => Promise<boolean>} conectado  há credenciais guardadas (sem pedir nada)
 * @property {(secrets: any) => Promise<void>} sairConta  esquece as credenciais
 * @property {(secrets: any, alvo: Alvo) => Promise<any>} buscar  ticket normalizado { key, site, resumo, status, tipo, prioridade, responsavel, horas, descricao, subtarefas, anexos, comentarios }
 * @property {(secrets: any, alvo: Alvo) => Promise<Filho[]>} filhos  subtarefas com a descrição em Markdown
 * @property {(secrets: any, alvo: Alvo, md: string, mencoes?: Pessoa[]) => Promise<any>} comentar
 * @property {(secrets: any, alvo: Alvo) => Promise<{ id: string, autor: string, autorId: string | null, data: string, texto: string, link: string }[]>} comentarios
 * @property {(secrets: any, site: string, key: string, arquivos: { arquivo: string, nome: string }[]) => Promise<void>} anexar
 * @property {(secrets: any, anexo: Anexo) => Promise<Buffer>} baixarAnexo
 * @property {(secrets: any, alvo: Alvo, busca: string) => Promise<Pessoa[]>} pessoas  quem pode ser mencionado
 * @property {(secrets: any, site: string) => Promise<Pessoa>} eu
 * @property {(secrets: any, site: string, filtro: FiltroMeus) => Promise<{ key: string, resumo: string, status: string, tipo: string, subtarefa: boolean, pai: string | null }[]>} meus
 * @property {(secrets: any, site: string, contem: string) => Promise<string[]>} labels
 * @property {(secrets: any, site: string, projeto: string, nomeBoard: string, extras?: string[]) => Promise<Etapa[]>} etapas  colunas do board
 * @property {(secrets: any, site: string, projeto: string, nomeBoard: string) => Promise<{ id: number | string, name: string }>} boardPorNome
 * @property {(secrets: any, site: string, projeto: string) => Promise<{ id: number | string, nome: string, tipo?: string }[]>} boards
 * @property {(secrets: any, site: string, projeto: string | string[], nomes: string | string[]) => Promise<{ id: number, nome: string }[]>} boardsPorNome  boards escolhidos (vários nomes, em um ou vários projetos)
 * @property {(secrets: any, site: string) => Promise<{ chave: string, nome: string }[]>} projetos  projetos visíveis para a conta (para escolher a variável Projeto)
 * @property {(secrets: any, site: string, chave: string) => Promise<{ chave: string, nome: string }>} projetoInfo
 * @property {(secrets: any, site: string, projeto: string) => Promise<string[]>} statusDoProjeto
 * @property {(secrets: any, site: string) => Promise<Descoberta>} descobrir  metadados da conta (projetos, boards com etapas, status, tipos de item, labels), com limites; alimenta o mapeamento por IA
 * @property {(secrets: any, alvo: Alvo, o: { resumo: string, descricao: string, estimativa?: string, atribuirAMim?: boolean, responsavelId?: string, tipoNome?: string }) => Promise<{ key: string, aviso?: string }>} criarSubtarefa
 * @property {(secrets: any, alvo: { site: string }, key: string, md: string, o?: { titulo?: string, estimativa?: string }) => Promise<{ aviso?: string }>} atualizarDescricao
 */

// As operações, na ordem acima: a fachada (infra/ticket.js) delega cada uma ao provedor ativo e o teste confere o adaptador.
const OPERACOES = ['lerLink', 'chaveDaBranch', 'linkDo', 'credenciais', 'conectado', 'sairConta', 'buscar', 'filhos', 'comentar', 'comentarios', 'anexar', 'baixarAnexo',
  'pessoas', 'eu', 'meus', 'labels', 'etapas', 'boardPorNome', 'boardsPorNome', 'boards', 'projetos', 'projetoInfo', 'statusDoProjeto', 'descobrir', 'criarSubtarefa', 'atualizarDescricao'];

// O que falta no adaptador para cumprir o contrato (vazio: cumpre).
const faltando = (p) => [...['id', 'nome', 'capacidades'].filter((k) => !p[k]), ...(Array.isArray(p.camposCredencial) && (p.camposCredencial.length || p.local) ? [] : ['camposCredencial']), ...OPERACOES.filter((k) => typeof p[k] !== 'function')];

module.exports = { OPERACOES, faltando };
