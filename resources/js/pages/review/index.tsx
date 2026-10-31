import { currentMonth } from '@/components/finance/fixed-items-editor';
import { PageTabs } from '@/components/finance/page-tabs';
import { EmptyState, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { compact, formatDate, rupiah } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Lightbulb, Printer, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Tinjauan Bulanan'), href: '/review' }];

type Cat = { id: number | null; name: string; color: string };
interface Review {
    month: string;
    label: string;
    income: number;
    expense: number;
    previous: { income: number; expense: number };
    saving_rate: number | null;
    net_worth: { start: number | null; end: number | null };
    top: (Cat & { total: number; previous: number; diff: number })[];
    increases: (Cat & { total: number; previous: number; diff: number })[];
    over_budget: (Cat & { limit: number; spent: number })[];
    largest: { id: number; amount: number; date: string; note: string | null; category: Cat | null }[];
    late: number;
    uncategorized: number;
    tips: string[];
}

function shift(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function Change({ now, before, good }: { now: number; before: number; good: 'up' | 'down' }) {
    if (!before) return <span>{t('bulan lalu -')}</span>;
    const pct = Math.round(((now - before) / before) * 100);
    const better = good === 'up' ? pct >= 0 : pct <= 0;
    return (
        <span className={better ? 'text-emerald-600' : 'text-red-600'}>
            {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% {t('vs bulan lalu')}
        </span>
    );
}

export default function ReviewPage({ review: r }: { review: Review }) {
    const go = (m: string) => router.get(route('review.index'), { month: m }, { preserveScroll: true });
    const net = r.income - r.expense;
    const nwChange = r.net_worth.end !== null && r.net_worth.start !== null ? r.net_worth.end - r.net_worth.start : null;
    const empty = r.income === 0 && r.expense === 0;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Tinjauan :month', { month: r.label })} />
            <Page>
                <PageTabs group="recap" />
                <PageHeader
                    title={t('Tinjauan :month', { month: r.label })}
                    description={t('Ringkasan bulan, apa yang berubah, dan saran untuk bulan berikutnya.')}
                    actions={
                        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                            <Printer /> {t('Cetak / PDF')}
                        </Button>
                    }
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2 print:hidden">
                    <Button variant="ghost" size="icon" onClick={() => go(shift(r.month, -1))} aria-label={t('Bulan sebelumnya')}>
                        <ChevronLeft />
                    </Button>
                    <span className="text-sm font-semibold">{r.label}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={r.month >= currentMonth()}
                        onClick={() => go(shift(r.month, 1))}
                        aria-label={t('Bulan berikutnya')}
                    >
                        <ChevronRight />
                    </Button>
                </div>

                {empty ? (
                    <EmptyState
                        icon={Sparkles}
                        title={t('Belum ada transaksi di bulan ini')}
                        description={t('Tinjauan muncul setelah ada pemasukan atau pengeluaran.')}
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <StatCard
                                label={t('Pemasukan')}
                                value={compact(r.income)}
                                sub={<Change now={r.income} before={r.previous.income} good="up" />}
                                tone="positive"
                            />
                            <StatCard
                                label={t('Pengeluaran')}
                                value={compact(r.expense)}
                                sub={<Change now={r.expense} before={r.previous.expense} good="down" />}
                                tone="negative"
                            />
                            <StatCard
                                label={t('Rasio Tabungan')}
                                value={r.saving_rate === null ? '-' : `${r.saving_rate}%`}
                                sub={t('sisa :amount', { amount: compact(net) })}
                                tone={
                                    r.saving_rate !== null && r.saving_rate >= 20
                                        ? 'positive'
                                        : r.saving_rate !== null && r.saving_rate < 0
                                          ? 'negative'
                                          : 'default'
                                }
                            />
                            <StatCard
                                label={t('Kekayaan Bersih')}
                                value={r.net_worth.end === null ? '-' : compact(r.net_worth.end)}
                                sub={nwChange === null ? undefined : (nwChange >= 0 ? '+' : '') + compact(nwChange)}
                                tone={nwChange !== null && nwChange < 0 ? 'negative' : 'positive'}
                            />
                        </div>

                        {r.tips.length > 0 && (
                            <Section title={t('Saran')}>
                                <ul className="grid gap-2">
                                    {r.tips.map((tip, i) => (
                                        <li key={i} className="flex gap-2 text-sm">
                                            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
                                            {tip}
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        )}

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Section title={t('Pengeluaran Terbesar per Kategori')}>
                                <ul className="divide-y">
                                    {r.top.map((c) => (
                                        <li key={c.id ?? 0} className="flex items-center gap-3 py-2 text-sm">
                                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                                            <span className="flex-1 truncate">{c.name}</span>
                                            <span className={cn('text-xs tabular-nums', c.diff > 0 ? 'text-red-600' : 'text-emerald-600')}>
                                                {c.diff > 0 ? <TrendingUp className="inline size-3" /> : <TrendingDown className="inline size-3" />}{' '}
                                                {compact(Math.abs(c.diff))}
                                            </span>
                                            <span className="w-24 text-right font-medium tabular-nums">{rupiah(c.total)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Section>

                            <Section title={t('Transaksi Terbesar')}>
                                <ul className="divide-y">
                                    {r.largest.map((tx) => (
                                        <li key={tx.id} className="flex items-center gap-3 py-2 text-sm">
                                            <span
                                                className="size-2.5 shrink-0 rounded-full"
                                                style={{ backgroundColor: tx.category?.color ?? '#94a3b8' }}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate">{tx.note || tx.category?.name || t('Tanpa kategori')}</span>
                                                <span className="text-muted-foreground text-xs">{formatDate(tx.date)}</span>
                                            </span>
                                            <span className="font-medium tabular-nums">{rupiah(tx.amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        </div>

                        {r.over_budget.length > 0 && (
                            <Section title={t('Melebihi Anggaran')}>
                                <ul className="divide-y">
                                    {r.over_budget.map((b) => (
                                        <li key={b.id ?? 0} className="flex items-center gap-3 py-2 text-sm">
                                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                                            <span className="flex-1 truncate">{b.name}</span>
                                            <span className="text-muted-foreground text-xs tabular-nums">
                                                {rupiah(b.spent)} / {rupiah(b.limit)}
                                            </span>
                                            <span className="font-medium text-red-600 tabular-nums">+{rupiah(b.spent - b.limit)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        )}

                        <div className="text-muted-foreground flex flex-wrap gap-4 text-xs print:hidden">
                            <Link href={route('recap.index', { month: r.month })} className="underline">
                                {t('Rekap lengkap :month', { month: r.label })}
                            </Link>
                            <Link href={route('budgets.index', { month: shift(r.month, 1) })} className="underline">
                                {t('Atur anggaran bulan berikutnya')}
                            </Link>
                        </div>
                    </>
                )}
            </Page>
        </AppLayout>
    );
}
