import { type FullFormDefaults, QuickEntry } from '@/components/finance/quick-entry';
import { TransactionForm } from '@/components/finance/transaction-form';
import { useSidebar } from '@/components/ui/sidebar';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Link, usePage } from '@inertiajs/react';
import { ArrowLeftRight, CalendarDays, ChartPie, Menu, Plus } from 'lucide-react';
import { useState } from 'react';

const items = [
    { title: t('Rekap Bulanan'), url: '/recap', icon: ChartPie },
    { title: t('Transaksi'), url: '/transactions', icon: ArrowLeftRight },
    null,
    { title: t('Kalender'), url: '/calendar', icon: CalendarDays },
];

/** Navigasi bawah (HP) + tombol catat cepat; di layar besar tombol catat cepat melayang di pojok kanan bawah. */
export function MobileNav() {
    const { url } = usePage();
    const { setOpenMobile } = useSidebar();
    const [quick, setQuick] = useState(false);
    const [full, setFull] = useState<FullFormDefaults | null>(null);

    return (
        <>
            <nav className="bg-background/75 supports-[backdrop-filter]:bg-background/60 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur-xl backdrop-saturate-150 md:hidden print:hidden">
                <div className="grid h-16 grid-cols-5 items-center">
                    {items.map((item, i) =>
                        item === null ? (
                            <div key={i} className="flex justify-center">
                                <button
                                    onClick={() => setQuick(true)}
                                    className="bg-primary text-primary-foreground ring-background -mt-7 flex size-14 items-center justify-center rounded-full shadow-lg ring-4 shadow-emerald-600/40 transition active:scale-95"
                                    aria-label={t('Catat transaksi')}
                                >
                                    <Plus className="size-7" />
                                </button>
                            </div>
                        ) : (
                            <Link
                                key={item.url}
                                href={item.url}
                                prefetch
                                className={cn(
                                    'flex flex-col items-center gap-1 text-center text-[11px] leading-tight',
                                    url.startsWith(item.url) ? 'text-primary font-medium' : 'text-muted-foreground',
                                )}
                            >
                                <item.icon className="size-5" />
                                {item.title}
                            </Link>
                        ),
                    )}
                    <button onClick={() => setOpenMobile(true)} className="text-muted-foreground flex flex-col items-center gap-1 text-[11px]">
                        <Menu className="size-5" />
                        {t('Menu')}
                    </button>
                </div>
            </nav>
            <button
                onClick={() => setQuick(true)}
                className="bg-primary text-primary-foreground fixed right-6 bottom-6 z-40 hidden size-14 items-center justify-center rounded-full shadow-lg shadow-emerald-600/40 transition hover:scale-105 active:scale-95 md:flex print:hidden"
                aria-label={t('Catat transaksi')}
                title={t('Catat Cepat')}
            >
                <Plus className="size-7" />
            </button>
            <QuickEntry open={quick} onOpenChange={setQuick} onFullForm={setFull} />
            <TransactionForm open={full !== null} onOpenChange={(o) => !o && setFull(null)} defaults={full ?? undefined} />
        </>
    );
}
