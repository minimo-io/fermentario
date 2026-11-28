// Run against a local dev server: node scripts/test-vault.mjs
// Creates synthetic databases in memory; never reads a real vault.
import { chromium } from 'playwright-core';
import kdbx from 'kdbxweb';
import { argon2d, argon2id } from 'hash-wasm';
import { readFile } from 'node:fs/promises';

kdbx.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
	if (version !== 0x13) throw new Error('Unsupported Argon2 version');
	const options = { password: new Uint8Array(password), salt: new Uint8Array(salt), memorySize: memory, iterations, parallelism, hashLength: length, outputType: 'binary' };
	const hash = await (type === 0 ? argon2d(options) : argon2id(options));
	return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
});

async function fixture(kdf) {
	const db = kdbx.Kdbx.create(new kdbx.Credentials(kdbx.ProtectedValue.fromString('test-master')), 'Synthetic');
	db.setKdf(kdf);
	const entry = db.createEntry(db.getDefaultGroup());
	entry.fields.set('Title', 'Synthetic account');
	entry.fields.set('UserName', 'fixture-user');
	entry.fields.set('Password', kdbx.ProtectedValue.fromString('fixture-secret'));
	entry.fields.set('Notes', 'fixture notes');
	entry.fields.set('URL', 'https://example.test/');
	return Buffer.from(await db.save());
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
	const page = await browser.newPage();
	await page.clock.install();
	const errors = [];
	const requests = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => requests.push({ url: request.url(), body: request.postData() || '' }));
	await page.goto(process.env.VAULT_TEST_URL || 'http://127.0.0.1:4173/');
	await page.getByRole('button', { name: 'Open mini apps', exact: true }).click();
	await page.getByRole('dialog', { name: 'Mini apps' }).getByRole('button', { name: /Password vault/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Password vault' });
	const fixtures = [await fixture(kdbx.Consts.KdfId.Aes), await fixture(kdbx.Consts.KdfId.Argon2id)];
	if (process.env.VAULT_TEST_FIXTURE) fixtures.push(await readFile(process.env.VAULT_TEST_FIXTURE));
	for (const data of fixtures) {
		await dialog.locator('input[type=file]').setInputFiles({ name: 'synthetic.kdbx', mimeType: 'application/octet-stream', buffer: data });
		await dialog.getByLabel('Master password').fill('wrong');
		await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
		await dialog.getByRole('alert').waitFor();
		await dialog.getByLabel('Master password').fill('test-master');
		await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
		await dialog.getByLabel('Search vault entries').fill('synthetic');
		await dialog.getByRole('button', { name: /Synthetic account/ }).click();
		await dialog.getByRole('button', { name: 'Reveal' }).click();
		await dialog.getByText('fixture-secret', { exact: true }).waitFor();
		await dialog.getByRole('button', { name: 'Close', exact: true }).click();
		await page.getByRole('button', { name: /Password vault is unlocked/ }).click();
		await page.getByRole('dialog', { name: 'Mini apps' }).getByRole('button', { name: /Password vault/ }).click();
		await dialog.getByRole('button', { name: 'Reveal' }).waitFor();
		if (await dialog.getByText('fixture-secret', { exact: true }).count()) throw new Error('Password remained revealed after closing');
		await dialog.getByRole('button', { name: 'Lock vault' }).click();
		await dialog.getByLabel('Master password').waitFor();
	}
	await dialog.locator('input[type=file]').setInputFiles({ name: 'synthetic.kdbx', mimeType: 'application/octet-stream', buffer: await fixture(kdbx.Consts.KdfId.Aes) });
	await dialog.getByLabel('Master password').fill('test-master');
	await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
	await dialog.getByLabel('Search vault entries').waitFor();
	await page.clock.fastForward(301_000);
	await dialog.getByLabel('Master password').waitFor();
	if (requests.some(({ url, body }) => /test-master|fixture-secret|fixture-user|synthetic\.kdbx/.test(url + body))) throw new Error('Vault data appeared in a network request');
	if (errors.length) throw new Error(errors.join('\n'));
	console.log('Vault smoke: AES and Argon2id unlock, wrong password, search, reveal, modal state, manual and idle lock, and network checks passed.');
} finally {
	await browser.close();
}
