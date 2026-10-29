import { currentMonth } from '@/components/finance/fixed-items-editor';
import { EmptyState, Page, PageHeader, ProgressBar, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { compact, formatDate, monthLabel, percent, rupiah } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, PiggyBank, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Rekap Bulanan'), href: '/recap' }];
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

type Kind = 'income' | 'expense';

interface Group {
    id: number | null;
    name: string;
    color: string;
    total: number;
    count: number;
    previous: number;
}

interface Tx {
    id: number;
    type: Kind;
    category_id: number | null;
    amount: number;
    date: string;
    note: string | null;
    account: { id: number; name: string } | null;
}

interface TrendRow {
    id: number | null;
    name: string;
    color: string;
    values: number[];
}

interface Props {
    month: string;
    groups: Record<Kind, Group[]>;
    transactions: Tx[];
    trend: { months: { key: string; label: string }[] } & Record<Kind, TrendRow[]>;
}

function shiftMonth(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Perubahan vs bulan lalu; untuk pengeluaran naik = buruk, untuk pemasukan naik = baik. */
function Delta({ now, before, kind }: { now: number; before: number; kind: Kind }) {
    if (!before && !now) return null;
    if (!before) return <span className="text-muted-foreground text-[11px]">{t('baru')}</span>;
    const diff = now - before;
    if (diff === 0) return <span className="text-muted-foreground text-[11px]">{t('sama')}</span>;
    const good = kind === 'income' ? diff > 0 : diff < 0;
    const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
    return (
        <span
            className={cn(
                'inline-flex items-center text-[11px] tabular-nums',
                good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}
            title={t('Bulan lalu :amount', { amount: rupiah(before) })}
        >
            <Icon className="size-3" />
            {Math.abs(Math.round((diff / before) * 100))}%
        </span>
    );
}

function GroupSection({ kind, groups, transactions }: { kind: Kind; groups: Group[]; transactions: Tx[] }) {
    const [open, setOpen] = useState<number | null | undefined>(undefined);
    const rows = groups.filter((g) => g.total > 0 || g.previous > 0);
    const total = rows.reduce((s, g) => s + g.total, 0);
    const title = kind === 'income' ? t('Pemasukan per Kategori') : t('Pengeluaran per Kategori');

    return (
        <Section
            title={title}
            action={
                <span
                    className={cn(
                        'text-sm font-semibold tabular-nums',
                        kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                    )}
                >
                    {rupiah(total)}
                </span>
            }
        >
            {total === 0 ? (
                <EmptyState icon={Receipt} title={kind === 'income' ? t('Belum ada pemasukan') : t('Belum ada pengeluaran')} />
            ) : (
                <>
                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={rows.filter((g) => g.total > 0)}
                                    dataKey="total"
                                    nameKey="name"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={2}
                                >
                                    {rows
                                        .filter((g) => g.total > 0)
                                        .map((g) => (
                                            <Cell key={String(g.id)} fill={g.color} />
                                        ))}
                                </Pie>
                                <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <ul className="mt-2 divide-y">
                        {rows.map((g) => {
                            const expanded = open === g.id;
                            const txs = expanded ? transactions.filter((t) => t.type === kind && t.category_id === g.id) : [];
                            return (
                                <li key={String(g.id)}>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(expanded ? undefined : g.id)}
                                        className="hover:bg-muted/50 -mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-2.5 text-left"
                                        disabled={g.count === 0}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
                                            <Delta now={g.total} before={g.previous} kind={kind} />
                                            <span className="w-24 text-right text-sm font-semibold tabular-nums">{rupiah(g.total)}</span>
                                            <ChevronDown
                                                className={cn(
                                                    'text-muted-foreground size-4 shrink-0 transition',
                                                    expanded && 'rotate-180',
                                                    g.count === 0 && 'invisible',
                                                )}
                                            />
                                        </div>
                                        <div className="mt-1.5 flex items-center gap-2 pl-4.5">
                                            <ProgressBar value={percent(g.total, total)} color={g.color} className="h-1.5" />
                                            <span className="text-muted-foreground w-24 shrink-0 text-right text-[11px] tabular-nums">
                                                {t(':pct% · :n trx', { pct: Math.round(percent(g.total, total)), n: g.count })}
                                            </span>
                                            <span className="w-4 shrink-0" />
                                        </div>
                                    </button>
                                    {expanded && (
                                        <ul className="bg-muted/30 mb-2 divide-y rounded-lg px-3 text-xs">
                                            {txs.map((t) => (
                                                <li key={t.id} className="flex items-center gap-2 py-1.5">
                                                    <span className="text-muted-foreground w-12 shrink-0">
                                                        {formatDate(t.date, { day: 'numeric', month: 'short' })}
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {t.note || '-'}
                                                        {t.account && <span className="text-muted-foreground"> · {t.account.name}</span>}
                                                    </span>
                                                    <span className="font-medium tabular-nums">{rupiah(t.amount)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Section>
    );
}

export default function Recap({ month, groups, transactions, trend }: Props) {
    const [trendKind, setTrendKind] = useState<Kind>('expense');
    const go = (m: string) => router.get(route('recap.index'), { month: m }, { preserveScroll: true, preserveState: true });

    const sum = (k: Kind, f: 'total' | 'previous') => groups[k].reduce((s, g) => s + g[f], 0);
    const income = sum('income', 'total');
    const expense = sum('expense', 'total');
    const net = income - expense;

    const trendRows = trend[trendKind];
    const monthTotals = trend.months.map((_, i) => trendRows.reduce((s, r) => s + r.values[i], 0));
    const selectedIndex = trend.months.findIndex((m) => m.key === month);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Rekap Bulanan')} />
            <Page>
                <PageHeader
                    title={t('Rekap Bulanan')}
                    description={t('Pemasukan dan pengeluaran per kategori dari data transaksi. Transfer antar rekening tidak dihitung.')}
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label={t('Bulan sebelumnya')}>
                        <ChevronLeft />
                    </Button>
                    <button className="text-sm font-semibold" onClick={() => go(currentMonth())} title={t('Kembali ke bulan ini')}>
                        {monthLabel(month, 'long')}
                        {month === currentMonth() && <span className="text-muted-foreground ml-1 font-normal">{t('(berjalan)')}</span>}
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, 1))} aria-label={t('Bulan berikutnya')}>
                        <ChevronRight />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label={t('Pemasukan')}
                        value={rupiah(income)}
                        sub={<Delta now={income} before={sum('income', 'previous')} kind="income" />}
                        icon={ArrowDownRight}
                        tone="positive"
                    />
                    <StatCard
                        label={t('Pengeluaran')}
                        value={rupiah(expense)}
                        sub={<Delta now={expense} before={sum('expense', 'previous')} kind="expense" />}
                        icon={ArrowUpRight}
                        tone="negative"
                    />
                    <StatCard
                        label={t('Sisa')}
                        value={rupiah(net)}
                        tone={net < 0 ? 'negative' : 'default'}
                        sub={net < 0 ? t('pengeluaran melebihi pemasukan') : undefined}
                    />
                    <StatCard
                        label={t('Rasio Tabungan')}
                        value={income ? `${Math.round((net / income) * 100)}%` : '-'}
                        sub={t('idealnya ≥ 20%')}
                        icon={PiggyBank}
                        tone={income && net / income >= 0.2 ? 'positive' : 'default'}
                    />
                </div>
                <p className="text-muted-foreground -mt-2 text-xs">{t('Persentase kecil = perubahan dibanding bulan sebelumnya.')}</p>

                <div className="grid gap-4 lg:grid-cols-2">
                    <GroupSection kind="income" groups={groups.income} transactions={transactions} />
                    <GroupSection kind="expense" groups={groups.expense} transactions={transactions} />
                </div>

                <Section
                    title={t('Tren 12 Bulan')}
                    action={
                        <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                            {(['expense', 'income'] as const).map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    data-active={trendKind === k}
                                    onClick={() => setTrendKind(k)}
                                    className="data-[active=true]:bg-background rounded-md px-2.5 py-1 text-xs font-medium transition data-[active=true]:shadow-sm"
                                >
                                    {k === 'expense' ? t('Pengeluaran') : t('Pemasukan')}
                                </button>
                            ))}
                        </div>
                    }
                >
                    {trendRows.length === 0 ? (
                        <EmptyState icon={Receipt} title={t('Belum ada data')} />
                    ) : (
                        <div className="-mx-4 overflow-x-auto">
                            <table className="w-full min-w-[900px] text-xs tabular-nums">
                                <thead className="text-muted-foreground">
                                    <tr className="border-b">
                                        <th className="bg-card sticky left-0 px-4 py-2 text-left font-medium">{t('Kategori')}</th>
                                        {trend.months.map((m, i) => (
                                            <th
                                                key={m.key}
                                                className={cn(
                                                    'px-2 py-2 text-right font-medium whitespace-nowrap',
                                                    i === selectedIndex && 'text-foreground',
                                                )}
                                            >
                                                <button type="button" onClick={() => go(m.key)} className="hover:underline">
                                                    {m.label}
                                                </button>
                                            </th>
                                        ))}
                                        <th className="px-2 py-2 text-right font-medium">{t('Rata-rata')}</th>
                                        <th className="px-4 py-2 text-right font-medium">{t('Total')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {trendRows.map((r) => {
                                        const rowTotal = r.values.reduce((s, v) => s + v, 0);
                                        const active = r.values.filter((v) => v > 0).length;
                                        return (
                                            <tr key={String(r.id)}>
                                                <td className="bg-card sticky left-0 px-4 py-1.5 whitespace-nowrap">
                                                    <span className="flex items-center gap-2">
                                                        <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                                                        {r.name}
                                                    </span>
                                                </td>
                                                {r.values.map((v, i) => (
                                                    <td
                                                        key={i}
                                                        className={cn(
                                                            'px-2 py-1.5 text-right',
                                                            v === 0 && 'text-muted-foreground/40',
                                                            i === selectedIndex && 'bg-muted/50 font-medium',
                                                        )}
                                                    >
                                                        {v === 0 ? '–' : compact(v)}
                                                    </td>
                                                ))}
                                                <td className="text-muted-foreground px-2 py-1.5 text-right">
                                                    {active ? compact(rowTotal / active) : '–'}
                                                </td>
                                                <td className="px-4 py-1.5 text-right font-semibold">{compact(rowTotal)}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="border-t-2 font-semibold">
                                        <td className="bg-card sticky left-0 px-4 py-2">{t('Total')}</td>
                                        {monthTotals.map((v, i) => (
                                            <td key={i} className={cn('px-2 py-2 text-right', i === selectedIndex && 'bg-muted/50')}>
                                                {v === 0 ? '–' : compact(v)}
                                            </td>
                                        ))}
                                        <td className="text-muted-foreground px-2 py-2 text-right">
                                            {(() => {
                                                const filled = monthTotals.filter((v) => v > 0);
                                                return filled.length ? compact(filled.reduce((s, v) => s + v, 0) / filled.length) : '–';
                                            })()}
                                        </td>
                                        <td className="px-4 py-2 text-right">{compact(monthTotals.reduce((s, v) => s + v, 0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-muted-foreground mt-2 text-xs">
                        {t('Klik nama bulan untuk melihat rekap bulan tersebut. Rata-rata dihitung dari bulan yang ada transaksinya.')}
                    </p>
                </Section>
            </Page>
        </AppLayout>
    );
}
