import type { StockItem } from './types';
import { esc, htmlShell as shell } from './print';

export type StockPrintItem = StockItem & { displayTitle: string };

export { esc };

export function faviconLink(): string {
	return '';
}

/** Stock-specific styles on top of the shared printable shell. */
const SHOP_CSS = `
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
`;

export function htmlShell(title: string, body: () => string): string {
	return shell(title, body, { extraCss: SHOP_CSS });
}
