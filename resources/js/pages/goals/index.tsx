import { MoneyInput } from '@/components/finance/money-input';
import { ColorPicker, DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, ProgressBar, StatCard } from '@/components/finance/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { COLORS, compact, formatDate, monthlyNeeded, monthsUntil, percent, PRIORITIES, rupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Goal } from '@/types/finance';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckCircle2, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Target', href: '/goals' }];

type FormData = { name: string; target_amount: number | ''; current_amount: number | ''; target_date: string; priority: number; color: string };

export default function Goals({ goals, monthlySurplus }: { goals: Goal[]; monthlySurplus: number }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Goal | null>(null);
    const form = useForm<FormData>({ name: '', target_amount: '', current_amount: '', target_date: '', priority: 2, color: COLORS[1] });

    const [depositFor, setDepositFor] = useState<Goal | null>(null);
    const [depositMode, setDepositMode] = useState<'in' | 'out'>('in');
    const [depositValue, setDepositValue] = useState<number | ''>('');

    const openForm = (g: Goal | null) => {
        setEditing(g);
        form.clearErrors();
        form.setData(
            g
                ? {
                      name: g.name,
                      target_amount: g.target_amount,
                      current_amount: g.current_amount,
                      target_date: g.target_date ?? '',
                      priority: g.priority,
                      color: g.color,
                  }
                : {
                      name: '',
                      target_amount: '',
                      current_amount: '',
                      target_date: '',
                      priority: 2,
                      color: COLORS[(goals.length + 1) % COLORS.length],
                  },
        );
        setOpen(true);
    };

    const submit = () => {
        form.transform((d) => ({ ...d, current_amount: d.current_amount || 0, target_date: d.target_date || null }));
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(route('goals.update', editing.id), options);
        else form.post(route('goals.store'), options);
    };

    const submitDeposit = () => {
        if (!depositFor || !depositValue) return;
        router.post(
            route('goals.deposit', depositFor.id),
            { amount: depositMode === 'in' ? depositValue : -depositValue },
            { preserveScroll: true, onSuccess: () => setDepositFor(null) },
        );
    };

    const active = goals.filter((g) => g.current_amount < g.target_amount);
    const totalNeeded = active.reduce((s, g) => s + (monthlyNeeded(g) ?? 0), 0);
    const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
    const totalSaved = goals.reduce((s, g) => s + Math.min(g.current_amount, g.target_amount), 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Target Keuangan" />
            <Page>
                <PageHeader
                    title="Target Keuangan"
                    description="Tujuan yang ingin dicapai: dana darurat, DP rumah, menikah, pendidikan, pensiun, dll."
                    actions={
                        <Button onClick={() => openForm(null)}>
                            <Plus /> Tambah Target
                        </Button>
                    }
                />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label="Total Terkumpul"
                        value={compact(totalSaved)}
                        sub={`dari ${compact(totalTarget)} (${Math.round(percent(totalSaved, totalTarget))}%)`}
                    />
                    <StatCard label="Target Aktif" value={active.length} sub={`${goals.length - active.length} tercapai`} />
                    <StatCard label="Perlu Disisihkan" value={compact(totalNeeded)} sub="per bulan untuk semua target" />
                    <StatCard
                        label="Surplus Rata-rata"
                        value={compact(monthlySurplus)}
                        sub={monthlySurplus >= totalNeeded ? 'Cukup untuk semua target ✓' : `Kurang ${compact(totalNeeded - monthlySurplus)}/bln`}
                        tone={monthlySurplus >= totalNeeded ? 'positive' : 'negative'}
                    />
                </div>

                {goals.length === 0 ? (
                    <EmptyState
                        icon={Target}
                        title="Belum ada target"
                        description="Target membantu kamu tahu berapa yang harus ditabung tiap bulan."
                        action={<Button onClick={() => openForm(null)}>Buat Target Pertama</Button>}
                    />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {goals.map((g) => {
                            const p = percent(g.current_amount, g.target_amount);
                            const done = g.current_amount >= g.target_amount;
                            const months = monthsUntil(g.target_date);
                            const need = monthlyNeeded(g);
                            return (
                                <div key={g.id} className="bg-card min-w-0 rounded-xl border p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-semibold">{g.name}</span>
                                                {done ? (
                                                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                                                ) : (
                                                    <Badge variant="outline" className="shrink-0 text-[10px]">
                                                        Prioritas {PRIORITIES[g.priority]}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-muted-foreground text-xs">
                                                {g.target_date
                                                    ? `Target ${formatDate(g.target_date, { month: 'long', year: 'numeric' })} · ${months} bln lagi`
                                                    : 'Tanpa tenggat'}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0">
                                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(g)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            <DeleteButton url={route('goals.destroy', g.id)} label={`target ${g.name}`}>
                                                <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </DeleteButton>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-end justify-between gap-2">
                                        <div className="text-lg font-bold tabular-nums">{rupiah(g.current_amount)}</div>
                                        <div className="text-muted-foreground text-xs tabular-nums">dari {rupiah(g.target_amount)}</div>
                                    </div>
                                    <ProgressBar className="mt-2 h-2.5" value={p} color={g.color} />

                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <div className={cn('text-xs', need !== null && need > monthlySurplus && !done && 'text-amber-600')}>
                                            {done
                                                ? 'Target tercapai 🎉'
                                                : need !== null
                                                  ? `Sisihkan ${rupiah(need)}/bln`
                                                  : `Kurang ${rupiah(g.target_amount - g.current_amount)}`}
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setDepositFor(g);
                                                setDepositMode('in');
                                                setDepositValue('');
                                            }}
                                        >
                                            Update dana
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Page>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title={editing ? 'Ubah Target' : 'Target Baru'}
                onSubmit={submit}
                processing={form.processing}
            >
                <Field label="Nama target" error={form.errors.name} htmlFor="goal-name">
                    <Input
                        id="goal-name"
                        value={form.data.name}
                        onChange={(e) => form.setData('name', e.target.value)}
                        placeholder="Dana darurat, DP rumah..."
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Jumlah target" error={form.errors.target_amount}>
                        <MoneyInput value={form.data.target_amount} onChange={(v) => form.setData('target_amount', v)} />
                    </Field>
                    <Field label="Sudah terkumpul" error={form.errors.current_amount}>
                        <MoneyInput value={form.data.current_amount} onChange={(v) => form.setData('current_amount', v)} />
                    </Field>
                    <Field label="Tanggal target" error={form.errors.target_date} htmlFor="goal-date">
                        <Input
                            id="goal-date"
                            type="date"
                            value={form.data.target_date}
                            onChange={(e) => form.setData('target_date', e.target.value)}
                        />
                    </Field>
                    <Field label="Prioritas" error={form.errors.priority}>
                        <Select value={String(form.data.priority)} onValueChange={(v) => form.setData('priority', Number(v))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(PRIORITIES).map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <Field label="Warna">
                    <ColorPicker value={form.data.color} onChange={(c) => form.setData('color', c)} colors={COLORS} />
                </Field>
            </FormDialog>

            <FormDialog
                open={depositFor !== null}
                onOpenChange={(o) => !o && setDepositFor(null)}
                title={`Update dana: ${depositFor?.name ?? ''}`}
                description={`Terkumpul saat ini ${rupiah(depositFor?.current_amount ?? 0)}`}
                onSubmit={submitDeposit}
            >
                <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                    {(['in', 'out'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            className={cn('rounded-md py-1.5 text-sm font-medium', depositMode === m && 'bg-background shadow-sm')}
                            onClick={() => setDepositMode(m)}
                        >
                            {m === 'in' ? 'Tambah dana' : 'Tarik dana'}
                        </button>
                    ))}
                </div>
                <MoneyInput value={depositValue} onChange={setDepositValue} autoFocus />
            </FormDialog>
        </AppLayout>
    );
}
