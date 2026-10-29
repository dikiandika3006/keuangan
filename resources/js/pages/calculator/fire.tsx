import { MoneyInput } from '@/components/finance/money-input';
import { PercentInput } from '@/components/finance/percent-input';
import { Field, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { fire, type FireInput } from '@/lib/calculators';
import { compact, rupiah } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Flag, PiggyBank, RotateCcw, Target, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Kalkulator FIRE', href: '/calculator/fire' }];
const STORAGE_KEY = 'keuangan.calculator.fire';
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };
const MILESTONES = [5, 10, 15, 20, 25, 30];

const DEFAULTS: FireInput = {
    initial: 0,
    monthlySaving: 5_000_000,
    rate: 8.5,
    tax: 20,
    monthlyExpense: 7_500_000,
    withdrawalRate: 5,
};

function duration(months: number): string {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y && `${y} tahun`, m && `${m} bulan`].filter(Boolean).join(' ') || 'Sekarang';
}

export default function FireCalculator() {
    const [a, setA] = useState<FireInput>(() => {
        try {
            return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
        } catch {
            return DEFAULTS;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
        } catch {
            /* abaikan */
        }
    }, [a]);

    const set = <K extends keyof FireInput>(k: K, v: FireInput[K]) => setA((prev) => ({ ...prev, [k]: v }));
    const r = useMemo(() => fire(a), [a]);
    const chartData = r.years.map((y) => ({ label: `Th ${y.year}`, deposited: y.deposited, interest: y.interest }));
    const fireDate = r.fireMonth !== null ? new Date(new Date().getFullYear(), new Date().getMonth() + r.fireMonth, 1) : null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Kalkulator FIRE" />
            <Page>
                <PageHeader
                    title="Kalkulator FIRE"
                    description="Berapa dana yang harus terkumpul supaya bebas finansial, dan berapa lama kamu bisa mencapainya."
                />

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section
                        title="Variabel"
                        action={
                            <Button size="sm" variant="ghost" onClick={() => setA(DEFAULTS)}>
                                <RotateCcw className="size-4" /> Reset
                            </Button>
                        }
                    >
                        <div className="grid gap-4">
                            <Field label="Pengeluaran per bulan">
                                <MoneyInput value={a.monthlyExpense} onChange={(v) => set('monthlyExpense', v || 0)} />
                            </Field>
                            <Field label="Tabungan / investasi per bulan">
                                <MoneyInput value={a.monthlySaving} onChange={(v) => set('monthlySaving', v || 0)} />
                            </Field>
                            <Field label="Dana awal yang sudah ada">
                                <MoneyInput value={a.initial} onChange={(v) => set('initial', v || 0)} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Return / tahun" htmlFor="rate">
                                    <PercentInput id="rate" value={a.rate} onChange={(v) => set('rate', v)} />
                                </Field>
                                <Field label="Pajak bunga" htmlFor="tax">
                                    <PercentInput id="tax" value={a.tax} onChange={(v) => set('tax', v)} />
                                </Field>
                            </div>
                            <Field label="Asumsi return saat pensiun (penarikan / tahun)" htmlFor="swr">
                                <PercentInput id="swr" value={a.withdrawalRate} onChange={(v) => set('withdrawalRate', v)} />
                            </Field>
                            <p className="text-muted-foreground text-xs">
                                Dana target = pengeluaran per tahun ÷ asumsi return. Contoh: {rupiah(a.monthlyExpense)} × 12 ={' '}
                                {rupiah(r.annualExpense)} ÷ {String(a.withdrawalRate).replace('.', ',')}% = {rupiah(r.target)}.
                            </p>
                        </div>
                    </Section>

                    <div className="grid min-w-0 gap-4 lg:col-span-2">
                        <div className="grid grid-cols-2 gap-3">
                            <StatCard label="Pengeluaran / tahun" value={rupiah(r.annualExpense)} icon={Wallet} />
                            <StatCard label="Dana harus terkumpul" value={rupiah(r.target)} icon={Target} />
                            <StatCard
                                label="Waktu mencapai FIRE"
                                value={r.fireMonth !== null ? duration(r.fireMonth) : '> 100 tahun'}
                                sub={fireDate && fireDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                                icon={Flag}
                                tone={r.fireMonth !== null ? 'positive' : 'negative'}
                            />
                            <StatCard
                                label="Passive income / bulan"
                                value={rupiah((r.target * a.withdrawalRate) / 100 / 12)}
                                sub="Dari dana target, setelah tercapai"
                                icon={PiggyBank}
                            />
                        </div>

                        <Section title="Pertumbuhan Dana">
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ left: -10, right: 4, top: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                                        <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                        <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Area
                                            dataKey="deposited"
                                            name="Total setoran"
                                            stackId="1"
                                            stroke="#10b981"
                                            fill="#10b981"
                                            fillOpacity={0.35}
                                        />
                                        <Area
                                            dataKey="interest"
                                            name="Bunga (setelah pajak)"
                                            stackId="1"
                                            stroke="#8b5cf6"
                                            fill="#8b5cf6"
                                            fillOpacity={0.35}
                                        />
                                        {r.target > 0 && (
                                            <ReferenceLine
                                                y={r.target}
                                                stroke="#f59e0b"
                                                strokeDasharray="4 4"
                                                label={{ value: 'Target', fontSize: 11, fill: '#f59e0b', position: 'insideTopLeft' }}
                                            />
                                        )}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </Section>
                    </div>
                </div>

                <Section title="Ringkasan per Periode">
                    <div className="-mx-4 overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm tabular-nums">
                            <thead className="text-muted-foreground text-xs">
                                <tr className="border-b">
                                    <th className="px-4 py-2 text-left font-medium">Periode</th>
                                    <th className="px-2 py-2 text-right font-medium">Total tabungan</th>
                                    <th className="px-2 py-2 text-right font-medium">Bunga</th>
                                    <th className="px-2 py-2 text-right font-medium">Hasil total</th>
                                    <th className="px-2 py-2 text-right font-medium">Kenaikan</th>
                                    <th className="px-4 py-2 text-right font-medium">Progres target</th>
                                </tr>
                            </thead>
                            <tbody>
                                {r.years
                                    .filter((y) => MILESTONES.includes(y.year) || (r.fireMonth !== null && y.year === Math.ceil(r.fireMonth / 12)))
                                    .map((y) => {
                                        const reached = r.target > 0 && y.balance >= r.target;
                                        return (
                                            <tr key={y.year} className={reached ? 'border-b bg-emerald-500/5' : 'border-b'}>
                                                <td className="px-4 py-2">{y.year} tahun</td>
                                                <td className="px-2 py-2 text-right">{rupiah(y.deposited)}</td>
                                                <td className="px-2 py-2 text-right">{rupiah(y.interest)}</td>
                                                <td className="px-2 py-2 text-right font-medium">{rupiah(y.balance)}</td>
                                                <td className="px-2 py-2 text-right">
                                                    {y.deposited > 0 ? `${((y.interest / y.deposited) * 100).toFixed(1).replace('.', ',')}%` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    {r.target > 0 ? `${Math.min(100, (y.balance / r.target) * 100).toFixed(0)}%` : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </Section>
            </Page>
        </AppLayout>
    );
}
