<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\RunDueTasks;
use App\Http\Middleware\RunPendingMigrations;
use App\Http\Middleware\SetLocale;
use App\Support\HomePage;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->encryptCookies(except: ['locale']);
        $middleware->redirectUsersTo(fn (Request $request) => HomePage::url($request));
        $middleware->web(prepend: [RunPendingMigrations::class], append: [
            SetLocale::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            RunDueTasks::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
