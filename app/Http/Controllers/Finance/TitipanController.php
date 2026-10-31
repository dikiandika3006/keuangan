<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Services\FinanceService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Dana titipan / uang usaha yang cuma lewat: dicatat tanpa rekening (hanya di halaman ini),
 * tidak dihitung sebagai pemasukan/pengeluaran pribadi. Sisa saldonya dilacak per titipan.
 */
class TitipanController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $funds = (new FinanceService($user))->heldFunds();

        return Inertia::render('titipan/index', [
            'funds' => $funds,
            'transactions' => $user->transactions()
                ->whereIn('category_id', $funds->pluck('id'))
                ->with(['account:id,name', 'category:id,name,color,icon'])
                ->latest('date')->latest('id')
                ->limit(1000)
                ->get(),
            'type' => Category::TITIPAN,
        ]);
    }
}
