import { MoneyInput } from '@/components/finance/money-input';
import { MonthPicker } from '@/components/finance/month-picker';
import { PageTabs } from '@/components/finance/page-tabs';
import { PercentInput } from '@/components/finance/percent-input';
import { DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { fire, type FireInput } from '@/lib/calculators';
import { compact, monthLabel, rupiah } from '@/lib/format';
import { jsonFetch } from '@/lib/http';
import { intlLocale, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { Cloud, Flag, Pencil, PiggyBank, Plus, RotateCcw, Target, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Kalkulator FIRE'), href: '/calculator/fire' }];
const STORAGE_KEY = 'keuangan.calculator.fire';
const STORAGE_KEY_ACTUAL = 'keuangan.calculator.fire.actual';
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };
const MILESTONES = [5, 10, 15, 20, 25, 30];
const TAB_KEY = 'keuangan.calculator.fire.tab';

type Tab = 'simulation' | 'actual';

/** Realisasi dana FIRE satu bulan, diisi manual (terpisah dari rekening & transaksi). */
/** Rekening yang ditandai Rekening FIRE: sumber otomatis tab Realisasi. */
interface FireAccount {
    id: number;
    name: string;
    /** Saldo sebelum bulan pertama riwayat */
    opening: number;
}

interface FireEntry {
    id: number;
    month: string;
    deposit: number;
    /** Saldo dana FIRE di akhir bulan */
    balance: number;
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

type Settings = Record<Tab, FireInput>;

/** Angka harus tersimpan sebagai angka (kolom uang yang dikosongkan = 0). */
const clean = (v: FireInput): FireInput => ({
    initial: Number(v.initial) || 0,
    monthlySaving: Number(v.monthlySaving) || 0,
    monthlyExpense: Number(v.monthlyExpense) || 0,
    rate: Number(v.rate) || 0,
    tax: Number(v.tax) || 0,
    withdrawalRate: Number(v.withdrawalRate) || 0,
});

/** Angka lama yang dulu tersimpan di browser perangkat ini (sebelum disimpan di akun). */
function legacySettings(): Settings | null {
    try {
        const sim = localStorage.getItem(STORAGE_KEY);
        const act = localStorage.getItem(STORAGE_KEY_ACTUAL);
        if (!sim && !act) return null;
        return { simulation: { ...DEFAULTS, ...JSON.parse(sim ?? '{}') }, actual: { ...DEFAULTS, ...JSON.parse(act ?? '{}') } };
    } catch {
        return null;
    }
}

export default function FireCalculator({
    entries,
    settings,
    fireAccount,
}: {
    entries: FireEntry[];
    settings: Settings | null;
    fireAccount: FireAccount | null;
}) {
    const [tab, setTab] = useState<Tab>(() => {
        try {
            return localStorage.getItem(TAB_KEY) === 'actual' ? 'actual' : 'simulation';
        } catch {
            return 'simulation';
        }
    });
    // Simulasi dan Realisasi punya variabel sendiri-sendiri, disimpan di akun supaya sama di semua perangkat.
    // Akun belum punya → pakai angka lama di browser ini (sekali dipindahkan ke akun), lalu bawaan.
    const [inputs, setInputs] = useState<Settings>(() => {
        const base = settings ?? legacySettings();
        return { simulation: { ...DEFAULTS, ...base?.simulation }, actual: { ...DEFAULTS, ...base?.actual } };
    });
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const firstRender = useRef(settings !== null);
    const a = inputs[tab];
    const setA = (v: FireInput) => setInputs((prev) => ({ ...prev, [tab]: v }));

    useEffect(() => {
        // Nilai dari akun tidak perlu disimpan ulang saat halaman dibuka
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        setSaveState('saving');
        const timer = setTimeout(() => {
            jsonFetch(route('fire.settings'), { method: 'PUT', body: { simulation: clean(inputs.simulation), actual: clean(inputs.actual) } })
                .then(() => {
                    setSaveState('saved');
                    try {
                        localStorage.removeItem(STORAGE_KEY);
                        localStorage.removeItem(STORAGE_KEY_ACTUAL);
                    } catch {
                        /* abaikan */
                    }
                })
                .catch(() => setSaveState('error'));
        }, 700);
        return () => clearTimeout(timer);
    }, [inputs]);

    useEffect(() => {
        try {
            localStorage.setItem(TAB_KEY, tab);
        } catch {
            /* abaikan */
        }
    }, [tab]);

    const set = <K extends keyof FireInput>(k: K, v: FireInput[K]) => setA({ ...a, [k]: v });
    const r = useMemo(() => fire(a), [a]);
    const periodRows = r.years.filter((y) => MILESTONES.includes(y.year) || (r.fireMonth !== null && y.year === Math.ceil(r.fireMonth / 12)));
    const chartData = r.years.map((y) => ({ label: t('Th :n', { n: y.year }), deposited: y.deposited, interest: y.interest }));
    const fireDate = fireDateFrom(r.fireMonth);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Kalkulator FIRE')} />
            <Page>
                <PageTabs group="calculator" />
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
                        title={tab === 'actual' ? t('Variabel Realisasi') : t('Variabel')}
                        action={
                            <div className="flex items-center gap-2">
                                {/* Status penyimpanan ke akun */}
                                <span
                                    className={cn(
                                        'flex items-center gap-1 text-xs',
                                        saveState === 'error' ? 'text-red-600' : 'text-muted-foreground',
                                    )}
                                >
                                    {saveState === 'saving' && t('Menyimpan…')}
                                    {saveState === 'saved' && (
                                        <>
                                            <Cloud className="size-3.5" /> {t('Tersimpan di akun')}
                                        </>
                                    )}
                                    {saveState === 'error' && t('Gagal menyimpan')}
                                </span>
                                <Button size="sm" variant="ghost" onClick={() => setA(DEFAULTS)}>
                                    <RotateCcw className="size-4" /> {t('Reset')}
                                </Button>
                            </div>
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
                        <Actual entries={entries} input={a} target={r.target} account={fireAccount} />
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
                        {/* HP: kartu per periode supaya tidak perlu geser ke kanan */}
                        <div className="-mx-4 divide-y md:hidden">
                            {periodRows.map((y) => {
                                const reached = r.target > 0 && y.balance >= r.target;
                                return (
                                    <div key={y.year} className={cn('px-4 py-3 text-sm tabular-nums', reached && 'bg-emerald-500/5')}>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-medium">{t(':n tahun', { n: y.year })}</span>
                                            <span className="font-semibold">{rupiah(y.balance)}</span>
                                        </div>
                                        <div className="text-muted-foreground mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                            <span>{t('Total tabungan')}</span>
                                            <span className="text-right">{rupiah(y.deposited)}</span>
                                            <span>{t('Bunga')}</span>
                                            <span className="text-right">
                                                {rupiah(y.interest)}
                                                {y.deposited > 0 && ` (${percent((y.interest / y.deposited) * 100, 1)})`}
                                            </span>
                                            <span>{t('Progres target')}</span>
                                            <span className="text-right">
                                                {r.target > 0 ? `${Math.min(100, (y.balance / r.target) * 100).toFixed(0)}%` : '-'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="-mx-4 hidden overflow-x-auto md:block">
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
                                    {periodRows.map((y) => {
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

function addMonth(month: string, n: number): string {
    const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Realisasi dana FIRE per bulan, dibanding rencana simulasi. Sumbernya Rekening FIRE (otomatis) bila ada,
 * selain itu isian manual (mulai dari dana awal). Hasil invest = saldo − saldo bulan sebelumnya − setoran bulan ini.
 */
function Actual({ entries, input, target, account }: { entries: FireEntry[]; input: FireInput; target: number; account: FireAccount | null }) {
    const [open, setOpen] = useState(false);
    const form = useForm<{ month: string; deposit: number | ''; balance: number | '' }>({ month: '', deposit: '', balance: '' });
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const byMonth = new Map(entries.map((e) => [e.month, e]));

    const openFor = (month: string) => {
        const e = byMonth.get(month);
        form.clearErrors();
        form.setData({ month, deposit: e?.deposit ?? input.monthlySaving, balance: e?.balance ?? '' });
        setOpen(true);
    };
    const submit = () => form.post(route('fire-entries.store'), { preserveScroll: true, onSuccess: () => setOpen(false) });

    const dialog = (
        <FormDialog
            open={open}
            onOpenChange={setOpen}
            title={t('Isi realisasi bulan')}
            description={t('Dana FIRE ini terpisah dari rekening & transaksi di aplikasi.')}
            onSubmit={submit}
            processing={form.processing}
        >
            <Field label={t('Bulan')} error={form.errors.month}>
                <MonthPicker value={form.data.month} onChange={(v) => form.setData('month', v)} clearable={false} />
            </Field>
            <Field label={t('Setoran bulan ini')} error={form.errors.deposit}>
                <MoneyInput value={form.data.deposit} onChange={(v) => form.setData('deposit', v)} />
            </Field>
            <Field label={t('Saldo akhir bulan')} error={form.errors.balance}>
                <MoneyInput value={form.data.balance} onChange={(v) => form.setData('balance', v)} />
            </Field>
        </FormDialog>
    );

    if (entries.length === 0) {
        return (
            <Section title={t('Realisasi')} className="lg:col-span-2">
                <EmptyState
                    icon={Wallet}
                    title={t('Belum ada realisasi')}
                    description={t(
                        'Isi setoran dan saldo dana FIRE kamu tiap bulan, atau tandai satu rekening sebagai Rekening FIRE di halaman Rekening supaya terisi otomatis.',
                    )}
                    action={
                        <Button onClick={() => openFor(thisMonth)}>
                            <Plus className="size-4" /> {t('Isi bulan ini')}
                        </Button>
                    }
                />
                {dialog}
            </Section>
        );
    }

    const growth = (input.rate / 100 / 12) * (1 - input.tax / 100);
    const lastMonth = entries[entries.length - 1].month > thisMonth ? entries[entries.length - 1].month : thisMonth;
    let plan = account ? account.opening : input.initial;
    let prev = plan;
    const rows = [];
    for (let m = entries[0].month; m <= lastMonth; m = addMonth(m, 1)) {
        plan = (plan + input.monthlySaving) * (1 + growth);
        const e = byMonth.get(m) ?? null;
        const row = { month: m, label: monthLabel(m), entry: e, plan, change: e ? e.balance - prev : 0, gain: e ? e.balance - prev - e.deposit : 0 };
        if (e) prev = e.balance;
        rows.push(row);
    }

    const filled = rows.filter((m) => m.entry);
    const last = filled[filled.length - 1];
    const balance = last.entry!.balance;
    const progress = target > 0 ? (balance / target) * 100 : 0;
    const eta = fire({ ...input, initial: balance }).fireMonth;
    const etaDate = fireDateFrom(eta);
    const totalDeposit = entries.reduce((s, e) => s + e.deposit, 0);
    const totalGain = filled.reduce((s, m) => s + m.gain, 0);
    const missing = rows.filter((m) => !m.entry).length;
    const signed = (v: number) => `${v >= 0 ? '+' : ''}${rupiah(v)}`;
    const toneClass = (v: number) => (v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');
    const chartData = rows.map((m) => ({ label: m.label, plan: m.plan, balance: m.entry?.balance ?? null }));

    return (
        <>
            <div className="grid min-w-0 gap-4 lg:col-span-2">
                {account && (
                    <div className="bg-muted/50 rounded-xl border px-4 py-3 text-sm">
                        {t('Otomatis dari rekening')} <b>{account.name}</b>.{' '}
                        <span className="text-muted-foreground">
                            {t('Setoran = transfer ke rekening ini. Perbarui nilainya lewat Cocokkan saldo supaya hasil invest tercatat.')}
                        </span>{' '}
                        <Link href={route('accounts.index')} className="font-medium underline underline-offset-2">
                            {t('Buka Rekening')}
                        </Link>
                    </div>
                )}
                {!account && !byMonth.has(thisMonth) && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                        <span>
                            {t('Realisasi :month belum diisi.', { month: monthLabel(thisMonth, 'long') })}
                            {missing > 1 && ` ${t(':n bulan belum diisi.', { n: missing })}`}
                        </span>
                        <Button size="sm" onClick={() => openFor(thisMonth)}>
                            {t('Isi sekarang')}
                        </Button>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <StatCard label={t('Dana sekarang')} value={rupiah(balance)} sub={monthLabel(last.month, 'long')} icon={Wallet} />
                    <StatCard
                        label={t('Progres target')}
                        value={target > 0 ? percent(Math.min(100, progress), 1) : '-'}
                        sub={t('Kurang :amount', { amount: rupiah(Math.max(0, target - balance)) })}
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
                        label={t('Total hasil invest')}
                        value={signed(totalGain)}
                        sub={t('Total setoran :amount', { amount: rupiah(totalDeposit) })}
                        icon={TrendingUp}
                        tone={totalGain >= 0 ? 'positive' : 'negative'}
                    />
                </div>

                <Section title={t('Realisasi vs Rencana')}>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ left: -10, right: 4, top: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Line dataKey="plan" name={t('Rencana')} stroke="#8b5cf6" strokeDasharray="4 4" dot={false} />
                                <Line dataKey="balance" name={t('Realisasi')} stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Section>
            </div>

            <Section
                title={t('Progres per Bulan')}
                className="lg:col-span-3"
                action={
                    !account && (
                        <Button size="sm" variant="outline" onClick={() => openFor(byMonth.has(thisMonth) ? addMonth(lastMonth, 1) : thisMonth)}>
                            <Plus className="size-4" /> {t('Isi realisasi')}
                        </Button>
                    )
                }
            >
                {/* HP: kartu per bulan supaya tidak perlu geser ke kanan */}
                <div className="-mx-4 divide-y md:hidden">
                    {[...rows].reverse().map((m) => (
                        <div key={m.month} className="px-4 py-3 text-sm tabular-nums">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{m.label}</span>
                                {m.entry ? (
                                    <span className="flex items-center">
                                        <span className="mr-1 font-semibold">{rupiah(m.entry.balance)}</span>
                                        {!account && (
                                            <>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="size-8"
                                                    onClick={() => openFor(m.month)}
                                                    aria-label={t('Ubah')}
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <DeleteButton
                                                    url={route('fire-entries.destroy', m.entry.id)}
                                                    label={t('realisasi :month', { month: m.label })}
                                                >
                                                    <Button size="icon" variant="ghost" className="size-8" aria-label={t('Hapus')}>
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </DeleteButton>
                                            </>
                                        )}
                                    </span>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => openFor(m.month)}>
                                        {t('Isi')}
                                    </Button>
                                )}
                            </div>
                            {m.entry ? (
                                <div className="text-muted-foreground mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                    <span>{t('Setoran')}</span>
                                    <span className="text-right">{rupiah(m.entry.deposit)}</span>
                                    <span>{t('Hasil invest')}</span>
                                    <span className={cn('text-right', toneClass(m.gain))}>{signed(m.gain)}</span>
                                    <span>{t('Kenaikan')}</span>
                                    <span className={cn('text-right', toneClass(m.change))}>{signed(m.change)}</span>
                                    <span>{t('Rencana')}</span>
                                    <span className="text-right">{rupiah(m.plan)}</span>
                                    <span>{t('Selisih')}</span>
                                    <span className={cn('text-right', toneClass(m.entry.balance - m.plan))}>{signed(m.entry.balance - m.plan)}</span>
                                    <span>{t('Progres target')}</span>
                                    <span className="text-right">
                                        {target > 0 ? percent(Math.min(100, (m.entry.balance / target) * 100), 1) : '-'}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-muted-foreground mt-1 flex justify-between text-xs">
                                    <span className="italic">{t('Belum diisi')}</span>
                                    <span>
                                        {t('Rencana')} {rupiah(m.plan)}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="-mx-4 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[820px] text-sm tabular-nums">
                        <thead className="text-muted-foreground text-xs">
                            <tr className="border-b">
                                <th className="px-4 py-2 text-left font-medium">{t('Bulan')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Setoran')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Hasil invest')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Saldo')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Kenaikan')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Rencana')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Selisih')}</th>
                                <th className="px-2 py-2 text-right font-medium">{t('Progres target')}</th>
                                <th className="w-px px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {[...rows].reverse().map((m) =>
                                m.entry ? (
                                    <tr key={m.month} className="border-b">
                                        <td className="px-4 py-2">{m.label}</td>
                                        <td className="px-2 py-2 text-right">{rupiah(m.entry.deposit)}</td>
                                        <td className={cn('px-2 py-2 text-right', toneClass(m.gain))}>{signed(m.gain)}</td>
                                        <td className="px-2 py-2 text-right font-medium">{rupiah(m.entry.balance)}</td>
                                        <td className={cn('px-2 py-2 text-right', toneClass(m.change))}>{signed(m.change)}</td>
                                        <td className="text-muted-foreground px-2 py-2 text-right">{rupiah(m.plan)}</td>
                                        <td className={cn('px-2 py-2 text-right', toneClass(m.entry.balance - m.plan))}>
                                            {signed(m.entry.balance - m.plan)}
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            {target > 0 ? percent(Math.min(100, (m.entry.balance / target) * 100), 1) : '-'}
                                        </td>
                                        <td className="px-4 py-1 whitespace-nowrap">
                                            {!account && (
                                                <>
                                                    <Button size="icon" variant="ghost" className="size-8" onClick={() => openFor(m.month)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <DeleteButton
                                                        url={route('fire-entries.destroy', m.entry.id)}
                                                        label={t('realisasi :month', { month: m.label })}
                                                    >
                                                        <Button size="icon" variant="ghost" className="size-8">
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </DeleteButton>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={m.month} className="text-muted-foreground border-b">
                                        <td className="px-4 py-2">{m.label}</td>
                                        <td colSpan={4} className="px-2 py-2 text-center italic">
                                            {t('Belum diisi')}
                                        </td>
                                        <td className="px-2 py-2 text-right">{rupiah(m.plan)}</td>
                                        <td colSpan={2} />
                                        <td className="px-4 py-1">
                                            <Button size="sm" variant="outline" onClick={() => openFor(m.month)}>
                                                {t('Isi')}
                                            </Button>
                                        </td>
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
            </Section>
            {dialog}
        </>
    );
}
