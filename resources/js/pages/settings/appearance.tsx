import { Head } from '@inertiajs/react';

import AppearanceTabs from '@/components/appearance-tabs';
import HeadingSmall from '@/components/heading-small';
import LanguageTabs from '@/components/language-tabs';
import { t } from '@/lib/i18n';
import { type BreadcrumbItem } from '@/types';

import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: t('Tampilan'),
        href: '/settings/appearance',
    },
];

export default function Appearance() {
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
            </SettingsLayout>
        </AppLayout>
    );
}
