/**
 * Membaca ketikan catat cepat: "35rb makan siang", "1,5jt servis", "+2jt gaji", "kopi 20000".
 * Nominal boleh di depan atau belakang; "+" di depan = pemasukan.
 */
export interface QuickParse {
    amount: number | null;
    note: string;
    income: boolean;
}

const UNITS: Record<string, number> = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, m: 1e6, mio: 1e6 };

export function parseQuick(input: string): QuickParse {
    let text = input.trim();
    const income = text.startsWith('+');
    if (income) text = text.slice(1).trim();

    const re = /(?:^|\s)(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta|mio|m)?(?=\s|$)/i;
    const match = text.match(re);
    if (!match) return { amount: null, note: text, income };

    const [whole, num, unit] = match;
    let amount: number;
    if (unit) {
        // "1,5jt" / "1.5jt" → desimal; "35rb" → bulat
        amount = Math.round(parseFloat(num.replace(',', '.')) * UNITS[unit.toLowerCase()]);
    } else {
        // "20.000" / "20,000" → pemisah ribuan
        amount = parseInt(num.replace(/[.,]/g, ''), 10);
    }
    const note = (text.slice(0, match.index) + ' ' + text.slice((match.index ?? 0) + whole.length)).replace(/\s+/g, ' ').trim();

    return { amount: Number.isFinite(amount) && amount > 0 ? amount : null, note, income };
}
