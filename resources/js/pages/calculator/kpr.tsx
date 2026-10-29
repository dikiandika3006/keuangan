import { MoneyInput } from '@/components/finance/money-input';
import { PercentInput } from '@/components/finance/percent-input';
import { Field, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { kpr, type KprInput, type KprPrepayment } from '@/lib/calculators';
import { compact, rupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Banknote, CalendarClock, House, Percent, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Kalkulator KPR', href: '/calculator/kpr' }];
const STORAGE_KEY = 'keuangan.calculator.kpr';
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

interface State extends Omit<KprInput, 'principal'> {
    price: number;
    downPayment: number;
    income: number;
}

const DEFAULTS: State = {
    price: 670_000_000,
    downPayment: 30,
    income: 0,
    years: 10,
    fixedRate: 5.88,
    fixedYears: 10,
    floatingRate: 11,
    penalty: 2,
    mode: 'reduce',
    prepayments: [],
};

function tenor(months: number): string {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y && `${y} th`, m && `${m} bln`].filter(Boolean).join(' ');
}

function pct(v: number): string {
    return `${v
        .toFixed(2)
        .replace(/\.?0+$/, '')
        .replace('.', ',')}%`;
}

export default function KprCalculator() {
    const [a, setA] = useState<State>(() => {
        try {
            return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
        } catch {
            return DEFAULTS;
        }
    });
    const [perMonth, setPerMonth] = useState(false);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
        } catch {
            /* abaikan */
        }
    }, [a]);

    const set = <K extends keyof State>(k: K, v: State[K]) => setA((prev) => ({ ...prev, [k]: v }));
    const setPrepayment = (idx: number, patch: Partial<KprPrepayment>) =>
        set(
            'prepayments',
            a.prepayments.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
        );

    const dp = Math.round((a.price * a.downPayment) / 100);
    const input: KprInput = { ...a, principal: Math.max(0, a.price - dp) };
    const r = kpr(input);
    const base = kpr({ ...input, prepayments: [] });
    const hasExtra = r.rows.some((row) => row.extra > 0);
    const savedInterest = base.totalInterest - r.totalInterest;
    const ratio = a.income > 0 ? (r.firstPayment / a.income) * 100 : null;

    const yearly = (() => {
        const out: {
            label: string;
            payment: number;
            principal: number;
            interest: number;
            extra: number;
            penalty: number;
            balance: number;
            rate: number;
        }[] = [];
        for (const row of r.rows) {
            const y = Math.ceil(row.month / 12);
            let g = out[y - 1];
            if (!g) g = out[y - 1] = { label: `Tahun ${y}`, payment: 0, principal: 0, interest: 0, extra: 0, penalty: 0, balance: 0, rate: row.rate };
            g.payment += row.payment;
            g.principal += row.principal;
            g.interest += row.interest;
            g.extra += row.extra;
            g.penalty += row.penalty;
            g.balance = row.balance;
        }
        return out;
    })();
    const tableRows = perMonth ? r.rows.map((row) => ({ ...row, label: `Bulan ${row.month}` })) : yearly;

    const chartData = Array.from({ length: Math.ceil(base.months / 12) + 1 }, (_, y) => ({
        label: `Th ${y}`,
        base: y === 0 ? input.principal : (base.rows[Math.min(base.rows.length, y * 12) - 1]?.balance ?? 0),
        extra: y === 0 ? input.principal : (r.rows[Math.min(r.rows.length, y * 12) - 1]?.balance ?? 0),
    }));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Kalkulator KPR" />
            <Page>
                <PageHeader title="Kalkulator KPR" description="Hitung cicilan anuitas, total bunga, dan simulasi pelunasan sebagian." />

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section
                        title="Data Pinjaman"
                        action={
                            <Button size="sm" variant="ghost" onClick={() => setA(DEFAULTS)}>
                                <RotateCcw className="size-4" /> Reset
                            </Button>
                        }
                    >
                        <div className="grid gap-4">
                            <Field label="Harga properti">
                                <MoneyInput value={a.price} onChange={(v) => set('price', v || 0)} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="DP" htmlFor="dp">
                                    <PercentInput id="dp" value={a.downPayment} onChange={(v) => set('downPayment', v)} />
                                </Field>
                                <Field label="Tenor" htmlFor="years">
                                    <PercentInput id="years" suffix="tahun" value={a.years} onChange={(v) => set('years', v)} />
                                </Field>
                            </div>
                            <div className="bg-muted/50 grid gap-1 rounded-lg p-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Uang muka</span>
                                    <span className="tabular-nums">{rupiah(dp)}</span>
                                </div>
                                <div className="flex justify-between font-medium">
                                    <span>Pokok pinjaman</span>
                                    <span className="tabular-nums">{rupiah(input.principal)}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Bunga fixed" htmlFor="fixed">
                                    <PercentInput id="fixed" value={a.fixedRate} onChange={(v) => set('fixedRate', v)} />
                                </Field>
                                <Field label="Masa fixed" htmlFor="fixedYears">
                                    <PercentInput id="fixedYears" suffix="tahun" value={a.fixedYears} onChange={(v) => set('fixedYears', v)} />
                                </Field>
                            </div>
                            {a.fixedYears < a.years && (
                                <Field label="Bunga floating (setelah masa fixed)" htmlFor="floating">
                                    <PercentInput id="floating" value={a.floatingRate} onChange={(v) => set('floatingRate', v)} />
                                </Field>
                            )}
                            <Field label="Penghasilan per bulan (opsional)">
                                <MoneyInput value={a.income || ''} onChange={(v) => set('income', v || 0)} />
                            </Field>
                        </div>
                    </Section>

                    <div className="grid min-w-0 gap-4 lg:col-span-2">
                        <div className="grid grid-cols-2 gap-3">
                            <StatCard
                                label="Cicilan per bulan"
                                value={rupiah(r.firstPayment)}
                                sub={ratio !== null ? `${pct(ratio)} dari penghasilan${ratio > 30 ? ' — di atas 30%' : ''}` : 'Cicilan awal'}
                                icon={Banknote}
                                tone={ratio !== null && ratio > 30 ? 'negative' : 'default'}
                            />
                            <StatCard
                                label="Total bunga"
                                value={rupiah(r.totalInterest)}
                                sub={hasExtra ? `Hemat ${rupiah(savedInterest)}` : undefined}
                                icon={Percent}
                            />
                            <StatCard
                                label="Total dibayar"
                                value={rupiah(r.totalPaid)}
                                sub={r.totalPenalty > 0 ? `Termasuk penalti ${rupiah(r.totalPenalty)}` : 'Pokok + bunga'}
                                icon={House}
                            />
                            <StatCard
                                label="Lunas dalam"
                                value={tenor(r.months)}
                                sub={hasExtra && r.months < base.months ? `${tenor(base.months - r.months)} lebih cepat` : undefined}
                                icon={CalendarClock}
                                tone={hasExtra && r.months < base.months ? 'positive' : 'default'}
                            />
                        </div>

                        <Section
                            title="Pelunasan Sebagian"
                            action={
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => set('prepayments', [...a.prepayments, { month: Math.min(base.months, 12), amount: 10_000_000 }])}
                                >
                                    <Plus className="size-4" /> Tambah
                                </Button>
                            }
                        >
                            <div className="grid gap-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Penalti pelunasan" htmlFor="penalty">
                                        <PercentInput id="penalty" value={a.penalty} onChange={(v) => set('penalty', v)} />
                                    </Field>
                                    <Field label="Setelah pelunasan">
                                        <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
                                            {(
                                                [
                                                    ['reduce', 'Cicilan turun'],
                                                    ['shorten', 'Tenor lebih cepat'],
                                                ] as const
                                            ).map(([v, label]) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => set('mode', v)}
                                                    className={cn(
                                                        'rounded-md px-2 py-1.5 text-sm',
                                                        a.mode === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                </div>
                                {a.prepayments.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">
                                        Belum ada rencana. Tambahkan nominal ekstra di bulan tertentu untuk melihat bunga yang bisa dihemat.
                                    </p>
                                ) : (
                                    <div className="grid gap-2">
                                        {a.prepayments.map((p, i) => (
                                            <div key={i} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2">
                                                <div className="relative">
                                                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
                                                        Bln
                                                    </span>
                                                    <Input
                                                        inputMode="numeric"
                                                        className="pl-10 tabular-nums"
                                                        value={p.month || ''}
                                                        onChange={(e) =>
                                                            setPrepayment(i, { month: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })
                                                        }
                                                    />
                                                </div>
                                                <MoneyInput value={p.amount || ''} onChange={(v) => setPrepayment(i, { amount: v || 0 })} />
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label="Hapus"
                                                    onClick={() =>
                                                        set(
                                                            'prepayments',
                                                            a.prepayments.filter((_, j) => j !== i),
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Section>

                        {hasExtra && (
                            <Section title="Sisa Pokok">
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ left: -10, right: 4, top: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                                            <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                            <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            <Line dataKey="base" name="Tanpa pelunasan" stroke="#64748b" strokeDasharray="4 4" dot={false} />
                                            <Line dataKey="extra" name="Dengan pelunasan" stroke="#10b981" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </Section>
                        )}
                    </div>
                </div>

                <Section
                    title="Tabel Angsuran"
                    action={
                        <Button size="sm" variant="ghost" onClick={() => setPerMonth((v) => !v)}>
                            {perMonth ? 'Per tahun' : 'Per bulan'}
                        </Button>
                    }
                >
                    <div className="-mx-4 max-h-[32rem] overflow-auto">
                        <table className="w-full min-w-[720px] text-sm tabular-nums">
                            <thead className="text-muted-foreground bg-card sticky top-0 text-xs">
                                <tr className="border-b">
                                    <th className="px-4 py-2 text-left font-medium">{perMonth ? 'Bulan' : 'Tahun'}</th>
                                    <th className="px-2 py-2 text-right font-medium">Bunga %</th>
                                    <th className="px-2 py-2 text-right font-medium">Angsuran</th>
                                    <th className="px-2 py-2 text-right font-medium">Pokok</th>
                                    <th className="px-2 py-2 text-right font-medium">Bunga</th>
                                    {hasExtra && <th className="px-2 py-2 text-right font-medium">Pelunasan</th>}
                                    <th className="px-4 py-2 text-right font-medium">Sisa pokok</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row) => (
                                    <tr key={row.label} className={cn('border-b', row.extra > 0 && 'bg-emerald-500/5')}>
                                        <td className="px-4 py-1.5">{row.label}</td>
                                        <td className="text-muted-foreground px-2 py-1.5 text-right">{pct(row.rate)}</td>
                                        <td className="px-2 py-1.5 text-right">{rupiah(row.payment)}</td>
                                        <td className="px-2 py-1.5 text-right">{rupiah(row.principal)}</td>
                                        <td className="px-2 py-1.5 text-right">{rupiah(row.interest)}</td>
                                        {hasExtra && <td className="px-2 py-1.5 text-right">{row.extra > 0 ? rupiah(row.extra) : '-'}</td>}
                                        <td className="px-4 py-1.5 text-right font-medium">{rupiah(row.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            </Page>
        </AppLayout>
    );
}
