<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Services\GoogleDrive;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Backup: salinan harian di server, unduh manual, dan backup otomatis ke Google Drive. */
class BackupController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $drive = null;
        if ($user->google_drive_token) {
            try {
                $drive = array_slice((new GoogleDrive($user))->files(), 0, 10);
            } catch (\Throwable $e) {
                Log::warning('Daftar Google Drive gagal: '.$e->getMessage());
                $drive = false;
            }
        }

        return Inertia::render('settings/backup', [
            'local' => collect(File::exists($dir = storage_path('app/backups')) ? File::files($dir) : [])
                ->filter(fn ($f) => str_starts_with($f->getFilename(), 'keuangan-'))
                ->sortByDesc(fn ($f) => $f->getFilename())->take(10)
                ->map(fn ($f) => ['name' => $f->getFilename(), 'size' => $f->getSize(), 'time' => date('c', $f->getMTime())])->values(),
            'google' => [
                'configured' => GoogleDrive::configured(),
                'connected' => (bool) $user->google_drive_token,
                'last_backup' => $user->google_drive_backup_at,
                'files' => $drive,
                'redirect' => route('backup.google.callback'),
            ],
        ]);
    }

    /** Backup sekarang: salinan lokal + Google Drive bila terhubung. */
    public function run(Request $request): RedirectResponse
    {
        $ok = Artisan::call('keuangan:backup') === 0;
        $user = $request->user();
        $drive = null;
        if ($ok && $user->google_drive_token) {
            try {
                (new GoogleDrive($user))->backup();
                $drive = true;
            } catch (\Throwable $e) {
                Log::warning('Backup Google Drive gagal: '.$e->getMessage());
                $drive = false;
            }
        }
        ActivityLog::record('backup', $drive === null ? 'server' : ($drive ? 'server + Google Drive' : 'server (Google Drive gagal)'));

        if (! $ok) {
            return back()->with('error', __('Backup gagal: :error', ['error' => trim(Artisan::output())]));
        }

        return $drive === false
            ? back()->with('error', __('Backup server tersimpan, tetapi unggah ke Google Drive gagal. Coba hubungkan ulang.'))
            : back()->with('success', $drive ? __('Backup tersimpan di server & Google Drive.') : __('Backup database tersimpan di storage/app/backups.'));
    }

    public function download(Request $request, string $name): BinaryFileResponse
    {
        abort_unless(preg_match('/^keuangan-[\w-]+\.sqlite$/', $name), 404);
        $path = storage_path('app/backups/'.$name);
        abort_unless(is_file($path), 404);
        ActivityLog::record('download_backup', $name);

        return response()->download($path);
    }

    public function connect(Request $request): RedirectResponse
    {
        abort_unless(GoogleDrive::configured(), 404);
        $state = Str::random(40);
        $request->session()->put('google.state', $state);

        return redirect()->away(GoogleDrive::authUrl($state));
    }

    public function callback(Request $request): RedirectResponse
    {
        if ($request->query('error') || ! hash_equals((string) $request->session()->pull('google.state'), (string) $request->query('state'))) {
            return redirect()->route('backup.index')->with('error', __('Menghubungkan Google Drive dibatalkan.'));
        }

        try {
            $drive = new GoogleDrive($request->user());
            $drive->connect((string) $request->query('code'));
            $drive->backup();
        } catch (\Throwable $e) {
            Log::warning('Hubungkan Google Drive gagal: '.$e->getMessage());

            return redirect()->route('backup.index')->with('error', __('Gagal menghubungkan Google Drive.'));
        }
        ActivityLog::record('google_drive', 'connected');

        return redirect()->route('backup.index')->with('success', __('Google Drive terhubung dan backup pertama sudah diunggah.'));
    }

    public function disconnect(Request $request): RedirectResponse
    {
        (new GoogleDrive($request->user()))->disconnect();
        ActivityLog::record('google_drive', 'disconnected');

        return back()->with('success', __('Google Drive diputus.'));
    }
}
