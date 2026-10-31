import HeadingSmall from '@/components/heading-small';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { b64url } from '@/lib/http';
import { t } from '@/lib/i18n';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Bell, BellOff, Copy, Send, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Notifikasi'), href: '/settings/notifications' }];

type Device = { id: number; endpoint_hash: string; user_agent: string | null; created_at: string };
type Note = { id: number; title: string; body: string; url: string | null; delivered_at: string | null; created_at: string };

async function sha256Hex(text: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Notifications({
    publicKey,
    devices,
    recent,
    cronUrl,
}: {
    publicKey: string;
    devices: Device[];
    recent: Note[];
    cronUrl: string;
}) {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
    const [thisHash, setThisHash] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!supported) return;
        navigator.serviceWorker.ready
            .then((reg) => reg.pushManager.getSubscription())
            .then((sub) => (sub ? sha256Hex(sub.endpoint).then(setThisHash) : setThisHash(null)))
            .catch(() => undefined);
    }, [supported, devices]);

    const enable = async () => {
        setError('');
        setBusy(true);
        try {
            if ((await Notification.requestPermission()) !== 'granted') {
                setError(t('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.'));
                return;
            }
            const reg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            const sub =
                (await reg.pushManager.getSubscription()) ??
                (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url.decode(publicKey) }));
            router.post(route('notifications.subscribe'), { endpoint: sub.endpoint }, { preserveScroll: true });
        } catch {
            setError(t('Gagal mengaktifkan notifikasi di perangkat ini.'));
        } finally {
            setBusy(false);
        }
    };

    const disable = async (hash: string) => {
        if (hash === thisHash) {
            const reg = await navigator.serviceWorker.ready;
            await (await reg.pushManager.getSubscription())?.unsubscribe();
        }
        router.post(route('notifications.unsubscribe'), { endpoint_hash: hash }, { preserveScroll: true });
    };

    const active = thisHash !== null && devices.some((d) => d.endpoint_hash === thisHash);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Notifikasi')} />
            <SettingsLayout>
                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Notifikasi Push')}
                        description={t(
                            'Pengingat tagihan H-1 & hari H, cicilan, piutang terlambat, belum mencatat 2 hari, cocokkan saldo, dan tinjauan bulanan. Dikirim pukul 07.00–21.00 WIB.',
                        )}
                    />
                    {!supported ? (
                        <p className="text-muted-foreground text-sm">
                            {t(
                                'Browser ini belum mendukung notifikasi push. Di iPhone, pasang aplikasi ke Layar Utama dulu (Bagikan → Tambah ke Layar Utama), lalu buka dari ikonnya.',
                            )}
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {active ? (
                                <Button variant="outline" onClick={() => thisHash && disable(thisHash)}>
                                    <BellOff /> {t('Matikan di perangkat ini')}
                                </Button>
                            ) : (
                                <Button onClick={enable} disabled={busy}>
                                    <Bell /> {t('Aktifkan di perangkat ini')}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                disabled={devices.length === 0}
                                onClick={() => router.post(route('notifications.test'), {}, { preserveScroll: true })}
                            >
                                <Send /> {t('Kirim tes')}
                            </Button>
                        </div>
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {devices.length > 0 && (
                        <ul className="divide-y rounded-lg border">
                            {devices.map((d) => (
                                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                    <Smartphone className="text-muted-foreground size-4" />
                                    <span className="min-w-0 flex-1 truncate">
                                        {d.user_agent?.slice(0, 70) ?? t('Perangkat')}
                                        {d.endpoint_hash === thisHash && <span className="ml-1 text-emerald-600">({t('perangkat ini')})</span>}
                                    </span>
                                    <Button variant="ghost" size="sm" onClick={() => disable(d.endpoint_hash)}>
                                        {t('Hapus')}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-3">
                    <HeadingSmall
                        title={t('Jadwal otomatis')}
                        description={t(
                            'Pengingat & backup harian berjalan saat aplikasi dibuka. Supaya tetap jalan walau aplikasi tidak dibuka, pasang Cron Job di hPanel Hostinger (atau cron-job.org) yang membuka URL ini tiap 15 menit:',
                        )}
                    />
                    <div className="flex items-center gap-2">
                        <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs">{cronUrl}</code>
                        <Button variant="outline" size="icon" onClick={() => navigator.clipboard?.writeText(cronUrl)} aria-label={t('Salin')}>
                            <Copy className="size-4" />
                        </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                        {t('Atau perintah cron: php artisan schedule:run (tiap menit) di folder aplikasi.')}
                    </p>
                </div>

                {recent.length > 0 && (
                    <div className="space-y-3">
                        <HeadingSmall title={t('Pengingat terakhir')} />
                        <ul className="divide-y rounded-lg border">
                            {recent.map((n) => (
                                <li key={n.id} className="px-3 py-2 text-sm">
                                    <a href={n.url ?? '#'} className="font-medium hover:underline">
                                        {n.title}
                                    </a>
                                    <p className="text-muted-foreground text-xs">
                                        {n.body} · {new Date(n.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                        {!n.delivered_at && ` · ${t('belum terkirim')}`}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </SettingsLayout>
        </AppLayout>
    );
}
