import { FixedItemsEditor } from '@/components/finance/fixed-items-editor';
import { MoneyInput } from '@/components/finance/money-input';
import { MonthPicker } from '@/components/finance/month-picker';
import { DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, Section, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { compact, formatDate, monthLabel, rupiah, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Assumptions, type EmploymentStatus, type ProjectionRow, type ProjectionSummary, type RecurringItem, type Scenario } from '@/types/finance';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Briefcase, CalendarCheck, Car, CheckCircle2, Copy, Hourglass, Pencil, Plus, Trash2, TrendingDown, Wallet } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Proyeksi Skenario', href: '/projection' }];

// Slot kategorikal 1–3 (biru, oranye, aqua), urutan tetap mengikuti urutan skenario
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const tooltipStyle = { backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

interface Props {
    scenarios: Scenario[];
    selectedId: number;
    projection: { rows: ProjectionRow[]; summary: ProjectionSummary };
    comparison: { id: number; name: string; balances: Record<string, number> }[];
    defaults: Assumptions;
    employment: EmploymentStatus[];
    recurringItems: RecurringItem[];
}

type MoneyKey = { [K in keyof Assumptions]: Assumptions[K] extends number ? K : never }[keyof Assumptions];
type MonthKey = { [K in keyof Assumptions]: Assumptions[K] extends string | null ? K : never }[keyof Assumptions];

const GROUPS: {
    title: string;
    fields: (
        | { key: MoneyKey; label: string }
        | { key: MonthKey; label: string; month: true }
        | { key: 'friend_interest_pct'; label: string; pct: true }
    )[];
}[] = [
    {
        title: 'Gaji',
        fields: [
            { key: 'salary', label: 'Gaji saat ini' },
            { key: 'last_salary_month', label: 'Bulan gaji terakhir', month: true },
            { key: 'rehire_month', label: 'Mulai kerja lagi', month: true },
            { key: 'new_salary', label: 'Gaji pekerjaan baru' },
        ],
    },
    {
        title: 'Pemasukan lain',
        fields: [
            { key: 'plastic_income', label: 'Usaha plastik / bln' },
            { key: 'djitu_income', label: 'DJITU / freelance / bln' },
            { key: 'jht_amount', label: 'Saldo JHT' },
            { key: 'jht_month', label: 'Bulan cair JHT', month: true },
        ],
    },
    {
        title: 'Dana di teman',
        fields: [
            { key: 'friend_principal', label: 'Pokok di bulan awal' },
            { key: 'friend_interest_pct', label: 'Bunga % / bln', pct: true },
            { key: 'friend_withdraw_during_car', label: 'Tarik pokok selama cicilan mobil' },
            { key: 'friend_withdraw_after_car', label: 'Tarik pokok setelah mobil lunas' },
        ],
    },
    {
        title: 'Cicilan',
        fields: [
            { key: 'car_installment', label: 'Cicilan mobil' },
            { key: 'car_last_month', label: 'Cicilan mobil terakhir', month: true },
            { key: 'house_installment', label: 'Cicilan rumah' },
            { key: 'house_last_month', label: 'Cicilan rumah terakhir', month: true },
        ],
    },
    {
        title: 'Pengeluaran rutin',
        fields: [
            { key: 'school_fee', label: 'Sekolah / bln' },
            { key: 'school_start_month', label: 'Sekolah mulai', month: true },
            { key: 'groceries', label: 'Belanja bulanan' },
            { key: 'pelagic_deposit', label: 'Setoran Pelagic (saat bergaji)' },
            { key: 'other_expense', label: 'Pengeluaran lain / bln (gabungan)' },
            { key: 'emergency_target', label: 'Target dana darurat' },
        ],
    },
];

const COLUMNS: { key: keyof ProjectionRow; label: string; group: 'in' | 'out' }[] = [
    { key: 'salary', label: 'Gaji', group: 'in' },
    { key: 'plastic', label: 'Plastik', group: 'in' },
    { key: 'interest', label: 'Bunga teman', group: 'in' },
    { key: 'withdraw', label: 'Tarik pokok', group: 'in' },
    { key: 'jht', label: 'JHT', group: 'in' },
    { key: 'djitu', label: 'DJITU', group: 'in' },
    { key: 'recurring_in', label: 'Masuk tetap', group: 'in' },
    { key: 'car', label: 'Mobil', group: 'out' },
    { key: 'house', label: 'Rumah', group: 'out' },
    { key: 'school', label: 'Sekolah', group: 'out' },
    { key: 'groceries', label: 'Belanja', group: 'out' },
    { key: 'pelagic', label: 'Pelagic', group: 'out' },
    { key: 'other', label: 'Lain', group: 'out' },
    { key: 'recurring_out', label: 'Keluar tetap', group: 'out' },
    { key: 'pocket', label: 'Isi dompet', group: 'out' },
];

type ScenarioForm = { name: string; start_month: string; months: number; assumptions: Assumptions };

export default function Projection({ scenarios, selectedId, projection, comparison, defaults, employment, recurringItems }: Props) {
    const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
    const { rows, summary } = projection;
    const [editOpen, setEditOpen] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [jobOpen, setJobOpen] = useState(false);
    const form = useForm<ScenarioForm>({ name: '', start_month: '', months: 26, assumptions: defaults });
    const newForm = useForm({ name: '', copy_from: selected.id });
    const job = useForm<{ status: 'employed' | 'unemployed'; since: string; employer: string; salary: number | '' }>({
        status: 'unemployed',
        since: today(),
        employer: '',
        salary: '',
    });

    const openEdit = () => {
        form.clearErrors();
        form.setData({
            name: selected.name,
            start_month: selected.start_month.slice(0, 7),
            months: selected.months,
            assumptions: { ...defaults, ...selected.assumptions },
        });
        setEditOpen(true);
    };

    const setAssumption = <K extends keyof Assumptions>(key: K, value: Assumptions[K]) =>
        form.setData('assumptions', { ...form.data.assumptions, [key]: value });

    const chartData = rows.map((r) => ({
        label: r.label,
        ...Object.fromEntries(comparison.map((c) => [c.name, c.balances[r.label] ?? null])),
    }));
    const planVsActual = rows.filter((r) => r.is_past || r.is_current);
    const current = employment[0];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Proyeksi Skenario" />
            <Page>
                <PageHeader
                    title="Proyeksi Skenario"
                    description={`${selected.months} bulan mulai ${monthLabel(selected.start_month, 'long')}. Saldo awal = uang siap pakai hari ini; bulan yang sudah lewat memakai angka aktual.`}
                    actions={
                        <>
                            <Button variant="outline" onClick={() => setNewOpen(true)}>
                                <Copy /> Salin skenario
                            </Button>
                            <Button onClick={openEdit}>
                                <Pencil /> Ubah asumsi
                            </Button>
                        </>
                    }
                />

                <div className="flex flex-wrap items-center gap-2">
                    {scenarios.map((s, i) => (
                        <Link
                            key={s.id}
                            href={route('projection.index', { scenario: s.id })}
                            preserveScroll
                            className={cn(
                                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition',
                                s.id === selected.id ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted',
                            )}
                        >
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                            {s.name}
                            {s.is_active && <CheckCircle2 className="size-3.5" />}
                        </Link>
                    ))}
                    <div className="ml-auto flex gap-2">
                        {!selected.is_active && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.post(route('scenarios.activate', selected.id), {}, { preserveScroll: true })}
                            >
                                Jadikan aktif
                            </Button>
                        )}
                        {scenarios.length > 1 && (
                            <DeleteButton url={route('scenarios.destroy', selected.id)} label={`skenario ${selected.name}`}>
                                <Button size="sm" variant="ghost" className="text-red-600">
                                    <Trash2 /> Hapus
                                </Button>
                            </DeleteButton>
                        )}
                    </div>
                </div>
                {selected.is_active && <p className="text-muted-foreground -mt-2 text-xs">Skenario aktif: angka ini yang dipakai di dashboard.</p>}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label="Saldo Terendah"
                        value={compact(summary.min_balance)}
                        sub={summary.min_balance < 0 ? `${summary.min_month} · butuh tambahan ${compact(-summary.min_balance)}` : summary.min_month}
                        icon={TrendingDown}
                        tone={summary.min_balance < 0 ? 'negative' : 'default'}
                    />
                    <StatCard
                        label="Runway Tanpa Gaji"
                        value={summary.runway_months === null ? '∞' : `${summary.runway_months.toLocaleString('id-ID')} bln`}
                        sub={summary.monthly_burn > 0 ? `defisit ${compact(summary.monthly_burn)}/bln tanpa gaji` : 'surplus walau tanpa gaji'}
                        icon={Hourglass}
                        tone={summary.runway_months !== null && summary.runway_months < 3 ? 'negative' : 'default'}
                    />
                    <StatCard
                        label="Selisih / Bulan"
                        value={summary.net_without_salary === null ? '-' : compact(summary.net_without_salary)}
                        sub={`tanpa gaji · dengan gaji ${summary.net_with_salary === null ? '-' : compact(summary.net_with_salary)}`}
                        icon={Wallet}
                        tone={(summary.net_without_salary ?? 0) < 0 ? 'negative' : 'positive'}
                    />
                    <StatCard
                        label="Mobil Lunas"
                        value={summary.car_paid_off ?? '-'}
                        sub={`sisa pokok di teman ${compact(summary.principal_after_car)}`}
                        icon={Car}
                    />
                </div>

                <FixedItemsEditor items={recurringItems} />

                <Section title="Saldo Kas per Skenario">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ left: -6, right: 8, top: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval="preserveStartEnd"
                                    minTickGap={24}
                                />
                                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                                <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                                {comparison.map((c, i) => (
                                    <Line
                                        key={c.id}
                                        dataKey={c.name}
                                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                                        strokeWidth={c.id === selected.id ? 2.5 : 1.5}
                                        strokeOpacity={c.id === selected.id ? 1 : 0.7}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                        type="monotone"
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">Garis putus-putus = saldo nol. Di bawahnya berarti butuh dana tambahan.</p>
                </Section>

                <Section title={`Rincian ${selected.name}`}>
                    <div className="-mx-4 overflow-x-auto">
                        <table className="w-full min-w-[1250px] text-xs tabular-nums">
                            <thead className="text-muted-foreground">
                                <tr className="border-b">
                                    <th className="bg-card sticky left-0 px-4 py-2 text-left font-medium">Bulan</th>
                                    {COLUMNS.map((c) => (
                                        <th key={c.key} className="px-2 py-2 text-right font-medium">
                                            {c.label}
                                        </th>
                                    ))}
                                    <th className="px-2 py-2 text-right font-medium">Masuk</th>
                                    <th className="px-2 py-2 text-right font-medium">Keluar</th>
                                    <th className="px-2 py-2 text-right font-medium">Selisih</th>
                                    <th className="px-4 py-2 text-right font-medium">Saldo kas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {rows.map((r) => (
                                    <tr key={r.month} className={cn(r.is_past && 'text-muted-foreground', r.is_current && 'bg-muted/40')}>
                                        <td className="bg-card sticky left-0 px-4 py-1.5 font-medium whitespace-nowrap">
                                            {r.label}
                                            {r.is_current && <span className="text-muted-foreground ml-1 font-normal">(berjalan)</span>}
                                        </td>
                                        {COLUMNS.map((c) => (
                                            <td key={c.key} className={cn('px-2 py-1.5 text-right', r[c.key] === 0 && 'text-muted-foreground/40')}>
                                                {r[c.key] === 0 ? '–' : compact(Number(r[c.key]))}
                                            </td>
                                        ))}
                                        <td className="px-2 py-1.5 text-right text-emerald-600 dark:text-emerald-400">{compact(r.income)}</td>
                                        <td className="px-2 py-1.5 text-right text-red-600 dark:text-red-400">{compact(r.expense)}</td>
                                        <td className={cn('px-2 py-1.5 text-right font-medium', r.net < 0 && 'text-red-600 dark:text-red-400')}>
                                            {compact(r.net)}
                                        </td>
                                        <td className={cn('px-4 py-1.5 text-right font-semibold', r.balance < 0 && 'text-red-600 dark:text-red-400')}>
                                            {compact(r.balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Section title="Rencana vs Aktual" className="lg:col-span-2">
                        {planVsActual.length === 0 ? (
                            <EmptyState
                                icon={CalendarCheck}
                                title="Belum ada bulan berjalan"
                                description={`Perbandingan muncul mulai ${monthLabel(selected.start_month, 'long')}.`}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-sm tabular-nums">
                                    <thead className="text-muted-foreground text-xs">
                                        <tr>
                                            <th className="py-1 text-left font-medium">Bulan</th>
                                            <th className="py-1 text-right font-medium">Masuk rencana</th>
                                            <th className="py-1 text-right font-medium">Masuk aktual</th>
                                            <th className="py-1 text-right font-medium">Keluar rencana</th>
                                            <th className="py-1 text-right font-medium">Keluar aktual</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {planVsActual.map((r) => {
                                            const inGap = (r.actual_income ?? 0) - r.income;
                                            const outGap = (r.actual_expense ?? 0) - r.expense;
                                            return (
                                                <tr key={r.month}>
                                                    <td className="py-1.5">{r.label}</td>
                                                    <td className="text-right">{compact(r.income)}</td>
                                                    <td className={cn('text-right', inGap < 0 && 'text-red-600')}>{compact(r.actual_income ?? 0)}</td>
                                                    <td className="text-right">{compact(r.expense)}</td>
                                                    <td className={cn('text-right', outGap > 0 && 'text-red-600')}>
                                                        {compact(r.actual_expense ?? 0)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <p className="text-muted-foreground mt-2 text-xs">
                                    Merah = pemasukan di bawah rencana atau pengeluaran di atas rencana.
                                </p>
                            </div>
                        )}
                    </Section>

                    <Section
                        title="Status Kerja"
                        action={
                            <Button size="sm" variant="outline" onClick={() => setJobOpen(true)}>
                                <Plus /> Ubah
                            </Button>
                        }
                    >
                        {!current ? (
                            <EmptyState
                                icon={Briefcase}
                                title="Belum diisi"
                                description="Dipakai untuk status JHT dan pengingat. Isi saat kontrak berakhir."
                            />
                        ) : (
                            <ul className="divide-y text-sm">
                                {employment.map((e) => (
                                    <li key={e.id} className="flex items-center gap-2 py-2">
                                        <span className={cn('size-2 rounded-full', e.status === 'employed' ? 'bg-emerald-500' : 'bg-amber-500')} />
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium">
                                                {e.status === 'employed' ? 'Bekerja' : 'Tidak bekerja'}
                                                {e.employer ? ` · ${e.employer}` : ''}
                                            </div>
                                            <div className="text-muted-foreground text-xs">
                                                sejak {formatDate(e.since)}
                                                {e.salary ? ` · gaji ${compact(e.salary)}` : ''}
                                            </div>
                                        </div>
                                        <DeleteButton url={route('employment.destroy', e.id)} label="status kerja">
                                            <Button variant="ghost" size="icon" className="size-7 text-red-600">
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </DeleteButton>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                </div>
            </Page>

            <FormDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                title={`Asumsi ${selected.name}`}
                description="Angka per bulan. Kosongkan bulan untuk menonaktifkan (misal belum ada rencana kerja lagi)."
                onSubmit={() => form.put(route('scenarios.update', selected.id), { preserveScroll: true, onSuccess: () => setEditOpen(false) })}
                processing={form.processing}
            >
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Nama skenario" error={form.errors.name} htmlFor="sc-name">
                        <Input id="sc-name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} />
                    </Field>
                    <Field label="Bulan awal" error={form.errors.start_month} htmlFor="sc-start">
                        <MonthPicker id="sc-start" value={form.data.start_month} onChange={(v) => form.setData('start_month', v)} clearable={false} />
                    </Field>
                    <Field label="Jumlah bulan" error={form.errors.months} htmlFor="sc-months">
                        <Input
                            id="sc-months"
                            type="number"
                            min={6}
                            max={60}
                            value={form.data.months}
                            onChange={(e) => form.setData('months', Number(e.target.value))}
                        />
                    </Field>
                </div>
                {GROUPS.map((g) => (
                    <fieldset key={g.title} className="grid gap-3 border-t pt-3">
                        <legend className="text-muted-foreground pr-2 text-xs font-semibold tracking-wide uppercase">{g.title}</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {g.fields.map((f) => {
                                const error = (form.errors as Record<string, string>)[`assumptions.${f.key}`];
                                if ('month' in f) {
                                    return (
                                        <Field key={f.key} label={f.label} error={error} htmlFor={`a-${f.key}`}>
                                            <MonthPicker
                                                id={`a-${f.key}`}
                                                value={form.data.assumptions[f.key] ?? ''}
                                                onChange={(v) => setAssumption(f.key, v || null)}
                                                placeholder="Tidak ada"
                                            />
                                        </Field>
                                    );
                                }
                                if ('pct' in f) {
                                    return (
                                        <Field key={f.key} label={f.label} error={error} htmlFor={`a-${f.key}`}>
                                            <Input
                                                id={`a-${f.key}`}
                                                inputMode="decimal"
                                                value={String(form.data.assumptions[f.key] ?? 0).replace('.', ',')}
                                                onChange={(e) => {
                                                    const v = parseFloat(e.target.value.replace(',', '.'));
                                                    setAssumption(f.key, Number.isFinite(v) ? v : 0);
                                                }}
                                            />
                                        </Field>
                                    );
                                }
                                return (
                                    <Field key={f.key} label={f.label} error={error}>
                                        <MoneyInput
                                            value={form.data.assumptions[f.key] ?? ''}
                                            onChange={(v) => setAssumption(f.key, v === '' ? 0 : v)}
                                        />
                                    </Field>
                                );
                            })}
                        </div>
                    </fieldset>
                ))}
            </FormDialog>

            <FormDialog
                open={newOpen}
                onOpenChange={setNewOpen}
                title="Salin skenario"
                description={`Membuat skenario baru dari asumsi ${selected.name}, lalu ubah angkanya.`}
                onSubmit={() => newForm.post(route('scenarios.store'), { onSuccess: () => setNewOpen(false) })}
                processing={newForm.processing}
            >
                <Field label="Nama" error={newForm.errors.name} htmlFor="new-sc">
                    <Input
                        id="new-sc"
                        value={newForm.data.name}
                        onChange={(e) => newForm.setData('name', e.target.value)}
                        placeholder="Dapat kerja Januari"
                        autoFocus
                    />
                </Field>
            </FormDialog>

            <FormDialog
                open={jobOpen}
                onOpenChange={setJobOpen}
                title="Status kerja"
                onSubmit={() => job.post(route('employment.store'), { preserveScroll: true, onSuccess: () => setJobOpen(false) })}
                processing={job.processing}
            >
                <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                    {(['unemployed', 'employed'] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            data-active={job.data.status === s}
                            className="data-[active=true]:bg-background rounded-md px-2 py-1.5 text-sm font-medium transition data-[active=true]:shadow-sm"
                            onClick={() => job.setData('status', s)}
                        >
                            {s === 'employed' ? 'Bekerja' : 'Tidak bekerja'}
                        </button>
                    ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Sejak" error={job.errors.since} htmlFor="job-since">
                        <Input id="job-since" type="date" value={job.data.since} onChange={(e) => job.setData('since', e.target.value)} />
                    </Field>
                    {job.data.status === 'employed' && (
                        <>
                            <Field label="Perusahaan" error={job.errors.employer} htmlFor="job-emp">
                                <Input id="job-emp" value={job.data.employer} onChange={(e) => job.setData('employer', e.target.value)} />
                            </Field>
                            <Field label="Gaji" error={job.errors.salary}>
                                <MoneyInput value={job.data.salary} onChange={(v) => job.setData('salary', v)} />
                            </Field>
                        </>
                    )}
                </div>
            </FormDialog>
        </AppLayout>
    );
}
