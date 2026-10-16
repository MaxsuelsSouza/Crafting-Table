// @ts-check
// Etapa 3 · Varredura do código (claude -p, só leitura, vaga impl.mapa): onde entra, o que já existe, o que pode quebrar, em varredura.md.
const { ARQ } = require('.');

const tarefa = (c) =>
  `ETAPA 3 · VARREDURA DO CÓDIGO (somente leitura). Leia ${c.dir}/${ARQ[2]} e ${c.dir}/dossie.md. Se o dossiê trouxer mapa do código (mapa-*.md) ou plano técnico, use-os como ponto de partida e confira se ainda batem com o código atual (mapa-conferir). ` +
  `Nos repositórios, responda COM EVIDÊNCIA (arquivo:linha) e grave em ${c.dir}/${ARQ[3]}: "Onde isso entra" (camada, módulos, pontos de entrada), "O que já existe" (funções, telas e regras que cobrem total ou parcialmente o pedido), ` +
  `"Parecido" (algo equivalente já feito: reutilizar, estender ou criar separado, e por quê), "O que pode quebrar" (chamadores, contratos, dados, fluxos e testes que cobrem o trecho), ` +
  `"Conflito com as regras" (constituição e convenções do repositório) e "Sem resposta" (o que o código não resolve). ` +
  `Se o dossiê citar trabalho-existente.md, LEIA: é código que outra pessoa já fez para este ticket (branches e commits). Em "O que já existe" diga, com a branch e o arquivo, o que dele já cobre o pedido e o que falta; em "Parecido" diga se vale continuar daquela branch. ` +
  `Se achar algo parecido e a decisão muda o rumo, PAUSE com as opções (ex.: "Reutilizar X", "Estender X", "Criar separado").`;

module.exports = { n: 3, tarefa };
