// @ts-check
// CSS da aba Tarefas (quadro, cards, modal e grade).
const CSS = `
  .tboard { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; align-items: flex-start; }
  .tcol { flex: 1 0 210px; min-width: 210px; display: flex; flex-direction: column; gap: 6px; padding: 6px; border-radius: var(--r-lg); background: var(--surface-2); }
  .tcol-t { display: flex; justify-content: space-between; padding: 2px 4px 4px; font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); }
  .tvazio { text-align: center; color: var(--text-dim); font-size: 11px; padding: 8px 0; }
  .tcard { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border);
    box-shadow: 0 1px 2px rgb(0 0 0 / 18%); cursor: pointer; font-size: 12px; line-height: 1.4; }
  .tcard:hover { border-color: var(--accent); }
  .tcard.ts-em_alteracao { border-color: var(--ia); }
  .tcard.ts-reprovada .ttit { color: var(--text-dim); text-decoration: line-through; }
  .ttit { font-weight: 500; word-break: break-word; }
  .tpe { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 10.5px; color: var(--text-dim); }
  .tid { font-weight: 600; color: var(--text-dim); }
  .tcam { padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; text-transform: uppercase; background: var(--surface-2); }
  .cam-backend { background: color-mix(in srgb, var(--text) 14%, transparent); color: var(--text); }
  .cam-mobile { background: color-mix(in srgb, var(--ok) 22%, transparent); color: var(--ok); }
  .tjira { color: var(--accent-soft); font-weight: 600; }
  .tav { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: var(--on-cor); font-size: 9px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .tcard.tatencao { border-color: #f58a1f; background: color-mix(in srgb, #f58a1f 10%, var(--surface)); }
  .tcard .taten { color: #f58a1f; margin-right: 4px; cursor: help; }
  .trev { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; background: color-mix(in srgb, var(--ia) 25%, transparent); color: var(--ia); }
  .tm-rev { padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--ia); background: color-mix(in srgb, var(--ia) 8%, transparent); }
  .tm-rev b { color: var(--ia); }
  .tqa { border-left: 3px solid var(--warn); }
  .selo-qa { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; font-weight: 700; background: var(--warn); color: var(--on-cor); vertical-align: 1px; }
  .tres { font-size: 11px; color: var(--text-dim); line-height: 1.4; }
  .tm-desc.md { white-space: normal; max-height: 50vh; overflow: auto; }
  .tm-desc.md h3, .tm-desc.md h4, .tm-desc.md h5 { margin: 10px 0 4px; }
  .tproc { display: flex; align-items: center; font-size: 11px; color: var(--ia); }
  .tmodal { position: fixed; inset: 0; z-index: 300; background: rgb(0 0 0 / 55%); display: flex; align-items: flex-start; justify-content: center; padding: 24px 10px; overflow: auto; }
  .tm-caixa { width: min(560px, 100%); display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--surface);
    border: 1px solid var(--border); box-shadow: 0 12px 40px rgb(0 0 0 / 45%); font-size: 12.5px; line-height: 1.5; }
  .tm-cab { display: flex; align-items: center; gap: 8px; }
  .tm-x { margin-left: auto; width: 26px; height: 26px; border-radius: var(--r-md); }
  .tm-x:hover { background: var(--surface-2); }
  .tstatus { padding: 0 7px; border-radius: var(--r-pill); font-size: 10.5px; border: 1px solid var(--border); }
  .tstatus.ts-aprovada { color: var(--ok); border-color: var(--ok); } .tstatus.ts-reprovada { color: var(--danger); border-color: var(--danger); }
  .tstatus.ts-em_alteracao { color: var(--ia); border-color: var(--ia); }
  .tm-caixa h3 { margin: 0; font-size: 14px; }
  .tm-desc { white-space: pre-wrap; word-break: break-word; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); }
  .tm-ls { display: flex; flex-direction: column; gap: 4px; }
  .tm-l { display: flex; gap: 10px; font-size: 12px; } .tm-l > span { flex: none; width: 130px; color: var(--text-dim); }
  .tm-l a { color: var(--accent-soft); }
  .tm-campos { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .tm-campos label { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-dim); }
  .tm-campos input:not([type]) { flex: 1; max-width: 160px; height: 26px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2); color: var(--text); font: inherit; }
  .tchk { cursor: pointer; } .tchk input { margin: 0; }
  .tm-acoes { display: flex; gap: 6px; flex-wrap: wrap; }
  .tm-acoes button { height: 28px; padding: 0 12px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 12px; }
  .tm-acoes .aprovar { background: var(--ok) !important; border-color: var(--ok) !important; color: var(--on-cor); }
  .tm-acoes .reprovar { color: var(--danger); }
  .tm-alt textarea { width: 100%; min-height: 80px; box-sizing: border-box; margin-bottom: 6px; padding: 8px; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface-2); color: var(--text); font: inherit; resize: vertical; }
  .tm-hist { font-size: 11px; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
  .tm-hist span { margin-right: 6px; }
  .tcol-t { align-items: center; } .tcol-n { display: inline-flex; gap: 6px; }
  .tg-abrir { width: 22px; height: 22px; padding: 3px; border-radius: var(--r-sm); color: var(--text-dim); } .tg-abrir:hover { background: var(--surface); color: var(--text); }
  .tg-abrir svg { width: 100%; height: 100%; }
  .tm-resp { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-dim); } .tm-resp b { font-weight: 500; color: var(--text); }
  .tm-resp button { height: 24px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--r-sm); font-size: 11.5px; }
  .tgrade { padding: 16px; z-index: 310; }
  .tg-caixa { width: min(1400px, 100%); display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: var(--r-lg); background: var(--surface);
    border: 1px solid var(--border); box-shadow: 0 12px 40px rgb(0 0 0 / 45%); font-size: 12.5px; line-height: 1.5; }
  .tg-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 10px; align-items: start; }
  .tg-cel { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--border); }
  .tg-cel.ts-em_alteracao { border-color: var(--ia); }
  .tg-cel h3 { margin: 0; font-size: 13px; }
  .tg-cel .tm-desc { background: var(--surface); max-height: 220px; overflow: auto; }
`;

module.exports = { CSS };
