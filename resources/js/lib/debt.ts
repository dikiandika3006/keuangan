import { type Debt } from '@/types/finance';

/**
 * Estimasi berapa bulan sampai lunas dengan cicilan tetap.
 * Bunga dihitung efektif (anuitas) dari sisa pokok. null jika cicilan tidak cukup menutup bunga.
 */
export function monthsToPayoff(debt: Pick<Debt, 'remaining_amount' | 'monthly_payment' | 'interest_rate'>): number | null {
    const { remaining_amount: P, monthly_payment: A } = debt;
    if (P <= 0) return 0;
    if (A <= 0) return null;
    const r = debt.interest_rate / 100 / 12;
    if (r === 0) return Math.ceil(P / A);
    if (A <= P * r) return null;
    return Math.ceil(-Math.log(1 - (r * P) / A) / Math.log(1 + r));
}

export function payoffDate(months: number | null): string {
    if (months === null) return 'Tidak akan lunas';
    if (months === 0) return 'Lunas';
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}
