import { MoneyInput } from '@/components/finance/money-input';
import { PercentInput } from '@/components/finance/percent-input';
import { Field, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { fire, type FireInput } from '@/lib/calculators';
import { compact, rupiah } from '@/lib/format';
import { intlLocale, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Deferred, Head } from '@inertiajs/react';
import { Flag, PiggyBank, RotateCcw, Target, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Kalkulator FIRE'), href: '/calculator/fire' }];
const STORAGE_KEY = 'keuangan.calculator.fire';
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };
const MILESTONES = [5, 10, 15, 20, 25, 30];
const TAB_KEY = 'keuangan.calculator.fire.tab';

type Tab = 'simulation' | 'actual';

interface HistoryMonth {
    month: string;
    label: string;
    net_worth: number;
    /** Selisih kekayaan bersih dibanding akhir bulan sebelumnya */
    change: number;
    /** Pemasukan − pengeluaran pribadi di luar rekening investasi */
    saving: number;
    /** Hasil rekening investasi + kenaikan nilai aset investasi di luar setoran/pencairan */
    investment_return: number;
}

const DEFAULTS: FireInput = {
    initial: 0,
    monthlySaving: 5_000_000,
    rate: 8.5,
    tax: 20,
    monthlyExpense: 7_500_000,
    withdrawalRate: 5,
};

function percent(v: number, digits = 0): string {
    return `${v.toFixed(digits).replace('.', ',')}%`;
}

function fireDateFrom(months: number | null): Date | null {
    return months !== null ? new Date(new Date().getFullYear(), new Date().getMonth() + months, 1) : null;
}

function duration(months: number): string {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y && t(':n tahun', { n: y }), m && t(':n bulan', { n: m })].filter(Boolean).join(' ') || t('Sekarang');
}

