import { type Debt } from '@/types/finance';

export interface Assumptions {
    income: number; // per bulan, saat ini
    expense: number; // per bulan di luar cicilan utang
    incomeGrowth: number; // % per tahun
    inflation: number; // % per tahun
    investReturn: number; // % per tahun
    investShare: number; // % surplus yang diinvestasikan
    years: number;
}

export interface ProjectionPoint {
    month: number;
    label: string;
    cash: number;
    investment: number;
    debt: number;
    netWorth: number;
    realNetWorth: number; // dalam nilai uang hari ini
    income: number;
    expense: number;
    surplus: number;
}

export interface ProjectionResult {
    points: ProjectionPoint[];
    debtFreeMonth: number | null;
    emergencyFundMonth: number | null; // dana tunai >= 6x pengeluaran
    fiMonth: number | null; // investasi >= 25x pengeluaran tahunan (aturan 4%)
    totalSaved: number;
    totalInterestPaid: number;
}

function monthLabel(offset: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

/**
 * Simulasi bulanan sederhana: pemasukan naik tiap tahun, pengeluaran naik mengikuti inflasi,
 * utang dicicil dengan bunga, surplus dibagi ke tabungan tunai & investasi.
 */
export function project(start: { cash: number; investment: number }, debts: Debt[], a: Assumptions): ProjectionResult {
    const months = a.years * 12;
    const monthlyReturn = Math.pow(1 + a.investReturn / 100, 1 / 12) - 1;
    const monthlyInflation = Math.pow(1 + a.inflation / 100, 1 / 12) - 1;

    let cash = start.cash;
    let investment = start.investment;
    const remaining = debts.map((d) => d.remaining_amount);
    let totalSaved = 0;
    let totalInterest = 0;
    let debtFreeMonth: number | null = remaining.every((r) => r <= 0) ? 0 : null;
    let emergencyFundMonth: number | null = null;
    let fiMonth: number | null = null;

    const totalDebt = () => remaining.reduce((s, r) => s + Math.max(0, r), 0);
    const points: ProjectionPoint[] = [
        {
            month: 0,
            label: monthLabel(0),
            cash,
            investment,
            debt: totalDebt(),
            netWorth: cash + investment - totalDebt(),
            realNetWorth: cash + investment - totalDebt(),
            income: a.income,
            expense: a.expense,
            surplus: 0,
        },
    ];

    for (let m = 1; m <= months; m++) {
        const yearIndex = Math.floor((m - 1) / 12);
        const income = a.income * Math.pow(1 + a.incomeGrowth / 100, yearIndex);
        const expense = a.expense * Math.pow(1 + a.inflation / 100, yearIndex);

        let debtPaid = 0;
        debts.forEach((d, i) => {
            if (remaining[i] <= 0) return;
            const interest = (remaining[i] * d.interest_rate) / 100 / 12;
            const pay = Math.min(d.monthly_payment, remaining[i] + interest);
            remaining[i] = remaining[i] + interest - pay;
            debtPaid += pay;
            totalInterest += interest;
        });

        const surplus = income - expense - debtPaid;
        if (surplus > 0) {
            investment += (surplus * a.investShare) / 100;
            cash += (surplus * (100 - a.investShare)) / 100;
            totalSaved += surplus;
        } else {
            cash += surplus;
            if (cash < 0) {
                investment += cash;
                cash = 0;
            }
        }
        investment = investment > 0 ? investment * (1 + monthlyReturn) : investment;

        const debt = totalDebt();
        if (debtFreeMonth === null && debt <= 1) debtFreeMonth = m;
        if (emergencyFundMonth === null && cash >= expense * 6) emergencyFundMonth = m;
        if (fiMonth === null && investment >= expense * 12 * 25) fiMonth = m;

        const netWorth = cash + investment - debt;
        points.push({
            month: m,
            label: monthLabel(m),
            cash: Math.round(cash),
            investment: Math.round(investment),
            debt: Math.round(debt),
            netWorth: Math.round(netWorth),
            realNetWorth: Math.round(netWorth / Math.pow(1 + monthlyInflation, m)),
            income: Math.round(income),
            expense: Math.round(expense + debtPaid),
            surplus: Math.round(surplus),
        });
    }

    if (emergencyFundMonth === null && start.cash >= a.expense * 6) emergencyFundMonth = 0;

    return { points, debtFreeMonth, emergencyFundMonth, fiMonth, totalSaved, totalInterestPaid: totalInterest };
}

export function describeMonth(m: number | null): string {
    if (m === null) return 'Belum tercapai';
    if (m === 0) return 'Sudah tercapai';
    const years = Math.floor(m / 12);
    const months = m % 12;
    const parts = [years ? `${years} thn` : '', months ? `${months} bln` : ''].filter(Boolean).join(' ');
    return `${parts} (${monthLabel(m)})`;
}
