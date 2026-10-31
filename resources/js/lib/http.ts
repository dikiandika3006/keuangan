/** Permintaan JSON ke server dengan token CSRF Laravel (cookie XSRF-TOKEN). */
export async function jsonFetch<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const xsrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ?? '');
    const res = await fetch(url, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
}

export const b64url = {
    encode(buf: ArrayBuffer): string {
        let s = '';
        new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    decode(s: string): Uint8Array<ArrayBuffer> {
        const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
        const out = new Uint8Array(new ArrayBuffer(bin.length));
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    },
};
