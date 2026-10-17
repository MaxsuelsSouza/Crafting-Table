// @ts-check
// Mais de uma subtarefa [QA] onde o plano aprovado pode ir: a extensão não escolhe (nem pega a primeira), pausa e pergunta.
// A pergunta vira pausa no cartão (motivo 'subtarefa-qa'); a resposta grava a escolha em .qa.json (subtarefaQa) e o Aprovar publica nela.
const { estado, mudar } = require('../../../estado');

const MOTIVO = 'subtarefa-qa',
  CRIAR = 'Criar uma subtarefa nova',
  NOVA = 'nova';
function perguntarSubtarefa(dir, chave, alvos) {
  mudar(dir, {
    subtarefaQa: null,
    pausa: {
      motivo: MOTIVO,
      pergunta: `O ${chave} tem ${alvos.length} subtarefas de QA de planejamento. Em qual publico o plano aprovado?`,
      opcoes: [...alvos.map((s) => `${s.key} · ${s.resumo}`), CRIAR],
      etapa: 'Publicação do plano'
    }
  });
  return { modo: 'pergunta', key: null, candidatas: alvos.map((s) => s.key) };
}
// Resposta (botão ou texto livre): "criar/nova" → subtarefa nova; senão a chave citada. Devolve a escolha ou null (não entendeu: a pausa fica).
function escolherSubtarefa(dir, resposta) {
  const r = String(resposta || '').trim(),
    chave = r.match(/[A-Z][A-Z0-9_]*-\d+/i)?.[0]?.toUpperCase();
  const escolha = chave || (/\b(criar|nova|novo)\b/i.test(r) ? NOVA : null);
  if (!escolha || estado(dir).pausa?.motivo !== MOTIVO) return null;
  mudar(dir, { subtarefaQa: escolha, pausa: null });
  return escolha;
}

module.exports = { MOTIVO, CRIAR, NOVA, perguntarSubtarefa, escolherSubtarefa };
