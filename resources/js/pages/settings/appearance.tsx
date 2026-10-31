import { Head, router } from '@inertiajs/react';

import AppearanceTabs from '@/components/appearance-tabs';
import HeadingSmall from '@/components/heading-small';
import LanguageTabs from '@/components/language-tabs';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';

import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: t('Tampilan'),
        href: '/settings/appearance',
    },
];

const EMERGENCY_OPTIONS = [3, 6, 9, 12];

export default function Appearance({ emergencyMonths }: { emergencyMonths: number }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Tampilan')} />

            <SettingsLayout>
                <div className="space-y-6">
                    <HeadingSmall
                        title={t('Tema')}
                        description={t('Ikuti HP = otomatis mengikuti mode gelap/terang di HP. Pilihan disimpan di perangkat ini.')}
                    />
                    <AppearanceTabs />
                </div>
                <div className="space-y-6">
                    <HeadingSmall title={t('Bahasa')} description={t('Bahasa tampilan aplikasi, disimpan di akunmu.')} />
                    <LanguageTabs />
                </div>
                <div className="space-y-6">
                    <HeadingSmall
                        title={t('Target Dana Darurat')}
                        description={t(
                            'Berapa bulan pengeluaran yang ingin disiapkan. Idealnya 3–6 bulan (6–12 bulan bila berkeluarga atau pekerja lepas).',
                        )}
                    />
                    <div className="bg-muted inline-flex gap-1 rounded-lg p-1">
                        {EMERGENCY_OPTIONS.map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => router.put(route('emergency.update'), { emergency_months: m }, { preserveScroll: true })}
                                className={cn('rounded-md px-3.5 py-1.5 text-sm', emergencyMonths === m && 'bg-background font-medium shadow-sm')}
                            >
                                {t(':n bln', { n: m })}
                            </button>
                        ))}
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
