<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\RecurringItem;
use App\Services\BillService;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Biaya tetap per bulan: setiap item rutin muncul tiap bulan dengan budget, realisasi, dan status bayar.
 */
class MonthlyBillController extends Controller
{
    /** Komponen pengeluaran dari asumsi skenario yang ikut tampil (read-only). */
    private const SCENARIO_LINES = [
        'car' => 'Cicilan mobil',
        'house' => 'Cicilan rumah',
        'school' => 'Sekolah / SPP',
        'groceries' => 'Belanja bulanan',
        'pelagic' => 'Setoran Pelagic',
        'other' => 'Pengeluaran lain',
    ];

    public function index(Request $request): Response
    {
        $user = $request->user();
        $month = preg_match('/^\d{4}-\d{2}$/', (string) $request->query('month')) ? $request->query('month') : now()->format('Y-m');
        $service = new BillService($user);
        $items = $service->recurringItems();
        $bills = $service->bills($month, $items);

        // Baris dari skenario aktif untuk bulan yang sama (read-only). Cicilan yang sudah tampil
        // sebagai tagihan dari menu Utang tidak diulang agar tidak terhitung dua kali.
        $shownKinds = $bills->where('source', 'debt')->pluck('kind')->unique();
        $scenarioLines = [];
        ProjectionService::ensureScenarios($user);
        $projection = new ProjectionService($user, new FinanceService($user));
        $scenario = $projection->activeScenario();
        $row = $scenario ? collect($projection->project($scenario)['rows'])->firstWhere('month', $month) : null;
        if ($row) {
            foreach (self::SCENARIO_LINES as $key => $label) {
                if ($shownKinds->contains($key)) {
                    continue;
                }
                if (($row[$key] ?? 0) > 0) {
                    $scenarioLines[] = ['key' => $key, 'name' => $label, 'amount' => (int) $row[$key]];
                }
            }
        }

        return Inertia::render('monthly/index', [
            'month' => $month,
            'bills' => $bills,
            'scenario' => $scenario?->only(['id', 'name']),
            'scenarioLines' => $scenarioLines,
            'items' => $items->whereIn('type', ['income', 'expense'])->values(),
            'endingSoon' => $user->recurringItems()->endingSoon()->orderBy('end_date')->get(['id', 'name', 'type', 'amount', 'end_date']),
            'categories' => $user->categories()->where('type', 'expense')->orderBy('name')->get(['id', 'name', 'color']),
        ]);
    }

    /** Perpanjang item yang akan berakhir: tambah N bulan, atau tanpa batas bila months kosong. */
    public function renew(Request $request, RecurringItem $recurringItem): RedirectResponse
    {
        $this->ensureOwner($recurringItem);
        $data = $request->validate(['months' => ['nullable', 'integer', 'between:1,120']]);

        $end = empty($data['months'])
            ? null
            : CarbonImmutable::parse($recurringItem->end_date ?? now())->startOfMonth()->addMonths($data['months'])->endOfMonth()->toDateString();
        $recurringItem->update(['end_date' => $end]);

        return back()->with('success', $end
            ? "{$recurringItem->name} diperpanjang sampai ".CarbonImmutable::parse($end)->locale('id')->translatedFormat('F Y').'.'
            : "{$recurringItem->name} berlaku seterusnya.");
    }

    /** Konfirmasi item memang selesai di tanggal akhirnya. */
    public function confirmEnd(RecurringItem $recurringItem): RedirectResponse
    {
        $this->ensureOwner($recurringItem);
        $recurringItem->update(['end_confirmed_at' => now()]);

        return back()->with('success', "{$recurringItem->name} dikonfirmasi selesai.");
    }

    /** Catat pembayaran satu biaya tetap → transaksi pengeluaran bertaut ke item tersebut. */
    public function pay(Request $request, RecurringItem $recurringItem): RedirectResponse
    {
        $this->ensureOwner($recurringItem);
        $user = $request->user();
        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:1'],
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $user->id)],
            'date' => ['required', 'date'],
        ]);

        // Isi Dompet Tujuan → transfer dari rekening sumber ke dompet, bukan pengeluaran
        if ($recurringItem->type === 'transfer') {
            abort_if((int) $data['account_id'] === $recurringItem->to_account_id, 422, 'Rekening sumber tidak boleh sama dengan dompetnya.');
            $user->transactions()->create([
                'type' => 'transfer',
                'account_id' => $data['account_id'],
                'to_account_id' => $recurringItem->to_account_id,
                'amount' => $data['amount'],
                'date' => $data['date'],
                'note' => $recurringItem->name,
                'recurring_item_id' => $recurringItem->id,
            ]);

            return back()->with('success', "{$recurringItem->name} dicatat.");
        }

        $categoryId = $data['category_id'] ?? $recurringItem->category_id ?? Category::system($user, 'unspecified_expense')->id;
        if (! $recurringItem->category_id && ! empty($data['category_id'])) {
            $recurringItem->update(['category_id' => $data['category_id']]);
        }

        $user->transactions()->create([
            'type' => 'expense',
            'account_id' => $data['account_id'],
            'category_id' => $categoryId,
            'amount' => $data['amount'],
            'date' => $data['date'],
            'note' => $recurringItem->name,
            'recurring_item_id' => $recurringItem->id,
        ]);

        return back()->with('success', "Pembayaran {$recurringItem->name} dicatat.");
    }
}
