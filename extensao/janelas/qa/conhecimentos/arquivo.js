// @ts-check
// Onde mora o que a IA do QA já descobriu: ~/.claude/tickets/.conhecimentos/qa.json (vale para todos os tickets) e os flows
// prontos em .conhecimentos/flows/ (o Maestro roda o arquivo). QA_CONHECIMENTOS troca a pasta (testes).
// Formato: { telaInicio: 'Menu principal', itens: [{ id: 'K001', tipo, chave, titulo, conteudo, fonte, sha, arquivo, em, atualizado, usos, ultimoUso }] }
const fs = require('fs');
const os = require('os');
const path = require('path');

const TIPOS = {
  tabela: 'Tabela do banco (colunas, chaves, significado dos códigos)',
  consulta: 'Consulta pronta (SELECT que acha um tipo de registro)',
  seletor: 'Seletor do app (id, texto ou testTag de um elemento)',
  tela: 'Tela do app (o que tem e como reconhecer)',
  navegacao: 'Caminho no app (de uma tela a outra)',
  api: 'Endpoint da API (rota, corpo, resposta)',
  regra: 'Regra de negócio confirmada no código',
  flow: 'Flow do Maestro pronto (início, voltar ao início)'
};

const pasta = () => process.env.QA_CONHECIMENTOS || path.join(os.homedir(), '.claude', 'tickets', '.conhecimentos');
const ARQ = () => path.join(pasta(), 'qa.json');
const FLOWS = () => path.join(pasta(), 'flows');

function ler() {
  try {
    const j = JSON.parse(fs.readFileSync(ARQ(), 'utf8'));
    return { telaInicio: j.telaInicio || '', itens: Array.isArray(j.itens) ? j.itens : [] };
  } catch {
    return { telaInicio: '', itens: [] };
  }
}
function gravar(dados) {
  fs.mkdirSync(pasta(), { recursive: true });
  const tmp = `${ARQ()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, ARQ());
}

module.exports = { TIPOS, pasta, ARQ, FLOWS, ler, gravar };
