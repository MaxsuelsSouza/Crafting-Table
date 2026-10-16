// @ts-check
// Etapa "http" do roteiro: cenário de API sem app e sem IA (o "suite" da skill, dentro da mesma jornada).
//   { "tipo": "http", "nome": "criar", "metodo": "POST", "rota": "/api/v2/…/${CODIGO}", "corpo": {…}, "status": 200,
//     "esperado": { "data.situacao": "FATURADO", "success": true }, "salvar": { "ID_NOVO": "data.id" } }
// esperado: caminho com ponto (data.itens.0.id) → valor exato; "*" = só precisa existir. salvar: vira ${VAR} para as etapas seguintes.
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const pegar = (obj, caminho) =>
  String(caminho)
    .split('.')
    .reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

/** @returns {string[]} erros da etapa (vazio = ok) */
function errosHttp(e, onde) {
  const erros = [];
  if (!e.nome) erros.push(`${onde}: sem nome`);
  if (!METODOS.includes(String(e.metodo || '').toUpperCase()))
    erros.push(`${onde}: metodo precisa ser ${METODOS.join(', ')}`);
  if (!/^\/\S*$/.test(String(e.rota || ''))) erros.push(`${onde}: rota precisa começar com / (relativa à API)`);
  if (e.status !== undefined && !(Number(e.status) >= 100 && Number(e.status) < 600))
    erros.push(`${onde}: status inválido`);
  if (e.esperado !== undefined && (typeof e.esperado !== 'object' || Array.isArray(e.esperado)))
    erros.push(`${onde}: esperado precisa ser { "caminho": valor }`);
  if (e.salvar !== undefined && (typeof e.salvar !== 'object' || Array.isArray(e.salvar)))
    erros.push(`${onde}: salvar precisa ser { "VAR": "caminho" }`);
  if (e.status === undefined && e.esperado === undefined)
    erros.push(`${onde}: sem status nem esperado (a etapa precisa conseguir reprovar)`);
  return erros;
}

/** Resposta { status, corpo } contra a etapa → { ok, texto, salvos } */
function conferirHttp(e, r) {
  const falhas = [];
  if (e.status !== undefined && Number(e.status) !== r.status) falhas.push(`status ${r.status} (esperado ${e.status})`);
  for (const [cam, esp] of Object.entries(e.esperado || {})) {
    const v = pegar(r.corpo, cam);
    if (esp === '*' ? v === undefined : JSON.stringify(v) !== JSON.stringify(esp))
      falhas.push(`${cam} = ${JSON.stringify(v)} (esperado ${esp === '*' ? 'existir' : JSON.stringify(esp)})`);
  }
  const salvos = Object.fromEntries(
    Object.entries(e.salvar || {})
      .map(([k, cam]) => [k, pegar(r.corpo, cam)])
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
  );
  return {
    ok: !falhas.length,
    texto: falhas.length ? falhas.join('; ') : `HTTP ${r.status} ok`,
    salvos
  };
}

module.exports = { METODOS, errosHttp, conferirHttp, pegar };
