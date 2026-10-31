import { TransactionForm } from '@/components/finance/transaction-form';
import { TransactionRow } from '@/components/finance/transaction-row';
import { AnimatedNumber, EmptyState, Page, PageHeader, ProgressBar, Section, StatCard, StatusBadge } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { ACCOUNT_TYPES, compact, daysFromToday, formatDate, monthLabel, monthsUntil, percent, rupiah } from '@/lib/format';
import { intlLocale, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import {
    type Account,
    type AgendaItem,
    type Alert,
    type Averages,
    type Debt,
    type EmploymentStatus,
    type Goal,
    type MonthPoint,
    type Position,
    type ProjectionSummary,
    type Transaction,
} from '@/types/finance';
import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    HelpCircle,
    Hourglass,
    Plus,
    Receipt,
    ShieldCheck,
    Sparkles,
    TrendingDown,
    Wallet,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Kondisi Keuangan'), href: '/dashboard' }];

interface HealthCheck {
    key: string;
    label: string;
    value: string;
    status: 'good' | 'warning' | 'bad' | 'unknown';
    hint: string;
}

interface Props {
    trace: {
        scenario: { id: number; name: string } | null;
        summary: ProjectionSummary | null;
        agenda: AgendaItem[];
        alerts: Alert[];
        employment: EmploymentStatus | null;
        debts: (Debt & { paid_count: number; unpaid_count: number; last_period: string | null })[];
        hasStarterData: boolean;
    };
    position: Position;
    averages: Averages;
    thisMonth: MonthPoint;
    series: MonthPoint[];
    health: { score: number | null; checks: HealthCheck[] };
    accounts: Account[];
    expenseByCategory: { name: string; color: string; total: number }[];
    budgets: { id: number; name: string; color: string; amount: number; spent: number }[];
    goals: Goal[];
    recentTransactions: Transaction[];
    netWorth: { month: string; label: string; assets: number; debt: number; net_worth: number }[];
    emergencyTarget: { months: number; monthly: number; amount: number };
    reviewReady: string | null;
}

const statusIcon = {
    good: <CheckCircle2 className="size-5 text-emerald-500" />,
    warning: <AlertTriangle className="size-5 text-amber-500" />,
    bad: <XCircle className="size-5 text-red-500" />,
    unknown: <HelpCircle className="text-muted-foreground size-5" />,
};

function scoreLabel(score: number | null) {
    if (score === null) return { text: t('Belum cukup data'), color: 'text-muted-foreground' };
    if (score >= 80) return { text: t('Sehat'), color: 'text-emerald-600 dark:text-emerald-400' };
    if (score >= 50) return { text: t('Cukup, perlu perbaikan'), color: 'text-amber-600 dark:text-amber-400' };
    return { text: t('Perlu perhatian'), color: 'text-red-600 dark:text-red-400' };
}

const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

export default function Dashboard(props: Props) {
    const {
        trace,
        position,
        averages,
        thisMonth,
        series,
        health,
        accounts,
        expenseByCategory,
        budgets,
        goals,
        recentTransactions,
        netWorth,
        emergencyTarget,
        reviewReady,
    } = props;
    const summary = trace.summary;
    const [txOpen, setTxOpen] = useState(false);
    const net = thisMonth.income - thisMonth.expense;
    const label = scoreLabel(health.score);
    const totalExpense = expenseByCategory.reduce((s, c) => s + c.total, 0);
    // Tagihan lewat jatuh tempo diringkas jadi satu baris supaya agenda tidak penuh merah
    const late = trace.agenda.filter((i) => i.status === 'late');
    // Peringatan paling penting saja yang tampil; sisanya dilipat supaya atas halaman tidak penuh merah
    const [showAlerts, setShowAlerts] = useState(false);
    const alertsShown = showAlerts ? trace.alerts : trace.alerts.slice(0, 2);
    const [showLate, setShowLate] = useState(false);
    const agendaShown = late.length >= 2 && !showLate ? trace.agenda.filter((i) => i.status !== 'late') : trace.agenda;
    const netWorthChange = netWorth.length >= 2 ? netWorth[netWorth.length - 1].net_worth - netWorth[netWorth.length - 2].net_worth : null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Kondisi Keuangan')} />
            <Page>
                <PageHeader
                    title={t('Kondisi Keuangan')}
                    description={t('Ringkasan posisi keuanganmu per :month', { month: thisMonth.label })}
                    actions={
                        <Button onClick={() => setTxOpen(true)} className="hidden md:inline-flex">
                            <Plus /> {t('Catat Transaksi')}
                        </Button>
                    }
                />

                {reviewReady && (
                    <Link
                        href={route('review.index', { month: reviewReady })}
                        className="flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-3 text-sm hover:opacity-80"
                    >
                        <Sparkles className="size-4 shrink-0 text-indigo-500" />
                        <span className="flex-1">{t('Tinjauan bulan lalu sudah siap: ringkasan, kategori yang naik, dan saran.')}</span>
                        <span className="text-primary shrink-0 font-medium">{t('Lihat')}</span>
                    </Link>
                )}

                {accounts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/5 p-4 text-sm">
                        <p className="font-medium">{t('Selamat datang! 👋 Mulai dengan 3 langkah:')}</p>
                        <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-1">
                            <li>
                                {t('Tambahkan')}{' '}
                                <Link className="text-primary underline" href={route('accounts.index')}>
                                    {t('rekening & saldo')}
                                </Link>{' '}
                                {t('yang kamu punya sekarang.')}
                            </li>
                            <li>
                                {t('Isi|langkah')}{' '}
                                <Link className="text-primary underline" href={route('plan.index')}>
                                    {t('pemasukan & pengeluaran rutin')}
                                </Link>{' '}
                                {t('untuk dasar proyeksi.')}
                            </li>
                            <li>
                                {t('Buat')}{' '}
                                <Link className="text-primary underline" href={route('goals.index')}>
                                    {t('target keuangan')}
                                </Link>{' '}
                                {t('dan catat')}{' '}
                                <Link className="text-primary underline" href={route('debts.index')}>
                                    {t('utang/cicilan')}
                                </Link>{' '}
                                {t('jika ada.')}
                            </li>
                        </ol>
                    </div>
                )}

                {!trace.hasStarterData && (
                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-blue-500/50 bg-blue-500/5 p-4 text-sm sm:flex-row sm:items-center">
                        <div className="flex-1">
                            <p className="font-medium">{t('Isi data awal dari rencana 21 Okt 2026?')}</p>
                            <p className="text-muted-foreground">
                                {t(
                                    'Cicilan mobil (14 bln) & rumah, investasi di teman 150 jt, Pelagic 34 jt, JHT 6 jt, dan 3 skenario proyeksi. Bisa diubah setelahnya.',
                                )}
                            </p>
                        </div>
                        <Button onClick={() => router.post(route('setup.starter'), {}, { preserveScroll: true })}>
                            <Sparkles /> {t('Isi data awal')}
                        </Button>
                    </div>
                )}

                {trace.alerts.length > 0 && (
                    <ul className="space-y-2">
                        {alertsShown.map((a, i) => (
                            <li key={i}>
                                <Link
                                    href={a.url}
                                    className={cn(
                                        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition hover:opacity-80',
                                        a.level === 'bad'
                                            ? 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400'
                                            : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
                                    )}
                                >
                                    {a.level === 'bad' ? (
                                        <XCircle className="mt-0.5 size-4 shrink-0" />
                                    ) : (
                                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                    )}
                                    {a.message}
                                </Link>
                            </li>
                        ))}
                        {trace.alerts.length > 2 && (
                            <li>
                                <button
                                    type="button"
                                    onClick={() => setShowAlerts((v) => !v)}
                                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-1 text-xs"
                                >
                                    <ChevronDown className={cn('size-3.5 transition', showAlerts && 'rotate-180')} />
                                    {showAlerts ? t('Ringkas peringatan') : t(':n peringatan lainnya', { n: trace.alerts.length - 2 })}
                                </button>
                            </li>
                        )}
                    </ul>
                )}

                <div className="grid gap-3 lg:grid-cols-3">
                    {/* Kartu utama: uang yang benar-benar bisa dipakai, plus ringkasan bulan ini */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-900/20 lg:col-span-2 dark:from-emerald-700 dark:via-emerald-800 dark:to-teal-900">
                        <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-white/10" />
                        <div className="pointer-events-none absolute -bottom-20 -left-10 size-40 rounded-full bg-white/5" />
                        <div className="relative">
                            <div className="flex items-center gap-2 text-sm text-emerald-50/90">
                                <Wallet className="size-4" /> {t('Uang Siap Pakai')}
                            </div>
                            <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                                <AnimatedNumber value={position.spendable} format={rupiah} />
                            </div>
                            <div className="mt-1 text-xs text-emerald-50/80">
                                {position.held > 0
                                    ? t('Tanpa titipan :held · Piutang :rcv', { held: compact(position.held), rcv: compact(position.receivables) })
                                    : t('Piutang :rcv · Aset :assets', {
                                          rcv: compact(position.receivables),
                                          assets: compact(position.other_assets + position.investment),
                                      })}
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-2">
                                <div className="min-w-0 rounded-xl bg-white/10 p-2.5 backdrop-blur-sm">
                                    <div className="text-[11px] leading-tight text-emerald-50/80">{t('Kekayaan Bersih')}</div>
                                    <div className="truncate text-sm font-semibold tabular-nums sm:text-base">{compact(position.net_worth)}</div>
                                    {netWorthChange !== null && (
                                        <div className="truncate text-[11px] text-emerald-50/80" title={t('vs bulan lalu')}>
                                            {netWorthChange >= 0 ? '▲' : '▼'} {compact(Math.abs(netWorthChange))}
                                        </div>
                                    )}
                                </div>
                                <Link
                                    href={route('recap.index')}
                                    className="min-w-0 rounded-xl bg-white/10 p-2.5 backdrop-blur-sm transition hover:bg-white/15"
                                >
                                    <div className="flex items-center gap-1 text-[11px] leading-tight text-emerald-50/80">
                                        <ArrowDownRight className="size-3" /> {t('Masuk bulan ini')}
                                    </div>
                                    <div className="truncate text-sm font-semibold tabular-nums sm:text-base">{compact(thisMonth.income)}</div>
                                    <div className="truncate text-[11px] text-emerald-50/80">
                                        {t('rata² :amount', { amount: compact(averages.income) })}
                                    </div>
                                </Link>
                                <Link
                                    href={route('recap.index')}
                                    className="min-w-0 rounded-xl bg-white/10 p-2.5 backdrop-blur-sm transition hover:bg-white/15"
                                >
                                    <div className="flex items-center gap-1 text-[11px] leading-tight text-emerald-50/80">
                                        <ArrowUpRight className="size-3" /> {t('Keluar bulan ini')}
                                    </div>
                                    <div className="truncate text-sm font-semibold tabular-nums sm:text-base">{compact(thisMonth.expense)}</div>
                                    <div className={cn('truncate text-[11px]', net < 0 ? 'font-medium text-amber-200' : 'text-emerald-50/80')}>
                                        {t('sisa :amount', { amount: compact(net) })}
                                    </div>
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                        <StatCard
                            label={t('Dana Darurat')}
                            value={rupiah(position.emergency_fund)}
                            sub={
                                emergencyTarget.amount > 0 ? (
                                    <span className="block">
                                        <ProgressBar
                                            className="mb-1"
                                            value={percent(position.emergency_fund, emergencyTarget.amount)}
                                            color="#10b981"
                                        />
                                        {t(':n dari :target bln pengeluaran', {
                                            n: (position.emergency_fund / emergencyTarget.monthly).toLocaleString(intlLocale, {
                                                maximumFractionDigits: 1,
                                            }),
                                            target: emergencyTarget.months,
                                        })}
                                        {position.emergency_fund < emergencyTarget.amount &&
                                            t(' · kurang :amount', { amount: compact(emergencyTarget.amount - position.emergency_fund) })}
                                        {!position.emergency_fund_flagged && t(' · tandai rekening dana darurat')}
                                    </span>
                                ) : undefined
                            }
                            icon={ShieldCheck}
                        />
                        <StatCard
                            label={t('Runway Tanpa Gaji')}
                            value={
                                summary
                                    ? summary.runway_months === null
                                        ? '∞'
                                        : t(':n bln', { n: summary.runway_months.toLocaleString(intlLocale) })
                                    : '-'
                            }
                            sub={
                                summary
                                    ? summary.monthly_burn > 0
                                        ? t('kas :cash ÷ defisit :burn/bln', {
                                              cash: compact(summary.liquid_now),
                                              burn: compact(summary.monthly_burn),
                                          })
                                        : t('tidak defisit walau tanpa gaji')
                                    : t('Buka Proyeksi untuk membuat skenario')
                            }
                            icon={Hourglass}
                            tone={summary?.runway_months != null && summary.runway_months < 3 ? 'negative' : 'default'}
                        />
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title={t('7 Hari ke Depan')}>
                        {trace.agenda.length === 0 ? (
                            <EmptyState
                                icon={CalendarClock}
                                title={t('Tidak ada tagihan atau penerimaan')}
                                description={t('Cicilan & piutang berjadwal muncul di sini.')}
                            />
                        ) : (
                            <ul className="divide-y">
                                {late.length >= 2 && (
                                    <li>
                                        <button
                                            type="button"
                                            onClick={() => setShowLate((v) => !v)}
                                            className="flex w-full items-center gap-3 py-2 text-left"
                                        >
                                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
                                                <AlertTriangle className="size-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium">{t(':n tagihan terlambat', { n: late.length })}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {showLate ? t('Ketuk untuk ringkas') : t('Ketuk untuk lihat rinciannya')}
                                                </div>
                                            </div>
                                            <div className="text-right text-sm font-semibold text-red-600 tabular-nums dark:text-red-400">
                                                {compact(late.reduce((sum, i) => sum + i.amount, 0))}
                                            </div>
                                            <ChevronDown
                                                className={cn('text-muted-foreground size-4 shrink-0 transition', showLate && 'rotate-180')}
                                            />
                                        </button>
                                    </li>
                                )}
                                {agendaShown.map((item) => {
                                    const days = daysFromToday(item.due_date);
                                    return (
                                        <li key={`${item.kind}-${item.id}`}>
                                            <Link href={item.url} className="flex items-center gap-3 py-2">
                                                <div
                                                    className={cn(
                                                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                                                        item.kind !== 'receivable'
                                                            ? 'bg-red-500/10 text-red-600'
                                                            : 'bg-emerald-500/10 text-emerald-600',
                                                    )}
                                                >
                                                    {item.kind !== 'receivable' ? (
                                                        <ArrowUpRight className="size-4" />
                                                    ) : (
                                                        <ArrowDownRight className="size-4" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{item.title}</div>
                                                    <div className="text-muted-foreground text-xs">
                                                        {formatDate(item.due_date, { day: 'numeric', month: 'short' })} ·{' '}
                                                        {days < 0
                                                            ? t('lewat :n hari', { n: -days })
                                                            : days === 0
                                                              ? t('hari ini')
                                                              : t(':n hari lagi', { n: days })}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-semibold tabular-nums">{compact(item.amount)}</div>
                                                    <StatusBadge status={item.status} />
                                                </div>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title={t('Progres Utang')}
                        action={
                            <Link href={route('debts.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Kelola')}
                            </Link>
                        }
                    >
                        {trace.debts.length === 0 ? (
                            <EmptyState icon={CheckCircle2} title={t('Tidak ada utang aktif')} />
                        ) : (
                            <ul className="space-y-3">
                                {trace.debts.map((d) => {
                                    const total = d.paid_count + d.unpaid_count;
                                    const p = total ? percent(d.paid_count, total) : percent(d.total_amount - d.remaining_amount, d.total_amount);
                                    return (
                                        <li key={d.id}>
                                            <div className="mb-1 flex justify-between gap-2 text-sm">
                                                <span className="truncate font-medium">{d.name}</span>
                                                <span className="text-muted-foreground shrink-0 text-xs">
                                                    {Math.round(p)}%{total ? t(' · :n bln lagi', { n: d.unpaid_count }) : ''}
                                                </span>
                                            </div>
                                            <ProgressBar value={p} color="#10b981" />
                                            <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                                                {t('Sisa :amount', { amount: compact(d.remaining_amount) })}
                                                {d.last_period && t(' · lunas :month', { month: monthLabel(d.last_period, 'long') })}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title={trace.scenario ? t('Proyeksi · :name', { name: trace.scenario.name }) : t('Proyeksi')}
                        action={
                            <Link href={route('projection.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Buka')}
                            </Link>
                        }
                    >
                        {!summary ? (
                            <EmptyState
                                icon={TrendingDown}
                                title={t('Belum ada skenario')}
                                action={<Link href={route('projection.index')}>{t('Buat skenario')}</Link>}
                            />
                        ) : (
                            <dl className="divide-y text-sm">
                                {[
                                    [
                                        t('Saldo kas terendah'),
                                        <span className={cn(summary.min_balance < 0 && 'text-red-600')}>{rupiah(summary.min_balance)}</span>,
                                    ],
                                    [t('Bulan saldo terendah'), summary.min_month ?? '-'],
                                    [t('Selisih/bln tanpa gaji'), summary.net_without_salary === null ? '-' : rupiah(summary.net_without_salary)],
                                    [t('Selisih/bln dengan gaji'), summary.net_with_salary === null ? '-' : rupiah(summary.net_with_salary)],
                                    [t('Mobil Lunas'), summary.car_paid_off ?? '-'],
                                    [t('Saldo akhir proyeksi'), rupiah(summary.end_balance)],
                                ].map(([label, value]) => (
                                    <div key={String(label)} className="flex justify-between gap-2 py-1.5">
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="font-medium tabular-nums">{value}</dd>
                                    </div>
                                ))}
                                {trace.employment && (
                                    <div className="flex justify-between gap-2 py-1.5">
                                        <dt className="text-muted-foreground">{t('Status kerja')}</dt>
                                        <dd className="font-medium">
                                            {trace.employment.status === 'employed' ? t('Bekerja') : t('Tidak bekerja')} {t('sejak')}{' '}
                                            {formatDate(trace.employment.since)}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        )}
                    </Section>
                </div>

                <Section title={t('Kekayaan Bersih 12 Bulan')}>
                    <div className="h-60">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={netWorth} margin={{ left: -10, right: 4, top: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="assets" name={t('Aset')} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                                <Bar dataKey="debt" name={t('Utang')} fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={18} />
                                <Line
                                    dataKey="net_worth"
                                    name={t('Kekayaan Bersih')}
                                    stroke="#6366f1"
                                    strokeWidth={2.5}
                                    dot={false}
                                    type="monotone"
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </Section>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title={t('Kesehatan Keuangan')} className="lg:col-span-1">
                        <div className="mb-4 flex items-center gap-4">
                            <div className="relative size-20 shrink-0">
                                <svg viewBox="0 0 36 36" className="size-20 -rotate-90">
                                    <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="3" />
                                    <circle
                                        cx="18"
                                        cy="18"
                                        r="15.9"
                                        fill="none"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeDasharray={`${health.score ?? 0} 100`}
                                        className={cn(
                                            (health.score ?? 0) >= 80
                                                ? 'stroke-emerald-500'
                                                : (health.score ?? 0) >= 50
                                                  ? 'stroke-amber-500'
                                                  : 'stroke-red-500',
                                        )}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{health.score ?? '–'}</div>
                            </div>
                            <div>
                                <div className={cn('font-semibold', label.color)}>{label.text}</div>
                                <p className="text-muted-foreground text-xs">
                                    {t('Dihitung dari :n bulan data terakhir dan saldo rekening.', { n: averages.months_of_data || 0 })}
                                </p>
                            </div>
                        </div>
                        <ul className="divide-y">
                            {health.checks.map((c) => (
                                <li key={c.key} className="flex gap-3 py-2.5">
                                    <div className="pt-0.5">{statusIcon[c.status]}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between gap-2 text-sm">
                                            <span className="font-medium">{c.label}</span>
                                            <span className="font-semibold tabular-nums">{c.value}</span>
                                        </div>
                                        <p className="text-muted-foreground text-xs">{c.hint}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Section>

                    <Section title={t('Arus Kas 12 Bulan')} className="lg:col-span-2">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={series} margin={{ left: -10, right: 4, top: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                                    <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="income" name={t('Pemasukan')} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                    <Bar dataKey="expense" name={t('Pengeluaran')} fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                    <Line dataKey="net" name={t('Selisih')} stroke="#3b82f6" strokeWidth={2} dot={false} type="monotone" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Section>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title={t('Pengeluaran Bulan Ini')}>
                        {expenseByCategory.length === 0 ? (
                            <EmptyState icon={Receipt} title={t('Belum ada pengeluaran')} />
                        ) : (
                            <>
                                <div className="h-44">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={expenseByCategory}
                                                dataKey="total"
                                                nameKey="name"
                                                innerRadius={50}
                                                outerRadius={75}
                                                paddingAngle={2}
                                            >
                                                {expenseByCategory.map((c) => (
                                                    <Cell key={c.name} fill={c.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <ul className="mt-2 space-y-1.5 text-sm">
                                    {expenseByCategory.slice(0, 6).map((c) => (
                                        <li key={c.name} className="flex items-center gap-2">
                                            <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                            <span className="flex-1 truncate">{c.name}</span>
                                            <span className="text-muted-foreground text-xs">{Math.round(percent(c.total, totalExpense))}%</span>
                                            <span className="font-medium tabular-nums">{compact(c.total)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Section>

                    <Section
                        title={t('Anggaran Bulan Ini')}
                        action={
                            <Link href={route('budgets.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Atur')}
                            </Link>
                        }
                    >
                        {budgets.length === 0 ? (
                            <EmptyState icon={Receipt} title={t('Belum ada anggaran')} description={t('Tetapkan batas pengeluaran per kategori.')} />
                        ) : (
                            <ul className="space-y-3">
                                {budgets.slice(0, 6).map((b) => {
                                    const p = percent(b.spent, b.amount);
                                    const over = b.spent > b.amount;
                                    return (
                                        <li key={b.id}>
                                            <div className="mb-1 flex justify-between text-sm">
                                                <span className="truncate">{b.name}</span>
                                                <span className={cn('tabular-nums', over && 'font-semibold text-red-600')}>
                                                    {compact(b.spent)} / {compact(b.amount)}
                                                </span>
                                            </div>
                                            <ProgressBar value={p} color={over ? '#ef4444' : p > 80 ? '#f59e0b' : '#10b981'} />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title={t('Target Keuangan')}
                        action={
                            <Link href={route('goals.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Lihat semua')}
                            </Link>
                        }
                    >
                        {goals.length === 0 ? (
                            <EmptyState icon={Receipt} title={t('Belum ada target')} description={t('Misal: dana darurat, DP rumah, pensiun.')} />
                        ) : (
                            <ul className="space-y-3">
                                {goals.slice(0, 5).map((g) => {
                                    const left = monthsUntil(g.target_date);
                                    return (
                                        <li key={g.id}>
                                            <div className="mb-1 flex justify-between gap-2 text-sm">
                                                <span className="truncate font-medium">{g.name}</span>
                                                <span className="text-muted-foreground shrink-0 text-xs">
                                                    {Math.round(percent(g.current_amount, g.target_amount))}%
                                                    {left !== null && t(' · :n bln lagi', { n: left })}
                                                </span>
                                            </div>
                                            <ProgressBar value={percent(g.current_amount, g.target_amount)} color={g.color} />
                                            <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                                                {t(':current dari :target', { current: compact(g.current_amount), target: compact(g.target_amount) })}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section
                        title={t('Rekening')}
                        action={
                            <Link href={route('accounts.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Kelola')}
                            </Link>
                        }
                    >
                        {accounts.length === 0 ? (
                            <EmptyState icon={Wallet} title={t('Belum ada rekening')} />
                        ) : (
                            <ul className="divide-y">
                                {accounts.map((a) => (
                                    <li key={a.id} className="flex items-center gap-3 py-2">
                                        <span className="size-3 rounded-full" style={{ backgroundColor: a.color }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{a.name}</div>
                                            <div className="text-muted-foreground text-xs">{ACCOUNT_TYPES[a.type]}</div>
                                        </div>
                                        <span className={cn('text-sm font-semibold tabular-nums', a.balance < 0 && 'text-red-600')}>
                                            {rupiah(a.balance)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>

                    <Section
                        title={t('Transaksi Terakhir')}
                        className="lg:col-span-2"
                        action={
                            <Link href={route('transactions.index')} className="text-muted-foreground text-xs hover:underline">
                                {t('Lihat semua')}
                            </Link>
                        }
                    >
                        {recentTransactions.length === 0 ? (
                            <EmptyState icon={Receipt} title={t('Belum ada transaksi')} />
                        ) : (
                            <div className="divide-y">
                                {recentTransactions.map((tx) => (
                                    <TransactionRow key={tx.id} tx={tx} />
                                ))}
                            </div>
                        )}
                    </Section>
                </div>
            </Page>
            <TransactionForm open={txOpen} onOpenChange={setTxOpen} />
        </AppLayout>
    );
}
