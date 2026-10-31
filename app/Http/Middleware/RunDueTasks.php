<?php

namespace App\Http\Middleware;

use App\Services\TaskRunner;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cadangan bila cron belum dipasang: setelah respons terkirim, jalankan tugas berkala
 * paling sering tiap 10 menit (pengecekan murah: satu stat file).
 */
class RunDueTasks
{
    private const EVERY_SECONDS = 600;

    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        if (app()->runningUnitTests()) {
            return;
        }
        $marker = storage_path('framework/tasks.tick');
        if (is_file($marker) && time() - filemtime($marker) < self::EVERY_SECONDS) {
            return;
        }
        @touch($marker);

        try {
            TaskRunner::runDue();
        } catch (\Throwable $e) {
            Log::warning('Tugas berkala gagal: '.$e->getMessage());
        }
    }
}
