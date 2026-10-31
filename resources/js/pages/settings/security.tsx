import HeadingSmall from '@/components/heading-small';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { passkeySupported, registerPasskey } from '@/lib/webauthn';
import { type BreadcrumbItem } from '@/types';
import { type Paginated } from '@/types/finance';
import { Head, Link, router } from '@inertiajs/react';
import { Fingerprint, LogIn, LogOut, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: t('Keamanan'), href: '/settings/security' }];

type Passkey = { id: number; name: string; last_used_at: string | null; created_at: string };
type Log = {
    id: number;
    action: string;
    subject_type: string | null;
    description: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
};

const ACTIONS: Record<string, string> = {
    login: t('Masuk|login'),
    logout: t('Keluar|logout'),
    login_failed: t('Gagal masuk'),
    created: t('Menambah'),
    updated: t('Mengubah'),
    deleted: t('Menghapus'),
    export: t('Ekspor laporan'),
    backup: t('Backup'),
    download_backup: t('Unduh backup'),
    google_drive: t('Google Drive'),
};

const SUBJECTS: Record<string, string> = {
    Transaction: t('transaksi'),
    Account: t('rekening'),
    Debt: t('utang'),
    Receivable: t('piutang'),
    Asset: t('aset'),
    Goal: t('target'),
    Category: t('kategori'),
    RecurringItem: t('biaya rutin'),
    Rule: t('aturan'),
    Passkey: t('perangkat biometrik'),
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Security({ passkeys, logs, filter }: { passkeys: Passkey[]; logs: Paginated<Log>; filter: string | null }) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const supported = passkeySupported();

    const add = async () => {
        setError('');
        try {
            await registerPasskey(name, (m) =>
                setError(m === 'unsupported' ? t('Browser ini belum mendukung login biometrik. Coba Chrome/Safari terbaru.') : m),
            );
        } catch {
            setError(t('Pendaftaran dibatalkan atau tidak didukung perangkat ini.'));
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('Keamanan')} />
            <SettingsLayout>
                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Login Biometrik')}
                        description={t(
                            'Masuk dengan sidik jari, Face ID, atau PIN HP tanpa mengetik kata sandi. Daftarkan di tiap perangkat yang dipakai.',
                        )}
                    />
                    {supported ? (
                        <div className="flex flex-wrap gap-2">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('Nama perangkat (opsional), mis. HP Samsung')}
                                className="max-w-xs"
                            />
                            <Button onClick={add}>
                                <Fingerprint /> {t('Aktifkan di perangkat ini')}
                            </Button>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm">
                            {t('Perangkat/browser ini tidak mendukung login biometrik, atau situs tidak dibuka lewat HTTPS.')}
                        </p>
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {passkeys.length > 0 && (
                        <ul className="divide-y rounded-lg border">
                            {passkeys.map((p) => (
                                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                    <Fingerprint className="text-muted-foreground size-4" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{p.name}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {p.last_used_at ? t('Terakhir dipakai :date', { date: when(p.last_used_at) }) : t('Belum pernah dipakai')}
                                        </span>
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 text-red-600"
                                        onClick={() => router.delete(route('passkeys.destroy', p.id), { preserveScroll: true })}
                                        aria-label={t('Hapus')}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-4">
                    <HeadingSmall
                        title={t('Log Aktivitas')}
                        description={t('Riwayat masuk/keluar dan perubahan data di akunmu. Periksa bila ada yang tidak kamu kenali.')}
                    />
                    <div className="flex flex-wrap gap-1.5 text-xs">
                        {[null, 'login', 'login_failed', 'created', 'updated', 'deleted'].map((a) => (
                            <Link
                                key={a ?? 'all'}
                                href={route('security.index', a ? { action: a } : {})}
                                preserveScroll
                                className={cn('rounded-full border px-2.5 py-1', filter === a && 'bg-foreground text-background')}
                            >
                                {a ? ACTIONS[a] : t('Semua')}
                            </Link>
                        ))}
                    </div>
                    <ul className="divide-y rounded-lg border">
                        {logs.data.length === 0 && <li className="text-muted-foreground px-3 py-4 text-sm">{t('Belum ada aktivitas.')}</li>}
                        {logs.data.map((l) => (
                            <li key={l.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                                <span className="mt-0.5">
                                    {l.action === 'login' ? (
                                        <LogIn className="size-4 text-emerald-600" />
                                    ) : l.action === 'logout' ? (
                                        <LogOut className="text-muted-foreground size-4" />
                                    ) : l.action === 'login_failed' ? (
                                        <ShieldAlert className="size-4 text-red-600" />
                                    ) : (
                                        <span className="bg-muted-foreground/40 mt-1 block size-2 rounded-full" />
                                    )}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block">
                                        <span className="font-medium">{ACTIONS[l.action] ?? l.action}</span>
                                        {l.subject_type && SUBJECTS[l.subject_type] && ` ${SUBJECTS[l.subject_type]}`}
                                        {l.description && <span className="text-muted-foreground"> · {l.description}</span>}
                                    </span>
                                    <span className="text-muted-foreground block truncate text-xs">
                                        {when(l.created_at)}
                                        {l.ip && ` · ${l.ip}`}
                                        {l.user_agent && ` · ${l.user_agent.slice(0, 60)}`}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {(logs.prev_page_url || logs.next_page_url) && (
                        <div className="flex justify-between">
                            <Button variant="outline" size="sm" disabled={!logs.prev_page_url} asChild={!!logs.prev_page_url}>
                                {logs.prev_page_url ? (
                                    <Link href={logs.prev_page_url} preserveScroll>
                                        {t('Sebelumnya')}
                                    </Link>
                                ) : (
                                    <span>{t('Sebelumnya')}</span>
                                )}
                            </Button>
                            <Button variant="outline" size="sm" disabled={!logs.next_page_url} asChild={!!logs.next_page_url}>
                                {logs.next_page_url ? (
                                    <Link href={logs.next_page_url} preserveScroll>
                                        {t('Berikutnya')}
                                    </Link>
                                ) : (
                                    <span>{t('Berikutnya')}</span>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
