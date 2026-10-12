/** True on macOS and iOS/iPadOS, where the primary shortcut modifier is
 *  Command. False during SSR and on Windows/Linux, where it is Control. */
export function isAppleDevice(): boolean {
	if (typeof navigator === 'undefined') return false;
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
	if (platform) return /mac|iphone|ipad|ipod/i.test(platform);
	return /Mac/.test(nav.userAgent ?? '');
}
