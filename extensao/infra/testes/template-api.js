// @ts-check
// Template B do plugin jira-qa-planner (Guia Técnico de API: request/response, JSON, troubleshooting) e a escolha UI × API.
// Usado pelo prompt de planejamento do QA (janelas/qa/etapas/01-planejamento/prompt.js) e pela Implementação. Código puro.
// Origem: fcx-qa-test-planning/skills/jira-qa-planner/reference/test-plan-templates.md (Template B) e SKILL.md, Passo 6.

// Indicadores de história de API (SKILL Passo 6): endpoint, API, REST, JSON, payload, integração, contrato.
const PALAVRAS_API = /(?<![\p{L}\p{N}])(endpoints?|apis?|rest|json|payloads?|integra[çc](ão|ao|ões|oes)|contratos?)(?![\p{L}\p{N}])/iu;
/** @param {string} texto história (título, descrição, critérios) @returns {'api'|'ui'} */
const escolherTemplate = (texto) => (PALAVRAS_API.test(String(texto || '')) ? 'api' : 'ui');

// Texto do Template B, como está no plugin.
const TEMPLATE_API = `# 📋 Guia de Testes – [NOME DO ENDPOINT]

**Data:** [data]  
**Versão:** 1.0  
**Autor:** QA  

---

## 1. Visão Geral

| Campo | Valor |
|---|---|
| Método | [GET / POST / PUT / DELETE] |
| Endpoint | \`/api/[caminho]\` |
| Finalidade | [o que esse endpoint faz] |
| Autenticação | [JWT / OAuth / API Key / Nenhuma] |

**Responsabilidades:**
- [responsabilidade 1]
- [responsabilidade 2]

---

## 2. Arquitetura e Fluxo Técnico

\`\`\`
[Cliente]
    │
    ▼
[Controller] <<arquivo:linha>>
    │
    ▼
[Service] <<arquivo:linha>>
    │
    ├──▶ [Integração externa / API terceiro]
    │
    └──▶ [Repository / DB] <<arquivo:linha>>
\`\`\`

---

## 3. Pré-requisitos

- **Token:** [como obter / onde configurar]
- **Ambiente:** [URL base de QA/staging]
- **Dependências:** [banco, filas, APIs externas]
- **Variáveis de ambiente:** \`ENV_VAR_1\`, \`ENV_VAR_2\`

---

## 4. Estrutura de Dados

### Request Body

| Campo | Tipo | Obrigatório | Descrição | Validação |
|---|---|---|---|---|
| \`campo1\` | string | ✅ | [descrição] | [regex / max / enum] |
| \`campo2\` | number | ❌ | [descrição] | [min / max] |

### Response (200/201)

| Campo | Tipo | Descrição |
|---|---|---|
| \`id\` | string (UUID) | Identificador gerado |
| \`status\` | string (enum) | Status do recurso |

---

## 5. Cenários de Teste

### CT01 – Happy Path (campos obrigatórios)

**Objetivo:** Validar criação/consulta com dados mínimos válidos.

**Dado que** o token JWT é válido e o payload contém apenas campos obrigatórios
**Quando** a requisição é enviada para \`[MÉTODO] [endpoint]\`
**Então** o sistema retorna HTTP 200/201 com o body esperado

📌 Validações:
✔ Status HTTP correto
✔ Body contém todos os campos de resposta documentados
✔ \`id\` retornado é um UUID válido

---

### CT02 – Payload completo

**Objetivo:** Validar comportamento com todos os campos preenchidos.

[...]

---

### CT03 – Validação negativa – campo obrigatório ausente

**Dado que** o payload não contém o campo \`[campo obrigatório]\`
**Quando** a requisição é enviada
**Então** o sistema retorna HTTP 400 com mensagem de erro descritiva

📌 Validações:
✔ HTTP 400
✔ Body contém \`errors\` listando o campo ausente
✔ Nenhum dado é persistido

---

## 6. Exemplos JSON

### Request válido
\`\`\`json
{
  "campo1": "valor_exemplo",
  "campo2": 42
}
\`\`\`

### curl executável
\`\`\`bash
curl -X POST https://[BASE_URL]/api/[endpoint] \\
  -H "Authorization: Bearer [TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{"campo1": "valor_exemplo"}'
\`\`\`

### Respostas esperadas

**Sucesso (201):**
\`\`\`json
{ "id": "uuid-gerado", "status": "ACTIVE" }
\`\`\`

**Erro de validação (400):**
\`\`\`json
{ "errors": [{ "field": "campo1", "message": "campo obrigatório" }] }
\`\`\`

**Não autorizado (401):**
\`\`\`json
{ "message": "Token inválido ou expirado" }
\`\`\`

---

## 7. Troubleshooting

| Sintoma | Causa Provável | Solução |
|---|---|---|
| 401 Unauthorized | Token expirado | Renovar token via \`/auth/refresh\` |
| 400 campo obrigatório | Payload incompleto | Revisar campos obrigatórios |
| 500 Internal Server Error | Falha na integração externa | Verificar logs do service |

---

## 8. Critérios de Finalização

- [ ] Todos os CTs executados
- [ ] Contrato de API validado (campos, tipos, HTTP codes)
- [ ] Testes negativos cobertos
- [ ] Sem bugs críticos em aberto`;

module.exports = { PALAVRAS_API, escolherTemplate, TEMPLATE_API };
