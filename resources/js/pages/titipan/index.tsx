import { TransactionForm } from '@/components/finance/transaction-form';
import { TransactionRow } from '@/components/finance/transaction-row';
import { ColorPicker, DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { COLORS, formatDate, rupiah } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { type Transaction } from '@/types/finance';
import { Head, useForm, usePage } from '@inertiajs/react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Titipan'), href: '/titipan' }];

interface Fund {
    id: number;
    name: string;
    color: string;
    in: number;
    out: number;
    balance: number;
    count: number;
    last_date: string | null;
}

type TxDefaults = { type: 'income' | 'expense'; category_id: string };

export default function Titipan({ funds, transactions, type }: { funds: Fund[]; transactions: Transaction[]; type: string }) {
    const { errors } = usePage<SharedData & { errors: Record<string, string> }>().props;
    const held = funds.reduce((s, f) => s + Math.max(0, f.balance), 0);
    const advanced = funds.reduce((s, f) => s + Math.max(0, -f.balance), 0);

    const [expanded, setExpanded] = useState<number | null>(null);
    const [txOpen, setTxOpen] = useState(false);
    const [txDefaults, setTxDefaults] = useState<TxDefaults | undefined>();
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);

    const [fundOpen, setFundOpen] = useState(false);
    const [editingFund, setEditingFund] = useState<Fund | null>(null);
    const fundForm = useForm({ name: '', type, color: COLORS[0] });

    const record = (fund: Fund, kind: 'income' | 'expense') => {
        setEditingTx(null);
        setTxDefaults({ type: kind, category_id: String(fund.id) });
        setTxOpen(true);
    };

    const editTx = (tx: Transaction) => {
        setTxDefaults(undefined);
        setEditingTx(tx);
        setTxOpen(true);
    };

    const openFund = (f: Fund | null) => {
        setEditingFund(f);
        fundForm.clearErrors();
        fundForm.setData({ name: f?.name ?? '', type, color: f?.color ?? COLORS[funds.length % COLORS.length] });
        setFundOpen(true);
    };

    const submitFund = () => {
        const options = { preserveScroll: true, onSuccess: () => setFundOpen(false) };
        if (editingFund) fundForm.put(route('categories.update', editingFund.id), options);
        else fundForm.post(route('categories.store'), options);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Titipan')} />
            <Page>
                <PageHeader
                    title={t('Titipan & Dana Lewat')}
                    description={t(
                        'Uang orang lain atau uang usaha yang lewat rekeningmu. Saldonya tetap di rekening, tapi tidak dihitung sebagai pemasukan/pengeluaran pribadi.',
                    )}
                    actions={
                        <Button onClick={() => openFund(null)}>
                            <Plus /> {t('Titipan Baru')}
                        </Button>
                    }
                />

                <div className="grid grid-cols-2 gap-3">
                    <StatCard label={t('Titipan di Rekeningmu')} value={rupiah(held)} sub={t('Bukan uang siap pakai')} icon={Handshake} />
                    <StatCard
                        label={t('Kamu Talangi')}
                        value={rupiah(advanced)}
                        sub={t('Keluar lebih dulu dari yang diterima')}
                        tone={advanced > 0 ? 'negative' : 'default'}
                    />
                </div>

                {errors.category && (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                        {errors.category}
                    </p>
                )}

                {funds.length === 0 ? (
                    <Section>
                        <EmptyState
                            icon={Handshake}
                            title={t('Belum ada titipan')}
                            description={t(
                                'Buat satu titipan per sumber, mis. “Titipan Ibu” atau “Dana Usaha”. Catat uang masuk saat diterima dan uang keluar saat diteruskan.',
                            )}
                            action={
                                <Button onClick={() => openFund(null)}>
                                    <Plus /> {t('Titipan Baru')}
                                </Button>
                            }
                        />
                    </Section>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {funds.map((f) => {
                            const open = expanded === f.id;
                            const txs = open ? transactions.filter((t) => t.category_id === f.id) : [];
                            return (
                                <section key={f.id} className={cn('bg-card rounded-xl border', open && 'md:col-span-2')}>
                                    <div className="p-4">
                                        <div className="flex items-start gap-3">
                                            <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-semibold">{f.name}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {t(':n transaksi', { n: f.count })}
                                                    {f.last_date && ` · ${t('terakhir :date', { date: formatDate(f.last_date) })}`}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8"
                                                onClick={() => openFund(f)}
                                                aria-label={t('Ubah titipan')}
                                            >
                                                <Pencil className="size-4" />
                                            </Button>
                                            <DeleteButton url={route('categories.destroy', f.id)} label={t('titipan :name', { name: f.name })}>
                                                <Button variant="ghost" size="icon" className="size-8 text-red-600" aria-label={t('Hapus titipan')}>
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </DeleteButton>
                                        </div>

                                        <div className="mt-3 flex items-end justify-between gap-2">
                                            <div>
                                                <div className="text-muted-foreground text-xs">
                                                    {f.balance >= 0 ? t('Sisa titipan') : t('Kamu talangi')}
                                                </div>
                                                <div
                                                    className={cn(
                                                        'text-xl font-semibold tabular-nums',
                                                        f.balance < 0 && 'text-red-600 dark:text-red-400',
                                                        f.balance === 0 && 'text-muted-foreground',
                                                    )}
                                                >
                                                    {rupiah(Math.abs(f.balance))}
                                                </div>
                                            </div>
                                            <div className="text-muted-foreground text-right text-xs tabular-nums">
                                                <div>{t('Masuk :amount', { amount: rupiah(f.in) })}</div>
                                                <div>{t('Keluar :amount', { amount: rupiah(f.out) })}</div>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <Button variant="outline" size="sm" onClick={() => record(f, 'income')}>
                                                <ArrowDownLeft className="text-emerald-600" /> {t('Terima')}
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => record(f, 'expense')}>
                                                <ArrowUpRight className="text-red-600" /> {t('Teruskan / Pakai')}
                                            </Button>
                                        </div>
                                    </div>

                                    {f.count > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(open ? null : f.id)}
                                                className="text-muted-foreground hover:bg-muted/50 flex w-full items-center justify-center gap-1 border-t py-2 text-xs"
                                            >
                                                {open ? t('Tutup riwayat') : t('Lihat riwayat')}
                                                <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
                                            </button>
                                            {open && (
                                                <div className="divide-y border-t px-4">
                                                    {txs.map((t) => (
                                                        <TransactionRow key={t.id} tx={t} onClick={() => editTx(t)} />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                )}

                <Section title={t('Cara pakai')}>
                    <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                        <li>{t('Buat titipan per sumber, mis. “Titipan Ibu”, “Dana Usaha”, “Uang Arisan”.')}</li>
                        <li>
                            {t('Uang masuk ke rekeningmu →')} <b>{t('Terima')}</b>.{' '}
                            {t('Saldo rekening bertambah, tapi tidak dihitung sebagai pemasukan.')}
                        </li>
                        <li>
                            {t('Uang diteruskan atau dibelanjakan untuk yang menitip →')} <b>{t('Teruskan / Pakai')}</b>.
                        </li>
                        <li>{t('Sisa titipan dikurangkan dari Uang Siap Pakai, kekayaan bersih, dan saldo awal proyeksi.')}</li>
                    </ol>
                </Section>
            </Page>

            <TransactionForm open={txOpen} onOpenChange={setTxOpen} transaction={editingTx} defaults={txDefaults} />

            <FormDialog
                open={fundOpen}
                onOpenChange={setFundOpen}
                title={editingFund ? t('Ubah Titipan') : t('Titipan Baru')}
                onSubmit={submitFund}
                processing={fundForm.processing}
            >
                <Field label={t('Nama')} error={fundForm.errors.name} htmlFor="fund-name">
                    <Input
                        id="fund-name"
                        value={fundForm.data.name}
                        onChange={(e) => fundForm.setData('name', e.target.value)}
                        placeholder={t('mis. Titipan Ibu, Dana Usaha')}
                        autoFocus
                    />
                </Field>
                <Field label={t('Warna')}>
                    <ColorPicker value={fundForm.data.color} onChange={(c) => fundForm.setData('color', c)} colors={COLORS} />
                </Field>
            </FormDialog>
        </AppLayout>
    );
}
