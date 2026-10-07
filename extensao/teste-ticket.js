// node teste-ticket.js
const Module = require('module'); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const assert = require('assert');
const { lerLink, esc } = require('./ticket')._teste;
assert.deepStrictEqual(lerLink('https://ferreiracosta.atlassian.net/browse/WMS-123'), { key: 'WMS-123', site: 'https://ferreiracosta.atlassian.net' });
assert.strictEqual(lerLink(' https://x.atlassian.net/jira/software/projects/WMS/boards/1?selectedIssue=wms-9 ').key, 'WMS-9');
assert.throws(() => lerLink('https://x.atlassian.net/jira'));
assert.strictEqual(esc('<b>"x"</b>'), '&#60;b&#62;&#34;x&#34;&#60;/b&#62;');
console.log('ok');
