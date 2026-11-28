import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function isPrivateIPv4(address: string): boolean {
	const parts = address.split('.').map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
		return false;
	}
	return (
		parts[0] === 10 ||
		(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
		(parts[0] === 192 && parts[1] === 168)
	);
}

function isTailscaleIPv4(address: string): boolean {
	const parts = address.split('.').map(Number);
	return (
		parts.length === 4 &&
		parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
		parts[0] === 100 &&
		parts[1] >= 64 &&
		parts[1] <= 127
	);
}

function findLanAddress(): string | null {
	const excluded = /^(lo|utun|tailscale|docker|br-|bridge|veth|awdl|llw|anpi|gif|stf)/i;
	const candidates = Object.entries(networkInterfaces())
		.flatMap(([name, records]) =>
			(records ?? [])
				.filter((record) => record.family === 'IPv4' && !record.internal && isPrivateIPv4(record.address))
				.map((record) => ({
					name,
					address: record.address,
					priority: /^(en0|eth0|wlan0|wlp|enp|ens)/i.test(name) ? 0 : 1
				}))
		)
		.filter((candidate) => !excluded.test(candidate.name))
		.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
	return candidates[0]?.address ?? null;
}

async function findTailscaleAddress(): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync('tailscale', ['status', '--json'], {
			timeout: 1500,
			maxBuffer: 1024 * 1024
		});
		const status = JSON.parse(stdout) as {
			BackendState?: string;
			Self?: { TailscaleIPs?: unknown };
		};
		if (status.BackendState !== 'Running' || !Array.isArray(status.Self?.TailscaleIPs)) return null;
		return (
			status.Self.TailscaleIPs.find(
				(address): address is string =>
					typeof address === 'string' &&
					isTailscaleIPv4(address)
			) ?? null
		);
	} catch {
		return null;
	}
}

export async function GET() {
	if (!dev) error(404, 'Not found');
	return json({
		lanAddress: findLanAddress(),
		tailscaleAddress: await findTailscaleAddress()
	});
}