export default function FireCalculator({ history }: { history?: HistoryMonth[] }) {
    const [tab, setTab] = useState<Tab>(() => {
        try {
            return localStorage.getItem(TAB_KEY) === 'actual' ? 'actual' : 'simulation';
        } catch {
            return 'simulation';
        }
    });
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

    useEffect(() => {
        try {
            localStorage.setItem(TAB_KEY, tab);
        } catch {
            /* abaikan */
        }
    }, [tab]);

    const set = <K extends keyof FireInput>(k: K, v: FireInput[K]) => setA((prev) => ({ ...prev, [k]: v }));
    const r = useMemo(() => fire(a), [a]);
    const chartData = r.years.map((y) => ({ label: t('Th :n', { n: y.year }), deposited: y.deposited, interest: y.interest }));
    const fireDate = fireDateFrom(r.fireMonth);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Kalkulator FIRE')} />
            <Page>
                <PageHeader
                    title={t('Kalkulator FIRE')}
                    description={t('Berapa dana yang harus terkumpul supaya bebas finansial, dan berapa lama kamu bisa mencapainya.')}
                />

                <div className="inline-flex w-fit gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
                    {(
                        [
                            ['simulation', t('Simulasi')],
                            ['actual', t('Realisasi')],
                        ] as const
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setTab(value)}
                            className={cn(
                                'rounded-md px-3.5 py-1.5 text-sm transition-colors',
                                tab === value
                                    ? 'bg-white shadow-xs dark:bg-neutral-700 dark:text-neutral-100'
                                    : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-700/60',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section
                        title={t('Variabel')}
                        action={
                            <Button size="sm" variant="ghost" onClick={() => setA(DEFAULTS)}>
                                <RotateCcw className="size-4" /> {t('Reset')}
                            </Button>
                        }
                    >
                        <div className="grid gap-4">
                            <Field label={t('Pengeluaran per bulan')}>
                                <MoneyInput value={a.monthlyExpense} onChange={(v) => set('monthlyExpense', v || 0)} />
                            </Field>
                            <Field label={t('Tabungan / investasi per bulan')}>
                                <MoneyInput value={a.monthlySaving} onChange={(v) => set('monthlySaving', v || 0)} />
                            </Field>
                            <Field label={t('Dana awal yang sudah ada')}>
                                <MoneyInput value={a.initial} onChange={(v) => set('initial', v || 0)} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('Return / tahun')} htmlFor="rate">
                                    <PercentInput id="rate" value={a.rate} onChange={(v) => set('rate', v)} />
                                </Field>
                                <Field label={t('Pajak bunga')} htmlFor="tax">
                                    <PercentInput id="tax" value={a.tax} onChange={(v) => set('tax', v)} />
                                </Field>
                            </div>
                            <Field label={t('Asumsi return saat pensiun (penarikan / tahun)')} htmlFor="swr">
                                <PercentInput id="swr" value={a.withdrawalRate} onChange={(v) => set('withdrawalRate', v)} />
                            </Field>
                            <p className="text-muted-foreground text-xs">
                                {t('Dana target = pengeluaran per tahun ÷ asumsi return. Contoh:')} {rupiah(a.monthlyExpense)} × 12 ={' '}
                                {rupiah(r.annualExpense)} ÷ {String(a.withdrawalRate).replace('.', ',')}% = {rupiah(r.target)}.
                            </p>
                        </div>
                    </Section>

                    {tab === 'actual' ? (
                        <Deferred data="history" fallback={<div className="text-muted-foreground p-4 text-sm lg:col-span-2">{t('Memuat...')}</div>}>
                            <Actual history={history ?? []} input={a} target={r.target} />
                        </Deferred>
                    ) : (
                        <div className="grid min-w-0 gap-4 lg:col-span-2">
                            <div className="grid grid-cols-2 gap-3">
                                <StatCard label={t('Pengeluaran / tahun')} value={rupiah(r.annualExpense)} icon={Wallet} />
                                <StatCard label={t('Dana harus terkumpul')} value={rupiah(r.target)} icon={Target} />
                                <StatCard
                                    label={t('Waktu mencapai FIRE')}
                                    value={r.fireMonth !== null ? duration(r.fireMonth) : t('> 100 tahun')}
                                    sub={fireDate && fireDate.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })}
                                    icon={Flag}
                                    tone={r.fireMonth !== null ? 'positive' : 'negative'}
                                />
                                <StatCard
                                    label={t('Passive income / bulan')}
                                    value={rupiah((r.target * a.withdrawalRate) / 100 / 12)}
                                    sub={t('Dari dana target, setelah tercapai')}
                                    icon={PiggyBank}
                                />
                            </div>

                            <Section title={t('Pertumbuhan Dana')}>
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
                                                name={t('Total setoran')}
                                                stackId="1"
                                                stroke="#10b981"
                                                fill="#10b981"
                                                fillOpacity={0.35}
                                            />
                                            <Area
                                                dataKey="interest"
                                                name={t('Bunga (setelah pajak)')}
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
                                                    label={{ value: t('Target'), fontSize: 11, fill: '#f59e0b', position: 'insideTopLeft' }}
                                                />
                                            )}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Section>
                        </div>
                    )}
                </div>

                {tab === 'simulation' && (
                    <Section title={t('Ringkasan per Periode')}>
                        <div className="-mx-4 overflow-x-auto">
                            <table className="w-full min-w-[560px] text-sm tabular-nums">
                                <thead className="text-muted-foreground text-xs">
                                    <tr className="border-b">
                                        <th className="px-4 py-2 text-left font-medium">{t('Periode')}</th>
                                        <th className="px-2 py-2 text-right font-medium">{t('Total tabungan')}</th>
                                        <th className="px-2 py-2 text-right font-medium">{t('Bunga')}</th>
                                        <th className="px-2 py-2 text-right font-medium">{t('Hasil total')}</th>
                                        <th className="px-2 py-2 text-right font-medium">{t('Kenaikan')}</th>
                                        <th className="px-4 py-2 text-right font-medium">{t('Progres target')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {r.years
                                        .filter(
                                            (y) => MILESTONES.includes(y.year) || (r.fireMonth !== null && y.year === Math.ceil(r.fireMonth / 12)),
                                        )
                                        .map((y) => {
                                            const reached = r.target > 0 && y.balance >= r.target;
                                            return (
                                                <tr key={y.year} className={reached ? 'border-b bg-emerald-500/5' : 'border-b'}>
                                                    <td className="px-4 py-2">{t(':n tahun', { n: y.year })}</td>
                                                    <td className="px-2 py-2 text-right">{rupiah(y.deposited)}</td>
                                                    <td className="px-2 py-2 text-right">{rupiah(y.interest)}</td>
                                                    <td className="px-2 py-2 text-right font-medium">{rupiah(y.balance)}</td>
                                                    <td className="px-2 py-2 text-right">
                                                        {y.deposited > 0 ? percent((y.interest / y.deposited) * 100, 1) : '-'}
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
                )}
            </Page>
        </AppLayout>
    );
}

/** Kekayaan bersih nyata per bulan dibanding rencana (simulasi yang dimulai dari saldo awal bulan pertama). */
function Actual({ history, input, target }: { history: HistoryMonth[]; input: FireInput; target: number }) {
    const growth = (input.rate / 100 / 12) * (1 - input.tax / 100);
    let plan = history.length ? history[0].net_worth - history[0].change : 0;
    const rows = history.map((h) => {
        plan = (plan + input.monthlySaving) * (1 + growth);
        return { ...h, plan };
    });

    const last = rows[rows.length - 1];
    if (!last) return null;
    const progress = target > 0 ? (last.net_worth / target) * 100 : 0;
    const eta = fire({ ...input, initial: Math.max(0, last.net_worth) }).fireMonth;
    const etaDate = fireDateFrom(eta);
    const avgChange = rows.reduce((s, m) => s + m.change, 0) / rows.length;
    const totalReturn = rows.reduce((s, m) => s + m.investment_return, 0);
    const signed = (v: number) => `${v >= 0 ? '+' : ''}${rupiah(v)}`;
    const toneClass = (v: number) => (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');

    return (
        <>
            <div className="grid min-w-0 gap-4 lg:col-span-2">
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        label={t('Dana sekarang')}
                        value={rupiah(last.net_worth)}
                        sub={t('Kekayaan bersih :month', { month: last.label })}
                        icon={Wallet}
                    />
                    <StatCard
                        label={t('Progres target')}
                        value={target > 0 ? percent(Math.min(100, progress), 1) : '-'}
                        sub={t('Kurang :amount', { amount: rupiah(Math.max(0, target - last.net_worth)) })}
                        icon={Target}
                        tone={progress >= 100 ? 'positive' : 'default'}
                    />
                    <StatCard
                        label={t('Estimasi FIRE dari posisi sekarang')}
                        value={eta !== null ? duration(eta) : t('> 100 tahun')}
                        sub={etaDate && etaDate.toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })}
                        icon={Flag}
                        tone={eta !== null ? 'positive' : 'negative'}
                    />
                    <StatCard
                        label={t('Rata-rata kenaikan / bulan')}
                        value={rupiah(avgChange)}
                        sub={t('Rencana setoran :amount · hasil invest :return', {
                            amount: rupiah(input.monthlySaving),
                            return: signed(totalReturn),
                        })}
                        icon={TrendingUp}
                        tone={avgChange >= input.monthlySaving ? 'positive' : 'negative'}
                    />
                </div>

                <Section title={t('Realisasi vs Rencana')}>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={rows} margin={{ left: -10, right: 4, top: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Line dataKey="plan" name={t('Rencana')} stroke="#8b5cf6" strokeDasharray="4 4" dot={false} />
                                <Line dataKey="net_worth" name={t('Realisasi')} stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Section>
            </div>

            <Section title={t('Progres per Bulan')} className="lg:col-span-3">
                <div className="-mx-4 overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm tabular-nums">
                        <thead className="text-muted-foreground text-xs">
                            <tr className="border-b">
                                <th className="px-4 py-2 text-left font-medium">{t('Bulan')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Saldo realisasi')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Tabungan')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Hasil invest')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Kenaikan')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Rencana')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Selisih')}</th>
                                <th className="px-4 py-2 text-right font-medium">{t('Progres target')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...rows].reverse().map((m) => (
                                <tr key={m.month} className="border-b">
                                    <td className="px-4 py-2">{m.label}</td>
                                    <td className="px-2 py-2 text-right font-medium">{rupiah(m.net_worth)}</td>
                                    <td className={cn('px-2 py-2 text-right', toneClass(m.saving))}>{signed(m.saving)}</td>
                                    <td className={cn('px-2 py-2 text-right', toneClass(m.investment_return))}>{signed(m.investment_return)}</td>
                                    <td className={cn('px-2 py-2 text-right font-medium', toneClass(m.change))}>{signed(m.change)}</td>
                                    <td className="text-muted-foreground px-2 py-2 text-right">{rupiah(m.plan)}</td>
                                    <td className={cn('px-2 py-2 text-right', toneClass(m.net_worth - m.plan))}>{signed(m.net_worth - m.plan)}</td>
                                    <td className="px-4 py-2 text-right">
                                        {target > 0 ? percent(Math.min(100, (m.net_worth / target) * 100), 1) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>
        </>
    );
}
