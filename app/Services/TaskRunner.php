<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

/**
 * Tugas berkala (backup harian + Google Drive, pengingat & push) tanpa bergantung cron:
 * dipanggil dari cron Hostinger (`php artisan keuangan:tasks`), URL cron, atau setelah request biasa.
 * Status terakhir dijalankan disimpan di storage supaya tiap tugas hanya jalan sekali per periode.
 */
class TaskRunner
{
    /** Jam lokal (WIB) pengingat boleh dikirim, supaya tidak berbunyi tengah malam. */
    private const REMIND_FROM = 7;

    private const REMIND_UNTIL = 21;

    private static function statePath(): string
    {
        return storage_path('framework/tasks.json');
    }

    /** @return array<string, string> tugas yang dijalankan → hasil singkat */
    public static function runDue(): array
    {
        $lock = fopen(storage_path('framework/tasks.lock'), 'c');
        if (! flock($lock, LOCK_EX | LOCK_NB)) {
            return [];
        }

        try {
            $state = File::exists(self::statePath()) ? (json_decode(File::get(self::statePath()), true) ?: []) : [];
            $now = CarbonImmutable::now('Asia/Jakarta');
            $done = [];

            $today = $now->toDateString();
            if (($state['backup'] ?? null) !== $today && $now->hour >= 2) {
                $done['backup'] = Artisan::call('keuangan:backup') === 0 ? 'ok' : trim(Artisan::output());
                foreach (User::whereNotNull('google_drive_token')->get() as $user) {
                    try {
                        (new GoogleDrive($user))->backup();
                        $done['drive:'.$user->id] = 'ok';
                    } catch (\Throwable $e) {
                        Log::warning('Backup Google Drive gagal: '.$e->getMessage());
                        $done['drive:'.$user->id] = $e->getMessage();
                    }
                }
                $state['backup'] = $today;
            }

            $hour = $now->format('Y-m-d H');
            if (($state['remind'] ?? null) !== $hour && $now->hour >= self::REMIND_FROM && $now->hour < self::REMIND_UNTIL) {
                foreach (User::whereHas('pushSubscriptions')->get() as $user) {
                    $reminders = new ReminderService($user);
                    $created = $reminders->generate(CarbonImmutable::parse($today));
                    $done['remind:'.$user->id] = $created.'/'.$reminders->push();
                }
                $state['remind'] = $hour;
            }

            File::put(self::statePath(), json_encode($state));

            return $done;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** Token untuk URL cron eksternal (mis. cron-job.org), diturunkan dari APP_KEY. */
    public static function cronToken(): string
    {
        return substr(hash_hmac('sha256', 'keuangan-cron', (string) config('app.key')), 0, 32);
    }
}
