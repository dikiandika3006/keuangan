<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Bila cron Hostinger dipasang (php artisan schedule:run tiap menit); tanpa cron tugas tetap jalan lewat request/URL cron
Schedule::command('keuangan:tasks')->everyFifteenMinutes();
