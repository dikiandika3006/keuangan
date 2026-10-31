<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\FireEntry;
use App\Services\FireService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Kalkulator FIRE. Tab Realisasi diambil otomatis dari Rekening FIRE bila ada; kalau belum ada, dari isian manual tiap bulan
 * (terpisah dari rekening dan transaksi).
 */
class FireController extends Controller
{
    public function index(Request $request): Response
    {
        $fire = new FireService($request->user());
        $account = $fire->account();
        // Ada Rekening FIRE: realisasi dihitung otomatis dari transfer & saldo rekening itu, isian manual tidak dipakai
        $entries = $account
            ? collect($fire->history($account))->map(fn ($row) => ['id' => 0, ...$row])
            : $request->user()->fireEntries()->orderBy('month')->get(['id', 'month', 'deposit', 'balance']);

        return Inertia::render('calculator/fire', [
            'entries' => $entries,
            'fireAccount' => $account ? [
                'id' => $account->id,
                'name' => $account->name,
                'opening' => $fire->openingBalance($account, $entries->first()['month']),
            ] : null,
            // Variabel tab Simulasi & Realisasi dari akun (null = belum pernah disimpan)
            'settings' => $request->user()->fire_settings,
        ]);
    }

    /** Simpan variabel kalkulator (dipanggil otomatis saat angka diubah) supaya sama di semua perangkat. */
    public function saveSettings(Request $request): JsonResponse
    {
        $rules = [];
        foreach (['simulation', 'actual'] as $tab) {
            $rules += [
                "$tab.initial" => ['required', 'integer', 'min:0'],
                "$tab.monthlySaving" => ['required', 'integer', 'min:0'],
                "$tab.monthlyExpense" => ['required', 'integer', 'min:0'],
                "$tab.rate" => ['required', 'numeric', 'between:-100,100'],
                "$tab.tax" => ['required', 'numeric', 'between:0,100'],
                "$tab.withdrawalRate" => ['required', 'numeric', 'between:0,100'],
            ];
        }
        $data = $request->validate(['simulation' => ['required', 'array'], 'actual' => ['required', 'array'], ...$rules]);
        $keys = ['initial', 'monthlySaving', 'monthlyExpense', 'rate', 'tax', 'withdrawalRate'];
        $request->user()->forceFill(['fire_settings' => [
            'simulation' => array_intersect_key($data['simulation'], array_flip($keys)),
            'actual' => array_intersect_key($data['actual'], array_flip($keys)),
        ]])->save();

        return response()->json(['saved' => true]);
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
