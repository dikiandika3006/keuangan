import { AccountOptions } from '@/components/finance/account-select';
import { Field, FormDialog } from '@/components/finance/ui';
import HeadingSmall from '@/components/heading-small';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { t } from '@/lib/i18n';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { type Category } from '@/types/finance';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Aturan Otomatis'), href: '/settings/rules' }];

type RuleRow = {
    id: number;
    keyword: string;
    category_id: number;
    account_id: number | null;
    recurring_item_id: number | null;
    category: { id: number; name: string; color: string; type: string } | null;
    account: { id: number; name: string } | null;
    recurring_item: { id: number; name: string } | null;
};

interface Shared extends SharedData {
    finance: { accounts: { id: number; name: string; type: string }[]; categories: Category[] } | null;
}

type FormData = { keyword: string; category_id: string; account_id: string; recurring_item_id: string };

export default function Rules({
    rules,
    recurringItems,
    tags,
}: {
    rules: RuleRow[];
    recurringItems: { id: number; name: string }[];
    tags: { id: number; name: string; color: string; transactions_count: number }[];
}) {
    const { finance } = usePage<Shared>().props;
    const categories = finance?.categories ?? [];
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<RuleRow | null>(null);
    const form = useForm<FormData>({ keyword: '', category_id: '', account_id: '', recurring_item_id: '' });

    const openForm = (r: RuleRow | null) => {
        setEditing(r);
        form.clearErrors();
        form.setData(
            r
                ? {
                      keyword: r.keyword,
                      category_id: String(r.category_id),
                      account_id: r.account_id ? String(r.account_id) : '',
                      recurring_item_id: r.recurring_item_id ? String(r.recurring_item_id) : '',
                  }
                : { keyword: '', category_id: '', account_id: '', recurring_item_id: '' },
        );
        setOpen(true);
    };

    const submit = () => {
        form.transform((d) => ({ ...d, account_id: d.account_id || null, recurring_item_id: d.recurring_item_id || null }));
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(route('rules.update', editing.id), options);
        else form.post(route('rules.store'), options);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Aturan Otomatis')} />
            <SettingsLayout>
                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Aturan Otomatis')}
                        description={t(
                            'Bila catatan transaksi mengandung kata kunci, kategori (dan rekening) terisi sendiri, saat catat cepat maupun impor mutasi. Hubungkan ke Biaya Bulanan supaya mis. "PLN" langsung tercatat sebagai bayar listrik.',
                        )}
                    />
                    <Button onClick={() => openForm(null)}>
                        <Plus /> {t('Tambah Aturan')}
                    </Button>
                    {rules.length === 0 ? (
                        <p className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Wand2 className="size-4" />{' '}
                            {t('Contoh: "grab" → Transportasi, "indomaret" → Belanja Bulanan, "pln" → Tagihan & Utilitas.')}
                        </p>
                    ) : (
                        <ul className="divide-y rounded-lg border">
                            {rules.map((r) => (
                                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{r.keyword}</code>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="min-w-0 flex-1 truncate">
                                        <span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: r.category?.color }} />
                                        {r.category?.name}
                                        {r.account && <span className="text-muted-foreground"> · {r.account.name}</span>}
                                        {r.recurring_item && (
                                            <span className="text-muted-foreground"> · {t('bayar :name', { name: r.recurring_item.name })}</span>
                                        )}
                                    </span>
                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(r)} aria-label={t('Ubah')}>
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 text-red-600"
                                        onClick={() => router.delete(route('rules.destroy', r.id), { preserveScroll: true })}
                                        aria-label={t('Hapus')}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-4">
                    <HeadingSmall title={t('Tag')} description={t('Tag dibuat langsung dari form transaksi. Klik untuk melihat transaksinya.')} />
                    {tags.length === 0 ? (
                        <p className="text-muted-foreground text-sm">{t('Belum ada tag.')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                                <span key={tag.id} className="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-sm">
                                    <Link href={route('transactions.index', { month: 'all', tag_id: tag.id })} style={{ color: tag.color }}>
                                        #{tag.name}
                                    </Link>
                                    <span className="text-muted-foreground text-xs">{tag.transactions_count}</span>
                                    <button
                                        type="button"
                                        className="text-muted-foreground hover:text-red-600"
                                        onClick={() => router.delete(route('tags.destroy', tag.id), { preserveScroll: true })}
                                        aria-label={t('Hapus')}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </SettingsLayout>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title={editing ? t('Ubah Aturan') : t('Aturan Baru')}
                onSubmit={submit}
                processing={form.processing}
            >
                <Field label={t('Kata kunci di catatan')} error={form.errors.keyword} htmlFor="rule-keyword">
                    <Input
                        id="rule-keyword"
                        value={form.data.keyword}
                        onChange={(e) => form.setData('keyword', e.target.value)}
                        placeholder="grab"
                        autoFocus
                    />
                </Field>
                <Field label={t('Kategori')} error={form.errors.category_id}>
                    <Select value={form.data.category_id} onValueChange={(v) => form.setData('category_id', v)}>
                        <SelectTrigger>
                            <SelectValue placeholder={t('Pilih kategori')} />
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name} ({c.type === 'income' ? t('masuk') : c.type === 'titipan' ? t('titipan') : t('keluar')})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field label={t('Rekening (opsional)')} error={form.errors.account_id}>
                    <Select value={form.data.account_id || 'none'} onValueChange={(v) => form.setData('account_id', v === 'none' ? '' : v)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">{t('Tidak diatur')}</SelectItem>
                            <AccountOptions accounts={finance?.accounts ?? []} />
                        </SelectContent>
                    </Select>
                </Field>
                {recurringItems.length > 0 && (
                    <Field label={t('Catat sebagai pembayaran Biaya Bulanan (opsional)')} error={form.errors.recurring_item_id}>
                        <Select
                            value={form.data.recurring_item_id || 'none'}
                            onValueChange={(v) => form.setData('recurring_item_id', v === 'none' ? '' : v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t('Tidak')}</SelectItem>
                                {recurringItems.map((i) => (
                                    <SelectItem key={i.id} value={String(i.id)}>
                                        {i.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
            </FormDialog>
        </AppLayout>
    );
}
