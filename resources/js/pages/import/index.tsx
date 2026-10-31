import { AccountSelect, useDefaultAccountId } from '@/components/finance/account-select';
import { Field, Page, PageHeader, Section } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { formatDate, rupiah } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { type Category } from '@/types/finance';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: t('Transaksi'), href: '/transactions' },
    { title: t('Impor Mutasi'), href: '/import' },
];

type Row = { date: string; note: string; amount: number; type: 'income' | 'expense'; hash: string; duplicate: boolean; category_id: number | null };
type Preview = { account_id: number; rows: Row[]; skipped: number } | null;

interface Shared extends SharedData {
    finance: { accounts: { id: number; name: string; type: string }[]; categories: Category[] } | null;
}

export default function Import({ preview }: { preview: Preview }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Impor Mutasi')} />
            <Page>
                <PageHeader
                    title={t('Impor Mutasi Bank')}
                    description={t(
                        'Unggah file CSV mutasi dari internet/mobile banking. Kategori ditebak otomatis, transaksi yang sudah ada ditandai duplikat.',
                    )}
                />
                {preview ? <Review preview={preview} /> : <UploadForm />}
            </Page>
        </AppLayout>
    );
}

function UploadForm() {
    const defaultAccount = useDefaultAccountId();
    const form = useForm<{ account_id: string; file: File | null }>({ account_id: defaultAccount, file: null });

    return (
        <Section title={t('1. Pilih file')}>
            <form
                className="grid max-w-lg gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post(route('import.preview'), { forceFormData: true });
                }}
            >
                <Field label={t('Rekening')} error={form.errors.account_id}>
                    <AccountSelect value={form.data.account_id} onChange={(v) => form.setData('account_id', v)} />
                </Field>
                <Field label={t('File mutasi (.csv)')} error={form.errors.file} htmlFor="import-file">
                    <input
                        id="import-file"
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)}
                        className="file:bg-muted text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5"
                    />
                </Field>
                <div className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-xs leading-relaxed">
                    <div className="mb-1 flex items-center gap-1 font-medium">
                        <FileSpreadsheet className="size-3.5" /> {t('Cara mendapatkan file')}
                    </div>
                    {t(
                        'Di KlikBCA / Livin / BRImo / BNI Mobile, buka Mutasi Rekening → pilih periode → unduh/ekspor CSV. File Excel bisa disimpan ulang sebagai CSV. Kolom yang dibutuhkan: Tanggal, Keterangan, dan Debet/Kredit atau Jumlah.',
                    )}
                </div>
                <Button type="submit" disabled={!form.data.file || form.processing} className="w-fit">
                    <Upload /> {t('Baca file')}
                </Button>
            </form>
        </Section>
    );
}

function Review({ preview }: { preview: NonNullable<Preview> }) {
    const { finance } = usePage<Shared>().props;
    const categories = finance?.categories ?? [];
    const account = finance?.accounts.find((a) => a.id === preview.account_id);
    const [rows, setRows] = useState(() =>
        preview.rows.map((r) => ({ include: !r.duplicate, category_id: r.category_id ? String(r.category_id) : '' })),
    );
    const [processing, setProcessing] = useState(false);

    const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const chosen = rows.filter((r) => r.include).length;
    const duplicates = preview.rows.filter((r) => r.duplicate).length;
    const uncategorized = rows.filter((r) => r.include && !r.category_id).length;

    return (
        <Section
            title={t('2. Periksa :n baris · :account', { n: preview.rows.length, account: account?.name ?? '' })}
            action={
                <Button variant="ghost" size="sm" onClick={() => router.delete(route('import.cancel'))}>
                    {t('Ganti file')}
                </Button>
            }
        >
            <div className="text-muted-foreground mb-3 text-xs">
                {t(':dup kemungkinan duplikat tidak dicentang.', { dup: duplicates })}
                {preview.skipped > 0 && ' ' + t(':n baris dilewati (bukan transaksi).', { n: preview.skipped })}
            </div>
            <div className="divide-y">
                {preview.rows.map((r, i) => (
                    <div
                        key={r.hash}
                        className={cn('grid gap-2 py-2 sm:grid-cols-[auto_1fr_12rem] sm:items-center', !rows[i].include && 'opacity-50')}
                    >
                        <label className="flex items-start gap-2 sm:col-span-2">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={rows[i].include}
                                onChange={(e) => set(i, { include: e.target.checked })}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm">{r.note || '-'}</span>
                                    <span
                                        className={cn(
                                            'shrink-0 text-sm font-semibold tabular-nums',
                                            r.type === 'income' ? 'text-emerald-600' : 'text-red-600',
                                        )}
                                    >
                                        {r.type === 'income' ? '+' : '−'}
                                        {rupiah(r.amount)}
                                    </span>
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {formatDate(r.date)}
                                    {r.duplicate && <span className="ml-2 text-amber-600">{t('mungkin duplikat')}</span>}
                                </span>
                            </span>
                        </label>
                        <Select value={rows[i].category_id || 'none'} onValueChange={(v) => set(i, { category_id: v === 'none' ? '' : v })}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t('Tanpa kategori')}</SelectItem>
                                {categories
                                    .filter((c) => c.type === r.type || c.type === 'titipan')
                                    .map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
            </div>
            <div className="bg-background sticky bottom-20 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 md:bottom-4">
                <span className="text-sm">
                    {t(':n transaksi akan disimpan', { n: chosen })}
                    {uncategorized > 0 && <span className="text-muted-foreground"> · {t(':n tanpa kategori', { n: uncategorized })}</span>}
                </span>
                <Button
                    disabled={chosen === 0 || processing}
                    onClick={() =>
                        router.post(
                            route('import.store'),
                            { rows: rows.map((r) => ({ include: r.include, category_id: r.category_id || null })) },
                            { onStart: () => setProcessing(true), onFinish: () => setProcessing(false) },
                        )
                    }
                >
                    {t('Simpan :n transaksi', { n: chosen })}
                </Button>
            </div>
        </Section>
    );
}
