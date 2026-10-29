<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hosting tidak bisa menjalankan artisan, jadi migrasi baru dijalankan otomatis
 * pada request pertama setelah git pull (database di-backup dulu).
 */
class RunPendingMigrations
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->runningUnitTests()) {
            $this->migrateIfChanged();
        }

        return $next($request);
    }

    private function migrateIfChanged(): void
    {
        $files = glob(database_path('migrations/*.php'));
        sort($files);
        $hash = md5(implode('|', array_map('basename', $files)));
        $marker = storage_path('framework/migrated.hash');

        if (@file_get_contents($marker) === $hash) {
            return;
        }

        $lock = fopen(storage_path('framework/migrate.lock'), 'c');
        if (! flock($lock, LOCK_EX)) {
            return;
        }

        try {
            if (@file_get_contents($marker) === $hash) {
                return;
            }
            Artisan::call('keuangan:backup');
            if (Artisan::call('migrate', ['--force' => true]) === 0) {
                file_put_contents($marker, $hash);
            } else {
                Log::error('Migrasi otomatis gagal: '.Artisan::output());
            }
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
