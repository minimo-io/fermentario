import type { StockItem } from './types';

export type StockPrintItem = StockItem & { displayTitle: string };

export function esc(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function faviconLink(): string {
	return '';
}

export function htmlShell(scope: string, title: string, body: () => string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #111; background: #fff; margin: 0; padding: 16px; }
  .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  button { padding: 8px 14px; font-size: 14px; border: 1px solid #999; border-radius: 999px; background: #fff; cursor: pointer; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; margin: 20px 0 8px; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  ul.shop { list-style: none; margin: 0; padding: 0; }
  ul.shop li { border-bottom: 1px solid #eee; padding: 10px 0; font-size: 15px; }
  ul.shop label { display: flex; gap: 10px; align-items: flex-start; }
  ul.shop input { margin-top: 3px; }
  ul.shop li.extra { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  ul.shop li.extra label { flex: 1; }
  ul.shop li.extra form { margin: 0; }
  ul.shop li.extra button { border: 0; background: #fff; color: #999; padding: 0 6px; font-size: 18px; line-height: 1; cursor: pointer; }
  .add-extra { display: flex; gap: 8px; margin: 12px 0 4px; }
  .add-extra input[type="text"] { flex: 1; padding: 8px 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; }
  .add-extra button { padding: 8px 14px; font-size: 14px; border: 1px solid #999; border-radius: 999px; background: #fff; }
  .muted { color: #666; }
  @media print {
    .bar, .no-print { display: none; }
    body { padding: 0; }
    section.block { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="bar"><h1>${esc(title)}</h1><button onclick="window.print()">Print</button></div>
${body()}
</body>
</html>`;
}
