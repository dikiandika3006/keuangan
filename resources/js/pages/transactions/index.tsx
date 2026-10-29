import { TransactionForm } from '@/components/finance/transaction-form';
import { TransactionRow } from '@/components/finance/transaction-row';
import { DeleteButton, EmptyState, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { rupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Category, type Paginated, type Transaction } from '@/types/finance';
import { Head, Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Transaksi', href: '/transactions' }];

interface Props {
    transactions: Paginated<Transaction>;
    totals: { income: number; expense: number };
    filters: { month: string; type?: string; account_id?: string; category_id?: string; search?: string };
    accounts: { id: number; name: string }[];
    categories: Category[];
}

function shiftMonth(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string) {
    if (month === 'all') return 'Semua waktu';
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

export default function Transactions({ transactions, totals, filters, accounts, categories }: Props) {
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
        const t = setTimeout(() => apply({ search }), 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const openForm = (tx: Transaction | null) => {
        setEditing(tx);
        setFormOpen(true);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Transaksi" />
            <Page>
                <PageHeader
                    title="Transaksi"
                    description="Catatan pemasukan, pengeluaran, dan transfer antar rekening."
                    actions={
                        <Button onClick={() => openForm(null)}>
                            <Plus /> Catat Transaksi
                        </Button>
                    }
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={filters.month === 'all'}
                        onClick={() => apply({ month: shiftMonth(filters.month, -1) })}
                    >
                        <ChevronLeft />
                    </Button>
                    <button
                        className="text-sm font-semibold"
                        onClick={() => apply({ month: filters.month === 'all' ? '' : 'all' })}
                        title="Klik untuk beralih ke semua waktu / bulan ini"
                    >
                        {monthLabel(filters.month)}
                    </button>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={filters.month === 'all'}
                        onClick={() => apply({ month: shiftMonth(filters.month, 1) })}
                    >
                        <ChevronRight />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard label="Pemasukan" value={rupiah(totals.income)} tone="positive" />
                    <StatCard label="Pengeluaran" value={rupiah(totals.expense)} tone="negative" />
                    <StatCard
                        className="col-span-2 sm:col-span-1"
                        label="Selisih"
                        value={rupiah(totals.income - totals.expense)}
                        tone={totals.income - totals.expense < 0 ? 'negative' : 'default'}
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Input
                        placeholder="Cari catatan..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="col-span-2 md:col-span-1"
                    />
                    <Select value={filters.type ?? 'any'} onValueChange={(v) => apply({ type: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">Semua jenis</SelectItem>
                            <SelectItem value="income">Pemasukan</SelectItem>
                            <SelectItem value="expense">Pengeluaran</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filters.account_id ?? 'any'} onValueChange={(v) => apply({ account_id: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">Semua rekening</SelectItem>
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
                            <SelectItem value="any">Semua kategori</SelectItem>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name} ({c.type === 'income' ? 'masuk' : 'keluar'})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Section>
                    {transactions.data.length === 0 ? (
                        <EmptyState icon={Receipt} title="Tidak ada transaksi" description="Coba ubah filter atau catat transaksi baru." />
                    ) : (
                        <div className="divide-y">
                            {transactions.data.map((tx) => (
                                <TransactionRow
                                    key={tx.id}
                                    tx={tx}
                                    actions={
                                        <div className="flex shrink-0">
                                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(tx)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            <DeleteButton url={route('transactions.destroy', tx.id)} label="transaksi">
                                                <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </DeleteButton>
                                        </div>
                                    }
                                />
                            ))}
                        </div>
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
