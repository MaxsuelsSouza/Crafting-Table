// @ts-check
// Subetapa 5.2 · Massa de teste: o Claude monta a partir do fluxo.json; a extensão confere a trava (regras/trava-dml.js),
// pede a aprovação do dev e executa no banco (única ação irreversível do Mergulho).
const fs = require('fs');
const path = require('path');
const { documentos } = require('../../index');
const { mesclar: mudar, lerTxt, RESPOSTAS } = require('../../../estado');
const { REGRAS, SKILL } = require('../regras/ferramentas');
const { travaDml } = require('../regras/trava-dml');
const vagas = require('../../../../infra/agentes/etapas');
const { SUBETAPAS, pausar } = require('./estado');

const lista = documentos;
const promptMassa = (chave, dir) =>
  `[segundo plano · Crafting Table · Incidente ${chave}] Prepare a MASSA DE TESTE do incidente. ${fs.existsSync(path.join(dir, RESPOSTAS)) ? `Aplique também os pedidos do usuário em ${path.join(dir, RESPOSTAS)} (a última entrada vale). ` : ''}Leia ${lista(dir)}, ${path.join(dir, 'fluxo.json')} (o fluxo já planejado: a massa tem de dar ao fluxo tudo o que ele precisa em cada passo) e ${path.join(dir, 'massa-real.sql')} (a Massa Real: prova, intocável). ` +
  `Consulte a cópia de produção (só leitura, por mapa-db; skill testes-funcionais: ${SKILL()}/SKILL.md) e escreva em ${path.join(dir, 'massa-teste.sql')} os comandos INSERT que criam registros NOVOS e DISTINTOS ` +
  '(ids e códigos diferentes dos reais, copiando a estrutura) deixando o banco no estado ANTERIOR ao erro, pronto para repetir a ação do diagnóstico. ' +
  `Um comando por instrução, terminado em ";". NÃO execute o arquivo: a extensão confere e executa. ${REGRAS}${vagas.aviso('incidentes.reproducao')}`;

// Aprovação da massa de teste: .massa-aprovada guarda o hash do SQL aprovado; editar o arquivo depois exige aprovar de novo.
const hashSql = (sql) => require('crypto').createHash('sha1').update(String(sql).trim()).digest('hex');
const massaAprovada = (dir, sql) => lerTxt(path.join(dir, '.massa-aprovada')).trim() === hashSql(sql);
const aprovarMassa = (dir) =>
  fs.writeFileSync(path.join(dir, '.massa-aprovada'), hashSql(lerTxt(path.join(dir, 'massa-teste.sql'))));

// Devolve true se parou (pausa ou aguardando a aprovação); false para seguir para a 5.3.
async function rodar({ t, dir, d, vivo, ponto, comecar, concluirSub }) {
  const S2 = SUBETAPAS[1];
  ponto();
  comecar(S2);
  // Preservação de prova: ambiente do banco tem de estar definido e não ser produção.
  const b = d.banco || {};
  if (b.ambiente === 'producao')
    return pausar(
      dir,
      'A conexão do banco está marcada como PRODUÇÃO',
      'Troque para a cópia de produção em Configurações → Banco de dados e tente de novo.'
    );
  if (!b.ambiente)
    return pausar(
      dir,
      'O ambiente do banco não está definido',
      'Defina em Configurações → Banco de dados se a conexão é QAS ou cópia de produção, e tente de novo.'
    );
  const arqTeste = path.join(dir, 'massa-teste.sql'),
    real = lerTxt(path.join(dir, 'massa-real.sql'));
  if (!lerTxt(arqTeste).trim()) {
    vivo('acao', 'Claude monta a massa de teste (registros novos, estado anterior ao erro, o que o fluxo precisa)');
    await d.claude({ prompt: promptMassa(t.chave, dir), titulo: 'Incidente · Preparando a massa de teste' });
  }
  ponto();
  const sqlTeste = lerTxt(arqTeste),
    trava = travaDml(sqlTeste, real);
  if (!trava.ok)
    return pausar(
      dir,
      `Massa de Teste recusada: ${trava.erro}`,
      'Ajuste o massa-teste.sql (só registros novos) e tente de novo.'
    );
  if (!fs.existsSync(path.join(dir, '.massa-teste.ok'))) {
    if (!massaAprovada(dir, sqlTeste)) {
      // única ação irreversível do Mergulho (INSERT + commit): abrir e ler antes de aprovar
      mudar(dir, {
        etapa: 5,
        fase: 'aguardando',
        pausa: null,
        aprovacao: { etapa: 5, lido: false, arq: 'massa-teste.sql', nome: 'Massa de teste (executa no banco)' }
      });
      vivo('fim', 'Massa de teste pronta (massa-teste.sql): aguardando sua aprovação antes de executar no banco');
      return true;
    }
    vivo('acao', 'Executando massa-teste.sql no banco (só linhas novas)');
    const r = await d.executarSql(sqlTeste);
    if (!r.ok)
      return pausar(
        dir,
        'O banco recusou a massa de teste',
        `${String(r.saida).slice(0, 200)}. Corrigir e tentar de novo?`
      );
    fs.writeFileSync(path.join(dir, '.massa-teste.ok'), new Date().toISOString());
  }
  concluirSub(S2);
  return false;
}

module.exports = { promptMassa, hashSql, massaAprovada, aprovarMassa, rodar };
