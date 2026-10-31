import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Link, usePage } from '@inertiajs/react';

/**
 * Halaman yang sejenis digabung di bawah satu menu sidebar; tab ini berpindah di antaranya.
 * Alamat lama tetap berlaku, jadi bookmark & pintasan di HP tidak rusak.
 */
export const TAB_GROUPS = {
    recap: [
        { title: t('Rekap'), url: '/recap' },
        { title: t('Tinjauan'), url: '/review' },
    ],
    calendar: [
        { title: t('Kalender'), url: '/calendar' },
        { title: t('Daftar tagihan'), url: '/monthly' },
    ],
    projection: [
        { title: t('26 bulan'), url: '/projection' },
        { title: t('Jangka panjang'), url: '/plan' },
    ],
    calculator: [
        { title: t('FIRE'), url: '/calculator/fire' },
        { title: t('KPR'), url: '/calculator/kpr' },
    ],
    loans: [
        { title: t('Utang & Cicilan'), url: '/debts' },
        { title: t('Piutang'), url: '/receivables' },
    ],
} as const;

export function PageTabs({ group }: { group: keyof typeof TAB_GROUPS }) {
    const { url } = usePage();

    return (
        <nav className="bg-muted -mb-2 inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg p-1 print:hidden">
            {TAB_GROUPS[group].map((tab) => (
                <Link
                    key={tab.url}
                    href={tab.url}
                    prefetch
                    className={cn(
                        'rounded-md px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors',
                        url.startsWith(tab.url)
                            ? 'bg-background text-foreground font-medium shadow-xs'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {tab.title}
                </Link>
            ))}
        </nav>
    );
}
