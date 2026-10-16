// @ts-check
// Etapa 2 · Artefatos e input do PO: comentários, anexos (prints, vídeos) e a observação do PO, com a "Massa de dados" e o
// "Comportamento relatado" literais. Grava 2-artefatos.md. Os anexos do ticket precisam estar baixados (portão do orquestrador: leTicket).
const path = require('path');
const { ETAPAS } = require('./index');
const { CONTEXTO } = require('../estado');

const tarefa = (d, o) =>
  `ETAPA 2 · ARTEFATOS E INPUT DO PO. Leia ${CONTEXTO} (todos os comentários), os arquivos baixados do ticket (pasta ${d}/.. e ${d}) e a observação do PO: ${o ? `"${o}"` : '(nenhuma)'}. Grave em ${d}/${ETAPAS[1].arq}: resumo dos comentários, dos anexos e da observação do PO, mais duas seções: "Massa de dados" (IDs, números de pedido/tarefa, payloads citados, literalmente como aparecem) e "Comportamento relatado" (o que o usuário disse que fez/viu, ex.: "app crashou"). Vídeos (.mp4/.webm): não dá para abri-los com Read; extraia quadros com: ffmpeg -i <video> -vf fps=1/2 -frames:v 12 /tmp/mergulho-${path.basename(path.dirname(d))}/quadro-%02d.png (crie a pasta antes com mkdir -p) e leia os PNGs com Read; descreva o que o vídeo mostra. Imagens (.png/.jpg) leia direto com Read. Não invente: o que não está nas fontes fica fora. Se algum anexo não puder ser lido, liste-o em "Não analisado" no arquivo com o motivo.`;

// analisaAnexos: no ticket-documento, os anexos extras (.anexos/) entram todos nesta etapa (prompt.js, BLOCO_DOC).
module.exports = { n: 2, leTicket: true, analisaAnexos: true, tarefa };
