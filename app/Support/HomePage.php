<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Halaman pertama setelah masuk: di HP langsung Rekap Bulanan, di laptop/desktop Kondisi (dashboard).
 */
class HomePage
{
    public static function url(Request $request): string
    {
        $mobile = (bool) preg_match('/Mobi|Android|iPhone|iPad/i', (string) $request->userAgent());

        return route($mobile ? 'recap.index' : 'dashboard', absolute: false);
    }
}
