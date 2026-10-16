// @ts-check
// Prompts do Mergulho: o das etapas 1 a 4 (cabeçalho, tarefa da etapa em etapas/NN-*.js, origem das afirmações, bloco do ticket-documento e regras)
// e as regras das etapas 5 e 6. Também os bins (bin/) e as ferramentas liberadas para o claude -p.
const fs = require('fs');
const path = require('path');
const { ETAPAS, logica } = require('./etapas');
const { estado, PAUSA, RESPOSTAS, CONTEXTO } = require('./estado');
const { ENTRADA } = require('./entrada');

// A pasta ~/.claude é bloqueada para Write/Edit no claude -p: a gravação dos artefatos passa por mergulho-gravar (como o qa-state do QA).
const GRAVAR = path.join(__dirname, 'bin', 'mergulho-gravar');
const FLUXO = path.join(__dirname, 'bin', 'mergulho-fluxo');
const FERRAMENTAS = (mapa) => [
  'Read',
  'Glob',
  'Grep',
  `Bash(${GRAVAR}:*)`,
  `Bash(${mapa}/bin/mapa-db:*)`,
  `Bash(${mapa}/bin/mapa-git:*)`,
  'Bash(ls:*)',
  'Bash(ffmpeg:*)',
  'Bash(ffprobe:*)',
  'Bash(pdftotext:*)',
  'Bash(pdftoppm:*)',
  'Bash(unzip:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(grep:*)',
  'Bash(mkdir:*)'
];

const ehDocumento = (t) => require('../infra/provedores/documento').ehDocumento(t);
// Ticket por documento (só nas etapas que leem o ticket): onde estão o original, o texto extraído, as páginas e os anexos extras do incidente.
const BLOCO_DOC = (t, analisaAnexos) => {
  const { EXTRAIDO, PAGINAS } = require('../infra/ticket/contexto'),
    d = require('../infra/ticket/tickets').pasta(t.chave),
    arq = path.join(d, t.documento?.arquivo || '');
  return `\n\nTicket por documento (sem ferramenta de gestão): o documento original é ${arq}; texto extraído em ${path.join(d, EXTRAIDO)} (se existir); para PDF escaneado as páginas estão em ${path.join(d, PAGINAS)}/ (leia as imagens com Read). Comentários = os da aba Ticket do documento (no ${CONTEXTO}). Anexos extras do incidente (prints, vídeos) estão em ${path.join(d, '.anexos')}/ (pasta oculta: liste com ls, o Glob não a enxerga)${analisaAnexos ? ' e devem ser analisados todos; vídeos: extraia os quadros como indicado acima' : ''}. Documento escrito à mão ou imagem: leia direto com Read e transcreva o que entender no arquivo da etapa, marcando o que estiver ilegível em vez de inventar. PDF paginado: pdftotext/pdftoppm; docx: unzip -p arquivo word/document.xml (somente leitura).`;
};
const REGRAS = (d) =>
  `\n\nRegras: português; você roda em segundo plano, SEM ninguém para aprovar permissões: ação que pede aprovação é negada, então nunca diga que algo "precisa de aprovação" — use outra ferramenta ou registre a limitação no arquivo; só leia em ${d} (e no código dos repositórios). ESCRITA: Write/Edit são bloqueados nesta pasta; para gravar qualquer arquivo dela ("Grave em ${d}/NOME") use ${GRAVAR} NOME <<'FIM' … FIM (texto pela entrada padrão, só o nome do arquivo, sem a pasta); no Bash use um comando simples por vez (sem ; && | encadeados: pedem aprovação e são bloqueados), prefira Read/Glob/Grep; banco SOMENTE SELECT via mapa-db; proibido: commit, push, merge, rebase, INSERT/UPDATE/DELETE/DDL e publicar na ferramenta de tickets; não invente nada que não esteja nas fontes. Grave o arquivo da etapa só quando ela estiver pronta. Para PAUSAR e perguntar ao usuário (sem AskUserQuestion), grave ${d}/${PAUSA} com {"motivo":"...","pergunta":"...","opcoes":["..."]} (opcoes pode ser vazio) e NÃO grave o arquivo da etapa; termine em seguida.`;
const ORIGEM = (d) =>
  `\n\nTermine o arquivo da etapa com duas seções: "Origem das afirmações" (cada afirmação com a fonte: arquivo, comentário, consulta ao banco ou código arquivo:linha; e a confiança: aprovado, gerado, bruto, verbal ou inferido) e "Lacunas" (o que não conseguiu confirmar). A entrada do incidente, com a confiança de cada fonte, está em ${path.join(d, ENTRADA.md)} (se existir).`;

// Regras das etapas 5 e 6 (reprodução e resumo): sem pausa por pergunta; o que não dá para fazer vira registro.
const REGRAS_5E6 =
  'Modo não interativo: não pergunte, registre e siga. Proibido: INSERT/UPDATE/DELETE/DDL no banco, alterar qualquer registro da Massa Real, ' +
  'publicar na ferramenta de tickets, commit, push, merge e rebase. Consultas ao banco só de leitura, por mapa-db. Não invente: o que não consta nas fontes vira "não identificado".' +
  ` ESCRITA: Write/Edit são bloqueados na pasta do incidente; grave por ${GRAVAR} NOME <<'FIM' … FIM (só o nome do arquivo, texto pela entrada padrão) ou ${GRAVAR} evidencias/NOME.png --de /tmp/arquivo.png.`;

const prompt = (t, dir, n, repos, banco, ajuste = false) => {
  const et = logica(n),
    resp = fs.existsSync(path.join(dir, RESPOSTAS))
      ? `\nRespostas do usuário a perguntas anteriores (use-as): ${path.join(dir, RESPOSTAS)}`
      : '';
  return `[segundo plano] [Crafting Table · Incidente ${t.chave}] Mergulho no incidente ${t.link || t.chave}.\nPasta de trabalho: ${dir}\nRepositórios de código: ${repos.map((r) => `${r.camada}: ${r.caminho}`).join(' · ') || 'nenhum configurado'}\nBanco: ${banco}${resp}\n\n${et.tarefa(dir, estado(dir).obsPO)}${ORIGEM(dir)}${et.leTicket && ehDocumento(t) ? BLOCO_DOC(t, !!et.analisaAnexos) : ''}${ajuste ? `\n\nAJUSTE: ${path.join(dir, ETAPAS[n - 1].arq)} já existe e o usuário pediu mudança: leia a ÚLTIMA entrada de ${path.join(dir, RESPOSTAS)}, aplique o pedido e regrave o arquivo completo, sem refazer o que já está certo.` : ''}${REGRAS(dir)}`;
};

module.exports = { GRAVAR, FLUXO, FERRAMENTAS, REGRAS_5E6, ehDocumento, prompt };
