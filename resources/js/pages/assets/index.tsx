import { AccountSelect, useDefaultAccountId } from '@/components/finance/account-select';
import { MoneyInput } from '@/components/finance/money-input';
import { ColorPicker, DeleteButton, EmptyState, Field, FormDialog, Page, PageHeader, ProgressBar, StatCard } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { ASSET_KINDS, COLORS, compact, daysFromToday, formatDate, percent, rupiah, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { type Asset, type AssetKind } from '@/types/finance';
import { Head, useForm } from '@inertiajs/react';
import { ArrowDownToLine, ArrowUpFromLine, Gem, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Aset & Investasi', href: '/assets' }];

type FormData = { name: string; kind: AssetKind; target_value: number | ''; color: string; note: string; value: number | '' };
type MoveData = { direction: 'deposit' | 'withdraw'; account_id: string; amount: number | ''; date: string };

export default function Assets({ assets, jhtClaimableFrom }: { assets: Asset[]; jhtClaimableFrom: string | null }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Asset | null>(null);
    const form = useForm<FormData>({ name: '', kind: 'investment', target_value: '', color: COLORS[4], note: '', value: '' });
    const [valuateFor, setValuateFor] = useState<Asset | null>(null);
    const valuate = useForm<{ value: number | ''; date: string; note: string }>({ value: '', date: today(), note: '' });
    const [moveFor, setMoveFor] = useState<Asset | null>(null);
    const defaultAccount = useDefaultAccountId();
    const move = useForm<MoveData>({ direction: 'deposit', account_id: '', amount: '', date: today() });

    const openForm = (a: Asset | null) => {
        setEditing(a);
        form.clearErrors();
        form.setData(
            a
                ? { name: a.name, kind: a.kind, target_value: a.target_value ?? '', color: a.color, note: a.note ?? '', value: a.value }
                : { name: '', kind: 'investment', target_value: '', color: COLORS[(assets.length + 4) % COLORS.length], note: '', value: '' },
        );
        setOpen(true);
    };

    const submit = () => {
        form.transform((d) => ({ ...d, target_value: d.target_value === '' ? null : d.target_value, value: d.value || 0 }));
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(route('assets.update', editing.id), options);
        else form.post(route('assets.store'), options);
    };

    const openMove = (a: Asset, direction: MoveData['direction']) => {
        move.clearErrors();
        move.setData({ direction, account_id: defaultAccount, amount: '', date: today() });
        setMoveFor(a);
    };

    const total = assets.reduce((s, a) => s + a.value, 0);
    const jhtReady = jhtClaimableFrom !== null && daysFromToday(jhtClaimableFrom) <= 0;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Aset & Investasi" />
            <Page>
                <PageHeader
                    title="Aset & Investasi"
                    description="Aset yang tidak langsung bisa dipakai: Pelagic, JHT, modal usaha. Nilainya masuk ke kekayaan bersih, bukan uang siap pakai."
                    actions={
                        <Button onClick={() => openForm(null)}>
                            <Plus /> Tambah Aset
                        </Button>
                    }
                />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard label="Total Aset" value={compact(total)} sub={rupiah(total)} icon={Gem} />
                    {assets.slice(0, 3).map((a) => (
                        <StatCard key={a.id} label={a.name} value={compact(a.value)} sub={ASSET_KINDS[a.kind]} />
                    ))}
                </div>

                {assets.length === 0 ? (
                    <EmptyState icon={Gem} title="Belum ada aset" action={<Button onClick={() => openForm(null)}>Tambah Aset</Button>} />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {assets.map((a) => (
                            <div key={a.id} className="bg-card relative overflow-hidden rounded-xl border p-4">
                                <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: a.color }} />
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="truncate font-semibold">{a.name}</div>
                                        <div className="text-muted-foreground text-xs">
                                            {ASSET_KINDS[a.kind]}
                                            {a.valuations[0] && ` · nilai per ${formatDate(a.valuations[0].date)}`}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0">
                                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openForm(a)}>
                                            <Pencil className="size-4" />
                                        </Button>
                                        <DeleteButton url={route('assets.destroy', a.id)} label={`aset ${a.name}`}>
                                            <Button variant="ghost" size="icon" className="size-8 text-red-600">
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </DeleteButton>
                                    </div>
                                </div>
                                <div className="mt-3 text-xl font-bold tabular-nums">{rupiah(a.value)}</div>
                                {a.target_value ? (
                                    <>
                                        <ProgressBar className="mt-2" value={percent(a.value, a.target_value)} color={a.color} />
                                        <div className="text-muted-foreground mt-1 text-xs">
                                            {percent(a.value, a.target_value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari target{' '}
                                            {compact(a.target_value)}
                                        </div>
                                    </>
                                ) : null}
                                {a.kind === 'jht' && (
                                    <p
                                        className={cn(
                                            'mt-2 rounded-lg p-2 text-xs',
                                            jhtReady ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {jhtClaimableFrom === null
                                            ? 'Bisa dicairkan penuh minimal 1 bulan setelah berhenti kerja dan belum bekerja lagi. Atur status kerja di halaman Proyeksi.'
                                            : jhtReady
                                              ? 'Sudah bisa dicairkan lewat aplikasi JMO. Simpan sebagai dana darurat terpisah.'
                                              : `Bisa dicairkan mulai ${formatDate(jhtClaimableFrom)}. Siapkan paklaring & cek data di JMO.`}
                                    </p>
                                )}
                                {a.note && <p className="text-muted-foreground mt-2 text-xs">{a.note}</p>}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            valuate.setData({ value: a.value, date: today(), note: '' });
                                            setValuateFor(a);
                                        }}
                                    >
                                        <RefreshCw /> Update nilai
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openMove(a, 'deposit')}>
                                        <ArrowUpFromLine /> Setor
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openMove(a, 'withdraw')}>
                                        <ArrowDownToLine /> Cairkan
                                    </Button>
                                </div>
                                {a.valuations.length > 1 && (
                                    <ul className="text-muted-foreground mt-3 space-y-0.5 border-t pt-2 text-xs">
                                        {a.valuations.slice(0, 4).map((v) => (
                                            <li key={v.id} className="flex justify-between gap-2">
                                                <span>
                                                    {formatDate(v.date)}
                                                    {v.note ? ` · ${v.note}` : ''}
                                                </span>
                                                <span className="tabular-nums">{rupiah(v.value)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Page>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title={editing ? 'Ubah Aset' : 'Tambah Aset'}
                onSubmit={submit}
                processing={form.processing}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nama" error={form.errors.name} htmlFor="asset-name">
                        <Input
                            id="asset-name"
                            value={form.data.name}
                            onChange={(e) => form.setData('name', e.target.value)}
                            placeholder="Pelagic Capital"
                        />
                    </Field>
                    <Field label="Jenis" error={form.errors.kind}>
                        <Select value={form.data.kind} onValueChange={(v) => form.setData('kind', v as AssetKind)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(ASSET_KINDS).map(([v, l]) => (
                                    <SelectItem key={v} value={v}>
                                        {l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {!editing && (
                        <Field label="Nilai saat ini" error={form.errors.value}>
                            <MoneyInput value={form.data.value} onChange={(v) => form.setData('value', v)} />
                        </Field>
                    )}
                    <Field label="Target (opsional)" error={form.errors.target_value}>
                        <MoneyInput value={form.data.target_value} onChange={(v) => form.setData('target_value', v)} />
                    </Field>
                </div>
                <Field label="Catatan" error={form.errors.note} htmlFor="asset-note">
                    <Input id="asset-note" value={form.data.note} onChange={(e) => form.setData('note', e.target.value)} placeholder="Opsional" />
                </Field>
                <Field label="Warna">
                    <ColorPicker value={form.data.color} onChange={(c) => form.setData('color', c)} colors={COLORS} />
                </Field>
            </FormDialog>

            <FormDialog
                open={valuateFor !== null}
                onOpenChange={(o) => !o && setValuateFor(null)}
                title={`Update nilai ${valuateFor?.name ?? ''}`}
                description="Catat nilai terbaru, misalnya dari laporan AUM atau saldo JHT di JMO."
                processing={valuate.processing}
                onSubmit={() =>
                    valuateFor && valuate.post(route('assets.valuate', valuateFor.id), { preserveScroll: true, onSuccess: () => setValuateFor(null) })
                }
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nilai" error={valuate.errors.value}>
                        <MoneyInput value={valuate.data.value} onChange={(v) => valuate.setData('value', v)} autoFocus />
                    </Field>
                    <Field label="Per tanggal" error={valuate.errors.date} htmlFor="val-date">
                        <Input id="val-date" type="date" value={valuate.data.date} onChange={(e) => valuate.setData('date', e.target.value)} />
                    </Field>
                </div>
                <Field label="Catatan" htmlFor="val-note">
                    <Input id="val-note" value={valuate.data.note} onChange={(e) => valuate.setData('note', e.target.value)} placeholder="Opsional" />
                </Field>
            </FormDialog>

            <FormDialog
                open={moveFor !== null}
                onOpenChange={(o) => !o && setMoveFor(null)}
                title={`${move.data.direction === 'deposit' ? 'Setor ke' : 'Cairkan'} ${moveFor?.name ?? ''}`}
                description={
                    move.data.direction === 'deposit'
                        ? 'Dicatat sebagai pengeluaran dari rekening, nilai aset bertambah.'
                        : 'Dicatat sebagai pemasukan ke rekening, nilai aset berkurang.'
                }
                processing={move.processing}
                onSubmit={() => moveFor && move.post(route('assets.move', moveFor.id), { preserveScroll: true, onSuccess: () => setMoveFor(null) })}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nominal" error={move.errors.amount}>
                        <MoneyInput value={move.data.amount} onChange={(v) => move.setData('amount', v)} autoFocus />
                    </Field>
                    <Field label="Tanggal" error={move.errors.date} htmlFor="move-date">
                        <Input id="move-date" type="date" value={move.data.date} onChange={(e) => move.setData('date', e.target.value)} />
                    </Field>
                </div>
                <Field label={move.data.direction === 'deposit' ? 'Dari rekening' : 'Ke rekening'} error={move.errors.account_id}>
                    <AccountSelect value={move.data.account_id} onChange={(v) => move.setData('account_id', v)} />
                </Field>
            </FormDialog>
        </AppLayout>
    );
}
