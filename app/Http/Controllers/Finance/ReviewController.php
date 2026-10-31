<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\ReviewService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Tinjauan bulanan (default bulan lalu): ringkasan, perubahan, anggaran jebol, dan saran. */
class ReviewController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $month = preg_match('/^\d{4}-\d{2}$/', (string) $request->query('month')) && $request->query('month') <= now()->format('Y-m')
            ? $request->query('month')
            : now()->subMonth()->format('Y-m');

        // Pengingat "tinjauan siap" untuk bulan ini dianggap sudah dibaca
        $request->user()->appNotifications()->where('key', 'review:'.$month)->update(['read_at' => now()]);

        return Inertia::render('review/index', ['review' => (new ReviewService($request->user()))->build($month)]);
    }
}
