<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\FireEntry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Kalkulator FIRE. Tab Realisasi memakai setoran & saldo dana FIRE yang diisi manual tiap bulan,
 * terpisah dari rekening dan transaksi.
 */
class FireController extends Controller
{
    public function index(Request $request): Response
    {
        return Inertia::render('calculator/fire', [
            'entries' => $request->user()->fireEntries()->orderBy('month')->get(['id', 'month', 'deposit', 'balance']),
        ]);
    }

    /** Isi atau ubah realisasi satu bulan (satu catatan per bulan). */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
            'deposit' => ['required', 'integer', 'min:0'],
            'balance' => ['required', 'integer', 'min:0'],
        ]);
        $request->user()->fireEntries()->updateOrCreate(['month' => $data['month']], $data);

        return back()->with('success', __('Realisasi FIRE disimpan.'));
    }

    public function destroy(Request $request, FireEntry $fireEntry): RedirectResponse
    {
        abort_unless($fireEntry->user_id === $request->user()->id, 403);
        $fireEntry->delete();

        return back()->with('success', __('Realisasi FIRE dihapus.'));
    }
}
