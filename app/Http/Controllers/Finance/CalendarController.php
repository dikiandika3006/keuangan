<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\BillService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Kalender rencana biaya & pemasukan: semua tagihan tetap, cicilan, isi dompet, pemasukan rutin,
 * dan piutang ditempatkan di tanggal jatuh temponya.
 */
class CalendarController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $month = preg_match('/^\d{4}-\d{2}$/', (string) $request->query('month')) ? $request->query('month') : now()->format('Y-m');

        return Inertia::render('calendar/index', [
            'month' => $month,
            'events' => (new BillService($request->user()))->events($month),
        ]);
    }
}
