/** Rumus kalkulator FIRE & KPR, mengikuti sheet "Perhitungan.xlsx". */

export interface FireInput {
    initial: number;
    monthlySaving: number;
    /** % per tahun */
    rate: number;
    /** % pajak atas bunga */
    tax: number;
    monthlyExpense: number;
    /** % penarikan aman per tahun (dana target = pengeluaran tahunan ÷ rate ini) */
    withdrawalRate: number;
}

export interface FireYear {
    year: number;
    deposited: number;
    interest: number;
    balance: number;
}

const MAX_FIRE_YEARS = 100;

/**
 * Setoran di awal bulan, bunga bulanan dipotong pajak lalu ditambahkan ke saldo
 * (kolom D-H sheet FIRE).
 */
export function fire(i: FireInput) {
    const annualExpense = i.monthlyExpense * 12;
    const target = i.withdrawalRate > 0 ? annualExpense / (i.withdrawalRate / 100) : 0;
    const monthlyRate = i.rate / 100 / 12;
    const keep = 1 - i.tax / 100;

    const years: FireYear[] = [];
    let balance = i.initial;
    let deposited = i.initial;
    let interest = 0;
    let fireMonth: number | null = target > 0 && balance >= target ? 0 : null;

    for (let m = 1; m <= MAX_FIRE_YEARS * 12; m++) {
        balance += i.monthlySaving;
        deposited += i.monthlySaving;
        const g = balance * monthlyRate * keep;
        balance += g;
        interest += g;
        if (fireMonth === null && target > 0 && balance >= target) fireMonth = m;
        if (m % 12 === 0) years.push({ year: m / 12, deposited, interest, balance });
        if (fireMonth !== null && m % 12 === 0 && m / 12 >= Math.max(30, Math.ceil(fireMonth / 12) + 5)) break;
    }

    return { annualExpense, target, fireMonth, years };
}

export interface KprPrepayment {
    month: number;
    amount: number;
}

export interface KprInput {
    principal: number;
    years: number;
    /** % bunga fixed per tahun */
    fixedRate: number;
    fixedYears: number;
    /** % bunga floating per tahun setelah masa fixed */
    floatingRate: number;
    /** % penalti atas nominal pelunasan sebagian */
    penalty: number;
    /** reduce = cicilan turun, tenor tetap; shorten = cicilan tetap, lunas lebih cepat */
    mode: 'reduce' | 'shorten';
    prepayments: KprPrepayment[];
}

export interface KprRow {
    month: number;
    rate: number;
    payment: number;
    principal: number;
    interest: number;
    extra: number;
    penalty: number;
    balance: number;
}

/** PMT Excel: cicilan anuitas tetap. */
export function pmt(monthlyRate: number, n: number, principal: number): number {
    if (n <= 0) return principal;
    if (monthlyRate === 0) return principal / n;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

/** Sisa bulan untuk melunasi saldo dengan cicilan tertentu. */
function nper(monthlyRate: number, payment: number, balance: number): number {
    if (monthlyRate === 0) return Math.ceil(balance / payment);
    const x = 1 - (monthlyRate * balance) / payment;
    return x <= 0 ? Infinity : Math.ceil(-Math.log(x) / Math.log(1 + monthlyRate) - 1e-9);
}

export function kpr(i: KprInput) {
    const n = Math.max(1, Math.round(i.years * 12));
    const fixedMonths = Math.min(n, Math.max(0, Math.round(i.fixedYears * 12)));
    const rateAt = (m: number) => (m <= fixedMonths ? i.fixedRate : i.floatingRate);
    const extras = new Map<number, number>();
    for (const p of i.prepayments) if (p.month >= 1 && p.amount > 0) extras.set(p.month, (extras.get(p.month) ?? 0) + p.amount);

    const rows: KprRow[] = [];
    let balance = i.principal;
    let remaining = n;
    let payment = 0;
    let prevRate: number | null = null;
    let recalc = true;

    for (let m = 1; balance > 0.5 && m <= n * 2; m++) {
        const rate = rateAt(m);
        const r = rate / 100 / 12;
        if (rate !== prevRate && !recalc && i.mode === 'shorten') {
            // Bunga berubah: cicilan dihitung ulang untuk sisa tenor yang berjalan
            recalc = true;
            remaining = Math.max(1, nper(prevRate! / 100 / 12, payment, balance));
        }
        if (recalc || rate !== prevRate) {
            payment = pmt(r, remaining, balance);
            recalc = false;
        }
        prevRate = rate;

        const interest = balance * r;
        let principal = Math.min(balance, payment - interest);
        const pay = principal + interest;
        balance -= principal;

        const extra = Math.min(balance, extras.get(m) ?? 0);
        balance -= extra;
        remaining--;
        if (extra > 0 && i.mode === 'reduce') recalc = true;
        if (balance < 0.5) balance = 0;
        principal = Math.max(0, principal);

        rows.push({ month: m, rate, payment: pay, principal, interest, extra, penalty: (extra * i.penalty) / 100, balance });
        if (remaining <= 0 && balance > 0) remaining = 1;
    }

    const sum = (k: keyof KprRow) => rows.reduce((s, row) => s + row[k], 0);
    const totalInterest = sum('interest');
    const totalPenalty = sum('penalty');
    return {
        rows,
        firstPayment: rows[0]?.payment ?? 0,
        totalInterest,
        totalPenalty,
        totalPaid: i.principal + totalInterest + totalPenalty,
        months: rows.length,
    };
}
