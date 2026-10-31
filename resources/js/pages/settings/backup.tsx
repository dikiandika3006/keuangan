import { MonthPicker } from '@/components/finance/month-picker';
import HeadingSmall from '@/components/heading-small';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { t } from '@/lib/i18n';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { CloudUpload, Download, FileSpreadsheet, HardDrive, Unplug } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Backup & Ekspor'), href: '/settings/backup' }];

type LocalFile = { name: string; size: number; time: string };
type DriveFile = { id: string; name: string; size: number; created: string };
interface Props {
    local: LocalFile[];
    google: { configured: boolean; connected: boolean; last_backup: string | null; files: DriveFile[] | false | null; redirect: string };
}

const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const thisYear = new Date().getFullYear();
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function Backup({ local, google }: Props) {
    const [busy, setBusy] = useState(false);
    const [from, setFrom] = useState(`${thisYear}-01`);
    const [to, setTo] = useState(currentMonth());

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Backup & Ekspor')} />
            <SettingsLayout>
                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Backup Database')}
                        description={t(
                            'Salinan otomatis dibuat tiap hari di server (30 terakhir disimpan). Unduh sesekali untuk disimpan di tempat lain.',
                        )}
                    />
                    <Button
                        disabled={busy}
                        onClick={() =>
                            router.post(
                                route('backup.now'),
                                {},
                                { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) },
                            )
                        }
                    >
                        <HardDrive /> {google.connected ? t('Backup sekarang (server + Google Drive)') : t('Backup sekarang')}
                    </Button>
                    {local.length > 0 && (
                        <ul className="divide-y rounded-lg border">
                            {local.map((f) => (
                                <li key={f.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">{f.name}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {when(f.time)} · {size(f.size)}
                                        </span>
                                    </span>
                                    <Button variant="ghost" size="icon" className="size-8" asChild>
                                        <a href={route('backup.download', f.name)} aria-label={t('Unduh')}>
                                            <Download className="size-4" />
                                        </a>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Google Drive')}
                        description={t(
                            'Backup harian otomatis ke folder "Keuangan Backup" di Google Drive-mu. Aplikasi hanya bisa melihat file yang ia buat sendiri.',
                        )}
                    />
                    {!google.configured ? (
                        <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm">
                            <p className="font-medium">{t('Perlu diatur sekali oleh pemilik server:')}</p>
                            <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-xs">
                                <li>{t('Buka console.cloud.google.com → buat project → aktifkan Google Drive API.')}</li>
                                <li>{t('APIs & Services → OAuth consent screen: tipe External, tambahkan emailmu sebagai test user.')}</li>
                                <li>
                                    {t('Credentials → Create OAuth client ID (Web application), Authorized redirect URI:')}{' '}
                                    <code className="bg-background rounded px-1">{google.redirect}</code>
                                </li>
                                <li>{t('Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di file .env server (lewat File Manager hPanel).')}</li>
                            </ol>
                        </div>
                    ) : google.connected ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-emerald-600">● {t('Terhubung')}</span>
                                {google.last_backup && (
                                    <span className="text-muted-foreground">· {t('backup terakhir :date', { date: when(google.last_backup) })}</span>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600"
                                    onClick={() => router.delete(route('backup.google.disconnect'), { preserveScroll: true })}
                                >
                                    <Unplug /> {t('Putuskan')}
                                </Button>
                            </div>
                            {google.files === false && (
                                <p className="text-sm text-amber-600">{t('Tidak bisa membaca Google Drive. Coba putuskan lalu hubungkan ulang.')}</p>
                            )}
                            {google.files && google.files.length > 0 && (
                                <ul className="divide-y rounded-lg border">
                                    {google.files.map((f) => (
                                        <li key={f.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                                            <span className="truncate">{f.name}</span>
                                            <span className="text-muted-foreground shrink-0 text-xs">{size(f.size)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        <Button asChild>
                            <a href={route('backup.google')}>
                                <CloudUpload /> {t('Hubungkan Google Drive')}
                            </a>
                        </Button>
                    )}
                </div>

                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Ekspor Laporan Excel')}
                        description={t(
                            'Transaksi, ringkasan per kategori, per tag, dan saldo rekening untuk rentang bulan. Untuk PDF, buka Rekap/Tinjauan lalu Cetak → Simpan sebagai PDF.',
                        )}
                    />
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="w-40">
                            <MonthPicker value={from} onChange={(v) => v && setFrom(v)} clearable={false} />
                        </div>
                        <span className="text-muted-foreground pb-2 text-sm">–</span>
                        <div className="w-40">
                            <MonthPicker value={to} onChange={(v) => v && setTo(v)} clearable={false} />
                        </div>
                        <Button variant="outline" asChild>
                            <a href={route('export', { from: from <= to ? from : to, to: from <= to ? to : from })}>
                                <FileSpreadsheet /> {t('Unduh Excel')}
                            </a>
                        </Button>
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
