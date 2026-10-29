<?php

namespace App\Providers;

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
    }
}
