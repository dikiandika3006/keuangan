<?php

namespace App\Providers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Kamus terjemahan per bagian aplikasi: lang/i18n/<bagian>/en.json (dipakai juga oleh frontend)
        foreach (glob(lang_path('i18n/*'), GLOB_ONLYDIR) as $dir) {
            $this->app['translator']->addJsonPath($dir);
        }

        // Log aktivitas: masuk, keluar, dan percobaan masuk yang gagal (untuk memantau akses mencurigakan)
        Event::listen(Login::class, fn (Login $e) => ActivityLog::record('login', $e->remember ? 'remember' : 'password', $e->user, $e->user->getAuthIdentifier()));
        Event::listen(Logout::class, fn (Logout $e) => $e->user && ActivityLog::record('logout', '', $e->user, $e->user->getAuthIdentifier()));
        Event::listen(Failed::class, function (Failed $e) {
            $user = $e->user ?? User::where('email', $e->credentials['email'] ?? '')->first();
            if ($user) {
                ActivityLog::record('login_failed', (string) ($e->credentials['email'] ?? ''), $user, $user->id);
            }
        });
    }
}
