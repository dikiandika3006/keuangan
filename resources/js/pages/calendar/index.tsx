import { EmptyState, Page, PageHeader, Section, StatCard, StatusBadge } from '@/components/finance/ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { compact, formatDate, monthLabel, rupiah, today } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Kalender', href: '/calendar' }];
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

interface CalendarEvent {
    key: string;
    source: 'recurring' | 'pocket' | 'debt' | 'income' | 'receivable';
    direction: 'out' | 'in' | 'transfer';
    title: string;
    subtitle: string | null;
    color: string | null;
    amount: number;
    done: number;
    date: string;
    has_day: boolean;
    status: 'paid' | 'partial' | 'late' | 'pending';
    url: string;
}

const DIRECTION = {
    out: { icon: ArrowUpRight, chip: 'bg-red-500/10 text-red-700 dark:text-red-300', dot: 'bg-red-500', label: 'Keluar' },
    in: { icon: ArrowDownLeft, chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', label: 'Masuk' },
    transfer: { icon: ArrowLeftRight, chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', label: 'Isi dompet' },
};

function shiftMonth(month: string, delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Sel kalender Senin–Minggu; null = sel kosong sebelum tanggal 1 / setelah akhir bulan. */
function monthGrid(month: string): (string | null)[] {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
    while (cells.length % 7) cells.push(null);
    return cells;
}

export default function Calendar({ month, events }: { month: string; events: CalendarEvent[] }) {
    const now = today();
    const isThisMonth = now.startsWith(month);
    const [selected, setSelected] = useState<string>(isThisMonth ? now : `${month}-01`);

    const dated = events.filter((e) => e.has_day);
    const undated = events.filter((e) => !e.has_day);
    const byDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        for (const e of dated) (map[e.date] ??= []).push(e);
        return map;
    }, [dated]);

    const go = (m: string) => {
        setSelected(now.startsWith(m) ? now : `${m}-01`);
        router.get(route('calendar.index'), { month: m }, { preserveScroll: true, preserveState: true });
    };

    const out = events.filter((e) => e.direction !== 'in');
    const plannedOut = out.reduce((s, e) => s + e.amount, 0);
    const paidOut = out.reduce((s, e) => s + Math.min(e.done, e.amount), 0);
    const plannedIn = events.filter((e) => e.direction === 'in').reduce((s, e) => s + e.amount, 0);
    const late = events.filter((e) => e.status === 'late');
    const selectedEvents = byDate[selected] ?? [];
    // Pengingat: yang belum beres dari hari ini sampai 7 hari ke depan (atau terlambat)
    const upcoming = events.filter((e) => e.status !== 'paid' && e.has_day && (e.status === 'late' || (e.date >= now && dayDiff(now, e.date) <= 7)));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Kalender" />
            <Page>
                <PageHeader
                    title="Kalender Keuangan"
                    description="Rencana biaya tetap, cicilan, isi dompet, gaji, dan piutang di tanggal jatuh temponya. Klik tanggal untuk melihat rinciannya."
                />

                <div className="flex items-center justify-between gap-2 rounded-xl border p-2">
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label="Bulan sebelumnya">
                        <ChevronLeft />
                    </Button>
                    <button className="text-sm font-semibold" onClick={() => go(now.slice(0, 7))} title="Kembali ke bulan ini">
                        {monthLabel(month, 'long')}
                        {isThisMonth && <span className="text-muted-foreground ml-1 font-normal">(bulan ini)</span>}
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => go(shiftMonth(month, 1))} aria-label="Bulan berikutnya">
                        <ChevronRight />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard label="Rencana Keluar" value={compact(plannedOut)} sub={rupiah(plannedOut)} />
                    <StatCard label="Sudah Dibayar" value={compact(paidOut)} sub={`sisa ${compact(plannedOut - paidOut)}`} tone="positive" />
                    <StatCard label="Rencana Masuk" value={compact(plannedIn)} sub={rupiah(plannedIn)} />
                    <StatCard
                        label="Terlambat"
                        value={late.length}
                        sub={late.length ? compact(late.reduce((s, e) => s + e.amount - e.done, 0)) : 'aman'}
                        tone={late.length ? 'negative' : 'default'}
                    />
                </div>

                {upcoming.length > 0 && (
                    <Section title="Pengingat 7 hari ke depan">
                        <EventList events={upcoming} showDate />
                    </Section>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
                    <section className="bg-card rounded-xl border p-2 sm:p-3 lg:col-span-2">
                        <div className="text-muted-foreground grid grid-cols-7 pb-1 text-center text-[11px] font-medium">
                            {WEEKDAYS.map((d) => (
                                <div key={d}>{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {monthGrid(month).map((date, i) => {
                                if (!date) return <div key={`empty-${i}`} />;
                                const list = byDate[date] ?? [];
                                const hasLate = list.some((e) => e.status === 'late');
                                const allDone = list.length > 0 && list.every((e) => e.status === 'paid');
                                return (
                                    <button
                                        key={date}
                                        onClick={() => setSelected(date)}
                                        className={cn(
                                            'flex min-h-14 flex-col items-stretch gap-0.5 rounded-lg border p-1 text-left transition sm:min-h-24',
                                            selected === date
                                                ? 'border-foreground ring-foreground/20 ring-2'
                                                : 'hover:bg-muted/50 border-transparent',
                                            hasLate && selected !== date && 'border-red-500/40',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex size-6 items-center justify-center self-start rounded-full text-xs',
                                                date === now ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground',
                                            )}
                                        >
                                            {Number(date.slice(8))}
                                        </span>
                                        {/* HP: titik; layar lebar: label singkat */}
                                        <span className="flex flex-wrap gap-0.5 sm:hidden">
                                            {list.slice(0, 4).map((e) => (
                                                <span
                                                    key={e.key}
                                                    className={cn(
                                                        'size-1.5 rounded-full',
                                                        e.status === 'paid' ? 'bg-muted-foreground/40' : DIRECTION[e.direction].dot,
                                                    )}
                                                />
                                            ))}
                                        </span>
                                        <span className="hidden flex-col gap-0.5 sm:flex">
                                            {list.slice(0, 3).map((e) => (
                                                <span
                                                    key={e.key}
                                                    className={cn(
                                                        'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                                                        e.status === 'paid' ? 'text-muted-foreground line-through' : DIRECTION[e.direction].chip,
                                                        e.status === 'late' && 'bg-red-500/20 font-medium',
                                                    )}
                                                    title={`${e.title} · ${rupiah(e.amount)}`}
                                                >
                                                    {compact(e.amount)} {e.title}
                                                </span>
                                            ))}
                                            {list.length > 3 && (
                                                <span className="text-muted-foreground px-1 text-[10px]">+{list.length - 3} lagi</span>
                                            )}
                                        </span>
                                        {allDone && <span className="sr-only">semua beres</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 px-1 text-[11px]">
                            {Object.values(DIRECTION).map((d) => (
                                <span key={d.label} className="flex items-center gap-1">
                                    <span className={cn('size-2 rounded-full', d.dot)} /> {d.label}
                                </span>
                            ))}
                            <span className="flex items-center gap-1">
                                <span className="bg-muted-foreground/40 size-2 rounded-full" /> Sudah beres
                            </span>
                        </div>
                    </section>

                    <Section title={formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}>
                        {selectedEvents.length === 0 ? (
                            <EmptyState icon={CalendarDays} title="Tidak ada jadwal" description="Tidak ada tagihan atau pemasukan di tanggal ini." />
                        ) : (
                            <EventList events={selectedEvents} />
                        )}
                    </Section>
                </div>

                {undated.length > 0 && (
                    <Section title="Belum ada tanggal">
                        <p className="text-muted-foreground mb-2 text-xs">
                            Isi tanggal bayar di Biaya Bulanan agar muncul di kalender dan masuk pengingat.
                        </p>
                        <EventList events={undated} />
                    </Section>
                )}
            </Page>
        </AppLayout>
    );
}

function dayDiff(from: string, to: string) {
    return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000);
}

function EventList({ events, showDate }: { events: CalendarEvent[]; showDate?: boolean }) {
    return (
        <ul className="divide-y">
            {events.map((e) => {
                const Icon = DIRECTION[e.direction].icon;
                return (
                    <li key={e.key}>
                        <Link href={e.url} className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2">
                            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', DIRECTION[e.direction].chip)}>
                                <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{e.title}</span>
                                <span className="text-muted-foreground block truncate text-xs">
                                    {showDate && `${formatDate(e.date, { day: 'numeric', month: 'short' })} · `}
                                    {e.subtitle ?? DIRECTION[e.direction].label}
                                    {e.done > 0 && e.done < e.amount && ` · baru ${compact(e.done)}`}
                                </span>
                            </span>
                            <span className="shrink-0 text-right">
                                <span className="block text-sm font-semibold tabular-nums">{compact(e.amount)}</span>
                                <StatusBadge status={e.status} label={e.status === 'paid' && e.direction === 'in' ? 'Diterima' : undefined} />
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
