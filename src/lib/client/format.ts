export function bytes(n: number | null | undefined): string {
	if (n == null) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let v = n;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1000;
		i++;
	}
	return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function ago(iso: string | null | undefined): string {
	if (!iso) return 'never';
	const s = (Date.now() - new Date(iso).getTime()) / 1000;
	if (s < 0) return until(iso);
	if (s < 45) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86400) return `${Math.round(s / 3600)}h ago`;
	if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
	return new Date(iso).toLocaleDateString();
}

/** "in 3h", "in 2d" for a time in the future. */
export function until(iso: string | null | undefined): string {
	if (!iso) return 'never';
	const s = (new Date(iso).getTime() - Date.now()) / 1000;
	if (s <= 0) return ago(iso);
	if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))}m`;
	if (s < 86400) return `in ${Math.round(s / 3600)}h`;
	return `in ${Math.round(s / 86400)}d`;
}

export const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
