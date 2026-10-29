<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bahasa tampilan: pilihan akun → cookie (halaman login) → bawaan Indonesia.
 */
class SetLocale
{
    public const SUPPORTED = ['id', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $request->user()?->locale ?? $request->cookie('locale');
        app()->setLocale(in_array($locale, self::SUPPORTED, true) ? $locale : 'id');

        return $next($request);
    }
}
