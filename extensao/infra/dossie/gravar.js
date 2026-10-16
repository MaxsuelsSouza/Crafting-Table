// @ts-check
// Grava dossie.json, dossie.md e trabalho-existente.md na pasta da aba e lê o dossiê gravado.
const fs = require('fs');
const path = require('path');
const { ler } = require('../pasta-ticket');
const { JSON_, MD, TRABALHO } = require('./arquivos');
const { paraMarkdown } = require('./markdown');
const { trabalhoParaMarkdown } = require('./trabalho-existente');

/** Grava dossie.json e dossie.md em <dir>. */
function gravar(dir, d) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, JSON_), JSON.stringify(d, null, 2));
  fs.writeFileSync(path.join(dir, MD), paraMarkdown(d));
  if (d.trabalho?.length) fs.writeFileSync(path.join(dir, TRABALHO), trabalhoParaMarkdown(d.trabalho, d.ticket));
  else fs.rmSync(path.join(dir, TRABALHO), { force: true }); // não deixa um arquivo velho enganar a IA
}
const lerGravado = (dir) => ler(path.join(dir, JSON_), null);

module.exports = { gravar, lerGravado };
