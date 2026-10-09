// Paleta da marca Ferreira Costa (tema escuro), a mesma do plugin fcx-common-apresentacoes
// (skills/fc-deck-engine/assets/fc-tokens.json → "tema_escuro"). FONTE ÚNICA de cor da extensão:
// nenhuma tela escreve hex; todas usam as variáveis abaixo. Para mudar uma cor, mude só aqui.
//
// Decisão do usuário (2026-10-08): nenhum vermelho na interface. O acento é o verde da marca (#62BF1B, o `--fc-accent` do
// plugin de apresentações) e o verde claro do tema escuro (#8EE63A); amarelo digital e neutros completam.
// Sem vermelho, erro e alerta se distinguem pelo texto/ícone (⚠, "erro"), não pela cor.
const FC = {
  bg: '#0A0A0B', bgSoft: '#131316', text: '#F5F5F5', textSoft: 'rgba(255,255,255,0.82)', muted: 'rgba(255,255,255,0.6)',
  rule: 'rgba(255,255,255,0.12)', accent: '#62BF1B', accentSoft: '#8EE63A', green: '#8EE63A', digital: '#EAE839', digitalSoft: '#F2F08F',
  // Do tema claro da marca (fc-tokens.json): só como opções de cor das notas
  claroBgSoft: '#F7F6F4', claroRule: '#ECECEC', claroMuted: '#636363'
};

// Significado → cor. As telas usam só estes nomes.
//   --accent       seleção, foco, botão principal, contador, erro/alto impacto   (verde da marca)
//   --accent-soft  link/chave de ticket, hover do botão principal                (verde claro)
//   --ok           sucesso, aprovado, baixo impacto                    (verde)
//   --warn         atenção, impacto médio, em andamento                (amarelo digital)
//   --ia           Claude trabalhando, revisão proposta                (amarelo suave)
//   --danger       erro, reprovado, impacto alto                       (mesmo verde do acento)
//   --on-cor       texto sobre qualquer cor sólida acima               (quase-preto da marca)
const CSS = `<style id="marca">
  :root {
    color-scheme: dark;
    --fc-bg: ${FC.bg}; --fc-bg-soft: ${FC.bgSoft}; --fc-text: ${FC.text}; --fc-text-soft: ${FC.textSoft}; --fc-muted: ${FC.muted};
    --fc-rule: ${FC.rule}; --fc-accent: ${FC.accent}; --fc-accent-soft: ${FC.accentSoft}; --fc-green: ${FC.green};
    --fc-digital: ${FC.digital}; --fc-digital-soft: ${FC.digitalSoft};

    --bg: var(--fc-bg);
    --surface: var(--fc-bg-soft);
    --surface-2: color-mix(in srgb, var(--fc-text) 7%, var(--fc-bg-soft));
    --border: var(--fc-rule);
    --text: var(--fc-text);
    --text-soft: var(--fc-text-soft);
    --text-dim: var(--fc-muted);
    --accent: var(--fc-accent);
    --accent-soft: var(--fc-accent-soft);
    --ok: var(--fc-green);
    --warn: var(--fc-digital);
    --ia: var(--fc-digital-soft);
    --danger: var(--fc-accent);
    --perigo: var(--fc-accent);
    --on-cor: var(--fc-bg);
    /* Tipografia (tokens do design system): NotionInter → Inter; Lyon Text → Source Serif 4 (só em trechos editoriais) */
    --font-notioninter: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    --font-lyon-text: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
    --fc-font: var(--font-notioninter);
    --fc-serif: var(--font-lyon-text);
    --fc-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; /* só código */
    /* Espaçamento, raios e layout (design system): densidade confortável */
    --spacing-4: 4px; --spacing-8: 8px; --spacing-12: 12px; --spacing-16: 16px; --spacing-20: 20px; --spacing-24: 24px;
    --spacing-28: 28px; --spacing-32: 32px; --spacing-36: 36px; --spacing-64: 64px; --spacing-80: 80px;
    --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-pill: 9999px;   /* small/outlined · botões · cards · pills */
    --page-max: 1440px; --section-gap: 80px; --card-padding: 24px; --element-gap: 8px;
    --text-caption: 12px; --lh-caption: 1.33; --ls-caption: 0.12px;
    --text-body-sm: 14px; --lh-body-sm: 1.43;
    --text-body: 16px; --lh-body: 1.5;
    --text-subheading: 20px; --lh-subheading: 1;
    --text-heading-sm: 22px; --lh-heading-sm: 1.27; --ls-heading-sm: -0.242px;
    --text-heading: 40px; --lh-heading: 1.5;
    --text-heading-lg: 48px; --lh-heading-lg: 1.5;
    --text-display-sm: 54px; --lh-display-sm: 1.04; --ls-display-sm: -1.89px;
    --text-display: 72px; --lh-display: 1.21; --ls-display: -2.016px;
    --text-display-lg: 96px; --lh-display-lg: 1.04; --ls-display-lg: -4.608px;
  }
  html, body, button, input, textarea, select { font-family: var(--fc-font); font-feature-settings: "lnum", "locl" 0; }
  body { line-height: var(--lh-body-sm); letter-spacing: normal; }
  h1, h2, h3, h4, h5, h6, b, strong { font-weight: 600; }
  h1, h2 { letter-spacing: var(--ls-heading-sm); line-height: var(--lh-heading-sm); }
  small, .rotulo, .quando, .tag { letter-spacing: var(--ls-caption); }
  code, pre, kbd, samp, .mono, .cmd { font-family: var(--fc-mono); }
  .serif, blockquote { font-family: var(--fc-serif); font-weight: 400; }
  html, body { background: var(--bg); color: var(--text); }
  ::selection { background: color-mix(in srgb, var(--accent) 45%, transparent); }
</style>`;



// @font-face com os arquivos de fonts/ (Inter variável 400-700, Source Serif 4 400). `uri` converte caminho em URL do webview.
function fontesCss(uri) {
  const path = require('path');
  const u = (arq) => uri(path.join(__dirname, 'fonts', arq)).toString();
  return `<style id="fontes">
  @font-face { font-family: 'Inter'; font-weight: 400 700; font-style: normal; font-display: swap; src: url('${u('Inter.woff2')}') format('woff2'); }
  @font-face { font-family: 'Source Serif 4'; font-weight: 400; font-style: normal; font-display: swap; src: url('${u('SourceSerif4.woff2')}') format('woff2'); }
</style>`;
}

module.exports = { FC, CSS, fontesCss };
