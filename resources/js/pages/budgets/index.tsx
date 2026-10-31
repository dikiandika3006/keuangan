import { currentMonth } from '@/components/finance/fixed-items-editor';
import { MoneyInput } from '@/components/finance/money-input';
import { ColorPicker, DeleteButton, Field, FormDialog, Page, PageHeader, ProgressBar, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { COLORS, compact, percent, rupiah } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Anggaran'), href: '/budgets' }];

interface CategoryRow {
    id: number;
    name: string;
    type: 'income' | 'expense';
    color: string;
    budget: number | null;
    /** Biaya tetap & cicilan bulan ini berkategori ini (dari Biaya Bulanan) */
    fixed: number;
    spent: number;
}

/** Batas yang berlaku: anggaran yang diatur, minimal sebesar biaya tetapnya. */
const limitOf = (c: CategoryRow) => (c.budget === null && c.fixed === 0 ? null : Math.max(c.budget ?? 0, c.fixed));

function shiftMonth(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Budgets({ month, categories, monthLabel }: { month: string; categories: CategoryRow[]; monthLabel: string }) {
    const go = (m: string) => router.get(route('budgets.index'), { month: m }, { preserveScroll: true, preserveState: true });
    const expense = categories.filter((c) => c.type === 'expense');
    const income = categories.filter((c) => c.type === 'income');
    const totalBudget = expense.reduce((s, c) => s + (limitOf(c) ?? 0), 0);
    const totalSpent = expense.reduce((s, c) => s + c.spent, 0);
    const budgetedSpent = expense.filter((c) => limitOf(c) !== null).reduce((s, c) => s + c.spent, 0);

    const [budgetFor, setBudgetFor] = useState<CategoryRow | null>(null);
    const [budgetValue, setBudgetValue] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);

    const [catOpen, setCatOpen] = useState(false);
    const [editingCat, setEditingCat] = useState<CategoryRow | null>(null);
    const catForm = useForm({ name: '', type: 'expense' as 'income' | 'expense', color: COLORS[0] });

    const openCat = (c: CategoryRow | null, type: 'income' | 'expense' = 'expense') => {
        setEditingCat(c);
        catForm.clearErrors();
        catForm.setData(c ? { name: c.name, type: c.type, color: c.color } : { name: '', type, color: COLORS[0] });
        setCatOpen(true);
    };

    const submitCat = () => {
        const options = { preserveScroll: true, onSuccess: () => setCatOpen(false) };
        if (editingCat) catForm.put(route('categories.update', editingCat.id), options);
        else catForm.post(route('categories.store'), options);
    };

    const saveBudget = () => {
        if (!budgetFor) return;
        router.put(
            route('budgets.set', budgetFor.id),
            { amount: budgetValue || null },
            { preserveScroll: true, onStart: () => setSaving(true), onFinish: () => setSaving(false), onSuccess: () => setBudgetFor(null) },
        );
    };

    const actions = (c: CategoryRow) => (
        <div className="flex shrink-0">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => openCat(c)}>
                <Pencil className="size-4" />
            </Button>
            <DeleteButton url={route('categories.destroy', c.id)} label={t('kategori :name', { name: c.name })}>
                <Button variant="ghost" size="icon" className="size-8 text-red-600">
                    <Trash2 className="size-4" />
                </Button>
            </DeleteButton>
        </div>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Anggaran')} />
            <Page>
                <PageHeader
                    title={t('Anggaran & Kategori')}
                    description={t('Batas pengeluaran bulanan per kategori · :month', { month: monthLabel })}
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label={t('Bulan sebelumnya')}>
                        <ChevronLeft />
                    </Button>
                    <button className="text-sm font-semibold" onClick={() => go(currentMonth())} title={t('Kembali ke bulan ini')}>
                        {monthLabel}
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, 1))} aria-label={t('Bulan berikutnya')}>
                        <ChevronRight />
                    </Button>
                </div>
                <p className="text-muted-foreground -mt-2 text-xs">
                    {t('Biaya tetap & cicilan dari Biaya Bulanan otomatis jadi batas minimal kategorinya, jadi tidak perlu dianggarkan dua kali.')}
                </p>

                <div className="grid grid-cols-3 gap-3">
                    <StatCard label={t('Total Anggaran')} value={compact(totalBudget)} sub={rupiah(totalBudget)} />
                    <StatCard
                        label={t('Terpakai')}
                        value={compact(budgetedSpent)}
                        sub={t(':pct% dari anggaran', { pct: Math.round(percent(budgetedSpent, totalBudget)) })}
                    />
                    <StatCard
                        label={t('Sisa')}
                        value={compact(totalBudget - budgetedSpent)}
                        tone={totalBudget - budgetedSpent < 0 ? 'negative' : 'positive'}
                        sub={t('Total keluar :amount', { amount: compact(totalSpent) })}
                    />
                </div>

                <Section
                    title={t('Kategori Pengeluaran')}
                    action={
                        <Button size="sm" variant="outline" onClick={() => openCat(null, 'expense')}>
                            <Plus /> {t('Kategori')}
                        </Button>
                    }
                >
                    <ul className="divide-y">
                        {expense.map((c) => {
                            const limit = limitOf(c);
                            const over = limit !== null && c.spent > limit;
                            const p = limit ? percent(c.spent, limit) : 0;
                            return (
                                <li key={c.id} className="py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{c.name}</div>
                                            <div className={cn('text-muted-foreground text-xs tabular-nums', over && 'font-medium text-red-600')}>
                                                {rupiah(c.spent)}
                                                {limit ? t(' dari :amount', { amount: rupiah(limit) }) : t(' terpakai')}
                                                {over && t(' · melebihi anggaran!')}
                                            </div>
                                            {c.fixed > 0 && (
                                                <div
                                                    className={cn(
                                                        'text-muted-foreground text-xs tabular-nums',
                                                        c.budget !== null && c.budget < c.fixed && 'text-amber-600',
                                                    )}
                                                >
                                                    {c.budget !== null && c.budget < c.fixed
                                                        ? t('Biaya tetap :amount lebih besar dari batas :budget', {
                                                              amount: rupiah(c.fixed),
                                                              budget: rupiah(c.budget),
                                                          })
                                                        : t('termasuk biaya tetap :amount', { amount: rupiah(c.fixed) })}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            size="sm"
                                            variant={c.budget ? 'ghost' : 'outline'}
                                            className="shrink-0"
                                            onClick={() => {
                                                setBudgetFor(c);
                                                setBudgetValue(c.budget ?? '');
                                            }}
                                        >
                                            {c.budget ? t('Ubah') : t('Atur batas')}
                                        </Button>
                                        {actions(c)}
                                    </div>
                                    {limit !== null && (
                                        <ProgressBar className="mt-2" value={p} color={over ? '#ef4444' : p > 80 ? '#f59e0b' : '#10b981'} />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </Section>

                <Section
                    title={t('Kategori Pemasukan')}
                    action={
                        <Button size="sm" variant="outline" onClick={() => openCat(null, 'income')}>
                            <Plus /> {t('Kategori')}
                        </Button>
                    }
                >
                    <ul className="divide-y">
                        {income.map((c) => (
                            <li key={c.id} className="flex items-center gap-3 py-2">
                                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                                <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                                {actions(c)}
                            </li>
                        ))}
                    </ul>
                </Section>
            </Page>

            <FormDialog
                open={budgetFor !== null}
                onOpenChange={(o) => !o && setBudgetFor(null)}
                title={t('Anggaran :name', { name: budgetFor?.name ?? '' })}
                description={t('Batas pengeluaran per bulan. Kosongkan untuk menghapus anggaran.')}
                onSubmit={saveBudget}
                processing={saving}
            >
                <MoneyInput value={budgetValue} onChange={setBudgetValue} autoFocus />
            </FormDialog>

            <FormDialog
                open={catOpen}
                onOpenChange={setCatOpen}
                title={
                    editingCat ? t('Ubah Kategori') : catForm.data.type === 'income' ? t('Kategori Pemasukan Baru') : t('Kategori Pengeluaran Baru')
                }
                onSubmit={submitCat}
                processing={catForm.processing}
            >
                <Field label={t('Nama')} error={catForm.errors.name} htmlFor="cat-name">
                    <Input id="cat-name" value={catForm.data.name} onChange={(e) => catForm.setData('name', e.target.value)} />
                </Field>
                <Field label={t('Warna')}>
                    <ColorPicker value={catForm.data.color} onChange={(c) => catForm.setData('color', c)} colors={COLORS} />
                </Field>
            </FormDialog>
        </AppLayout>
    );
}
