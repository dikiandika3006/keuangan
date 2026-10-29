/**
 * Terjemahan sederhana: teks sumber ditulis dalam bahasa Indonesia dan sekaligus menjadi kunci.
 * Kamus bahasa Inggris ada di lang/i18n/<bagian>/en.json, dipakai bersama oleh Laravel (__()).
 * Placeholder memakai format Laravel: t(':n transaksi', { n: 3 }).
 * Kata yang sama tapi beda arti diberi konteks setelah '|', yang tidak ikut tampil: t('Masuk|login') → "Masuk".
 */
export type Locale = 'id' | 'en';

const files = import.meta.glob<Record<string, string>>('../../../lang/i18n/*/en.json', { eager: true, import: 'default' });
const en: Record<string, string> = Object.assign({}, ...Object.values(files));

// Bahasa ditentukan server lewat <html lang>; mengganti bahasa memuat ulang halaman
export const locale: Locale = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'en' : 'id';

/** Locale Intl untuk tanggal & teks (angka rupiah tetap format Indonesia). */
export const intlLocale = locale === 'en' ? 'en-GB' : 'id-ID';

export function t(key: string, params?: Record<string, string | number>): string {
    const source = key.includes('|') ? key.slice(0, key.indexOf('|')) : key;
    let text = locale === 'en' ? (en[key] ?? source) : source;
    if (params) {
        // Ganti placeholder terpanjang dulu agar :total tidak terpotong oleh :to
        for (const name of Object.keys(params).sort((a, b) => b.length - a.length)) {
            text = text.split(`:${name}`).join(String(params[name]));
        }
    }
    return text;
}
