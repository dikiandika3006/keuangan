const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function rupiah(value: number): string {
    return idr.format(Math.round(value)).replace(/ /g, ' ');
}

export function number(value: number): string {
    return num.format(Math.round(value));
}

/** Format ringkas untuk sumbu grafik & kartu kecil: 1,2 jt / 3,4 M */
export function compact(value: number): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    if (abs >= 1e12) return `${sign}${fmt(abs / 1e12)} T`;
    if (abs >= 1e9) return `${sign}${fmt(abs / 1e9)} M`;
    if (abs >= 1e6) return `${sign}${fmt(abs / 1e6)} jt`;
    if (abs >= 1e3) return `${sign}${fmt(abs / 1e3)} rb`;
    return `${sign}${fmt(abs)}`;
}

export function formatDate(value: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
    if (!value) return '-';
    return new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('id-ID', opts);
}

export function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Jumlah bulan dari sekarang sampai tanggal tertentu (minimal 0). */
export function monthsUntil(date: string | null): number | null {
    if (!date) return null;
    const now = new Date();
    const d = new Date(date + 'T00:00:00');
    return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
}

/** Tabungan per bulan yang dibutuhkan agar target tercapai tepat waktu. */
export function monthlyNeeded(g: { target_amount: number; current_amount: number; target_date: string | null }): number | null {
    const months = monthsUntil(g.target_date);
    if (months === null) return null;
    return Math.max(0, g.target_amount - g.current_amount) / Math.max(1, months);
}

export function percent(part: number, whole: number): number {
    if (!whole) return 0;
    return Math.max(0, Math.min(100, (part / whole) * 100));
}

export const ACCOUNT_TYPES: Record<string, string> = {
    bank: 'Bank',
    cash: 'Tunai',
    ewallet: 'E-Wallet',
    investment: 'Investasi',
    pocket: 'Dompet Tujuan',
};

export const PRIORITIES: Record<number, string> = { 1: 'Tinggi', 2: 'Sedang', 3: 'Rendah' };

export const DEBT_KINDS: Record<string, string> = {
    car: 'Kendaraan',
    house: 'Rumah / KPR',
    credit_card: 'Kartu kredit',
    paylater: 'Paylater',
    personal: 'Pinjaman pribadi',
    other: 'Lainnya',
};

export const ASSET_KINDS: Record<string, string> = {
    investment: 'Investasi',
    jht: 'JHT BPJS',
    business: 'Modal usaha',
    property: 'Properti / kendaraan',
    other: 'Lainnya',
};

/** '2026-11' atau '2026-11-01' → 'Nov 2026' */
export function monthLabel(value: string | null, month: 'short' | 'long' = 'short'): string {
    if (!value) return '-';
    return formatDate(value.slice(0, 7) + '-01', { month, year: 'numeric' });
}

/** Selisih hari dari hari ini (negatif = sudah lewat). */
export function daysFromToday(date: string): number {
    const d = new Date(date + 'T00:00:00');
    const t = new Date(today() + 'T00:00:00');
    return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#64748b'];
