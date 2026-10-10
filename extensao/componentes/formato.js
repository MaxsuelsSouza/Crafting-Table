// @ts-check
const os = require('os');

const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const iniciais = () => (os.userInfo().username.split(/[._-]/).map((x) => x[0]).join('').slice(0, 2) || 'EU').toUpperCase();

module.exports = { quando, iniciais };
