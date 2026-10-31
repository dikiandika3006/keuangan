<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\FinanceService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Kalkulator FIRE. Tab Realisasi memakai kekayaan bersih akhir tiap bulan sejak transaksi pertama (maks. 5 tahun).
 */
class FireController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $first = $user->transactions()->min('date');
        $months = $first
            ? min(60, max(2, (int) CarbonImmutable::parse($first)->startOfMonth()->diffInMonths(CarbonImmutable::now()->startOfMonth()) + 1))
            : 2;

        return Inertia::render('calculator/fire', [
            'history' => Inertia::defer(fn () => (new FinanceService($user))->netWorthHistory($months)),
        ]);
    }
}
