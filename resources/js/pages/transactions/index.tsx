import { SwipeActions } from '@/components/finance/swipe-actions';
import { TransactionForm } from '@/components/finance/transaction-form';
import { TransactionRow } from '@/components/finance/transaction-row';
import { DeleteButton, EmptyState, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { compact, daysFromToday, formatDate, rupiah } from '@/lib/format';
import { intlLocale, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Category, type Paginated, type Transaction } from '@/types/finance';
import { Head, Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Transaksi'), href: '/transactions' }];

interface Props {
    transactions: Paginated<Transaction>;
    totals: { income: number; expense: number };
    filters: { month: string; type?: string; account_id?: string; category_id?: string; tag_id?: string; search?: string };
    accounts: { id: number; name: string }[];
    categories: Category[];
    tags: { id: number; name: string; color: string }[];
}

function shiftMonth(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string) {
    if (month === 'all') return t('Semua waktu');
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' });
}

/** Transaksi dikelompokkan per tanggal (urutan dari server sudah terbaru dulu). */
function groupByDate(items: Transaction[]) {
    const groups: { date: string; items: Transaction[]; net: number }[] = [];
    for (const tx of items) {
        let g = groups[groups.length - 1];
        if (!g || g.date !== tx.date) groups.push((g = { date: tx.date, items: [], net: 0 }));
        g.items.push(tx);
        g.net += tx.type === 'income' ? tx.amount : tx.type === 'expense' ? -tx.amount : 0;
    }
    return groups;
}

function dayLabel(date: string) {
    const d = daysFromToday(date);
    if (d === 0) return t('Hari ini');
    if (d === -1) return t('Kemarin');
    return formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Transactions({ transactions, totals, filters, accounts, categories, tags }: Props) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Transaction | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');

    const apply = (next: Partial<Props['filters']>) => {
        const params = { ...filters, ...next };
        Object.keys(params).forEach((k) => {
            const key = k as keyof typeof params;
            if (!params[key] || params[key] === 'any') delete params[key];
        });
        router.get(route('transactions.index'), params, { preserveState: true, preserveScroll: true, replace: true });
    };

    useEffect(() => {
        if (search === (filters.search ?? '')) return;
        const timer = setTimeout(() => apply({ search }), 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const openForm = (tx: Transaction | null) => {
        setEditing(tx);
        setFormOpen(true);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Transaksi')} />
            <Page>
                <PageHeader
                    title={t('Transaksi')}
                    description={t('Catatan pemasukan, pengeluaran, dan transfer antar rekening.')}
                    actions={
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" asChild>
                                <Link href={route('import.index')}>
                                    <Upload /> {t('Impor Mutasi')}
                                </Link>
                            </Button>
                            <Button onClick={() => openForm(null)}>
                                <Plus /> {t('Catat Transaksi')}
                            </Button>
                        </div>
                    }
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={filters.month === 'all'}
                        onClick={() => apply({ month: shiftMonth(filters.month, -1) })}
                        aria-label={t('Bulan sebelumnya')}
                    >
                        <ChevronLeft />
                    </Button>
                    <button
                        className="text-sm font-semibold"
                        onClick={() => apply({ month: filters.month === 'all' ? '' : 'all' })}
                        title={t('Klik untuk beralih ke semua waktu / bulan ini')}
                    >
                        {monthLabel(filters.month)}
                    </button>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={filters.month === 'all'}
                        onClick={() => apply({ month: shiftMonth(filters.month, 1) })}
                        aria-label={t('Bulan berikutnya')}
                    >
                        <ChevronRight />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard label={t('Pemasukan')} value={rupiah(totals.income)} tone="positive" />
                    <StatCard label={t('Pengeluaran')} value={rupiah(totals.expense)} tone="negative" />
                    <StatCard
                        className="col-span-2 sm:col-span-1"
                        label={t('Selisih')}
                        value={rupiah(totals.income - totals.expense)}
                        tone={totals.income - totals.expense < 0 ? 'negative' : 'default'}
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <Input
                        placeholder={t('Cari catatan...')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="col-span-2 md:col-span-1"
                    />
                    <Select value={filters.type ?? 'any'} onValueChange={(v) => apply({ type: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">{t('Semua jenis')}</SelectItem>
                            <SelectItem value="income">{t('Pemasukan')}</SelectItem>
                            <SelectItem value="expense">{t('Pengeluaran')}</SelectItem>
                            <SelectItem value="transfer">{t('Transfer')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filters.account_id ?? 'any'} onValueChange={(v) => apply({ account_id: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">{t('Semua rekening')}</SelectItem>
                            {accounts.map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                    {a.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filters.category_id ?? 'any'} onValueChange={(v) => apply({ category_id: v })}>
                        <SelectTrigger className="col-span-2 md:col-span-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">{t('Semua kategori')}</SelectItem>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name} ({c.type === 'income' ? t('masuk') : c.type === 'titipan' ? t('titipan') : t('keluar')})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filters.tag_id ?? 'any'} onValueChange={(v) => apply({ tag_id: v })}>
                        <SelectTrigger className="col-span-2 md:col-span-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">{t('Semua tag')}</SelectItem>
                            {tags.map((tag) => (
                                <SelectItem key={tag.id} value={String(tag.id)}>
                                    #{tag.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Section>
                    {transactions.data.length === 0 ? (
                        <EmptyState icon={Receipt} title={t('Tidak ada transaksi')} description={t('Coba ubah filter atau catat transaksi baru.')} />
                    ) : (
                        <>
                            <div className="-mx-4 -my-4 overflow-clip rounded-xl">
                                {groupByDate(transactions.data).map(({ date, items, net }) => (
                                    <div key={date}>
                                        {/* Judul tanggal menempel saat digulir, dengan selisih masuk−keluar hari itu */}
                                        <div className="bg-muted/80 text-muted-foreground sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 text-xs font-medium backdrop-blur">
                                            <span>{dayLabel(date)}</span>
                                            {net !== 0 && (
                                                <span
                                                    className={cn(
                                                        'tabular-nums',
                                                        net > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                                                    )}
                                                >
                                                    {net > 0 ? '+' : '−'}
                                                    {compact(Math.abs(net))}
                                                </span>
                                            )}
                                        </div>
                                        <div className="divide-y px-4">
                                            {items.map((tx) => (
                                                <SwipeActions
                                                    key={tx.id}
                                                    actions={
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => openForm(tx)}
                                                                className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-blue-600 text-[11px] text-white"
                                                            >
                                                                <Pencil className="size-4" /> {t('Ubah')}
                                                            </button>
                                                            <DeleteButton url={route('transactions.destroy', tx.id)} label={t('transaksi')}>
                                                                <button
                                                                    type="button"
                                                                    className="flex h-full w-16 flex-col items-center justify-center gap-0.5 bg-red-600 text-[11px] text-white"
                                                                >
                                                                    <Trash2 className="size-4" /> {t('Hapus')}
                                                                </button>
                                                            </DeleteButton>
                                                        </>
                                                    }
                                                >
                                                    <TransactionRow
                                                        tx={tx}
                                                        hideDate
                                                        onClick={() => openForm(tx)}
                                                        actions={
                                                            <div className="hidden shrink-0 md:flex" onClick={(e) => e.stopPropagation()}>
                                                                <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(tx)}>
                                                                    <Pencil className="size-4" />
                                                                </Button>
                                                                <DeleteButton url={route('transactions.destroy', tx.id)} label={t('transaksi')}>
                                                                    <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                                        <Trash2 className="size-4" />
                                                                    </Button>
                                                                </DeleteButton>
                                                            </div>
                                                        }
                                                    />
                                                </SwipeActions>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-muted-foreground mt-6 -mb-1 text-center text-[11px] md:hidden">
                                {t('Geser baris ke kiri untuk ubah/hapus')}
                            </p>
                        </>
                    )}
                </Section>

                {transactions.last_page > 1 && (
                    <div className="flex flex-wrap justify-center gap-1">
                        {transactions.links.map((l, i) => (
                            <Link
                                key={i}
                                href={l.url ?? '#'}
                                preserveScroll
                                className={cn(
                                    'rounded-md border px-3 py-1.5 text-sm',
                                    l.active && 'bg-primary text-primary-foreground',
                                    !l.url && 'pointer-events-none opacity-50',
                                )}
                                dangerouslySetInnerHTML={{ __html: l.label }}
                            />
                        ))}
                    </div>
                )}
            </Page>
            <TransactionForm open={formOpen} onOpenChange={setFormOpen} transaction={editing} />
        </AppLayout>
    );
}
