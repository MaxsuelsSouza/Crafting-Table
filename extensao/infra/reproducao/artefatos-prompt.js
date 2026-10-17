// @ts-check
// Prompt de extração dos artefatos do ticket (comentários, anexos, observação do PO) com a "Massa de dados" e o "Comportamento relatado"
// literais e o "Não analisado". Movido de janelas/incidentes/etapas/02-artefatos.js (texto como estava).
// Usado por: Incidentes (etapa 2, tarefa) e Implementações (1.2 Evidências, as seções MASSA, COMPORTAMENTO, IMAGENS e NAO_ANALISADO).
const path = require('path');

const MASSA = '"Massa de dados" (IDs, números de pedido/tarefa, payloads citados, literalmente como aparecem)';
const COMPORTAMENTO = '"Comportamento relatado" (o que o usuário disse que fez/viu, ex.: "app crashou")';
const IMAGENS = 'Imagens (.png/.jpg) leia direto com Read. Não invente: o que não está nas fontes fica fora.';
const NAO_ANALISADO = 'Se algum anexo não puder ser lido, liste-o em "Não analisado" no arquivo com o motivo.';

/** @param {string} d pasta da aba @param {string} o observação do PO @param {{ contexto: string, arq: string }} c arquivo de contexto e o que gravar */
const tarefa = (d, o, { contexto, arq }) =>
  `ETAPA 2 · ARTEFATOS E INPUT DO PO. Leia ${contexto} (todos os comentários), os arquivos baixados do ticket (pasta ${d}/.. e ${d}) e a observação do PO: ${o ? `"${o}"` : '(nenhuma)'}. Grave em ${d}/${arq}: resumo dos comentários, dos anexos e da observação do PO, mais duas seções: ${MASSA} e ${COMPORTAMENTO}. Vídeos (.mp4/.webm): não dá para abri-los com Read; extraia quadros com: ffmpeg -i <video> -vf fps=1/2 -frames:v 12 /tmp/mergulho-${path.basename(path.dirname(d))}/quadro-%02d.png (crie a pasta antes com mkdir -p) e leia os PNGs com Read; descreva o que o vídeo mostra. ${IMAGENS} ${NAO_ANALISADO}`;

module.exports = { tarefa, MASSA, COMPORTAMENTO, IMAGENS, NAO_ANALISADO };
