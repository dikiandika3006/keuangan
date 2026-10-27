<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\DebtInstallment;
use App\Models\RecurringItem;
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
        $start = CarbonImmutable::createFromFormat('Y-m-d', $month.'-01')->startOfDay();
        $end = $start->endOfMonth();

        $items = $user->recurringItems()->with(['category:id,name,color', 'account:id,name', 'toAccount:id,name,color'])->orderBy('id')->get();
        // Biaya tetap + isi Dompet Tujuan (type transfer) yang berlaku di bulan ini
        $expenses = $items->whereIn('type', ['expense', 'transfer'])->filter(fn (RecurringItem $i) => $i->activeIn($month))->values();

        $payments = $user->transactions()
            ->whereIn('recurring_item_id', $expenses->pluck('id'))
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->with('account:id,name')
            ->orderBy('date')
            ->get()
            ->groupBy('recurring_item_id');

        $bills = $expenses->map(fn (RecurringItem $i) => [
            'source' => $i->type === 'transfer' ? 'pocket' : 'recurring',
            'id' => $i->id,
            'name' => $i->name,
            'amount' => $i->amount,
            'due_day' => $i->due_day,
            'category' => $i->type === 'transfer' && $i->toAccount
                ? ['id' => null, 'name' => "Dompet {$i->toAccount->name}", 'color' => $i->toAccount->color]
                : $i->category,
            'from_account_id' => $i->account_id,
            'to_account' => $i->toAccount?->name,
            'to_account_id' => $i->to_account_id,
            'paid' => (int) ($payments[$i->id] ?? collect())->sum('amount'),
            'payments' => ($payments[$i->id] ?? collect())->map(fn ($t) => [
                'id' => $t->id,
                'date' => $t->date->toDateString(),
                'amount' => $t->amount,
                'account' => $t->account?->name,
            ])->values(),
        ]);

        // Cicilan utang berjadwal (mobil, rumah, dll) di bulan ini ikut jadi biaya tetap; bayar → tandai cicilan lunas
        $installments = DebtInstallment::query()
            ->whereIn('debt_id', $user->debts()->select('id'))
            ->where('period', $start->toDateString())
            ->with(['debt:id,name,kind', 'transactions.account:id,name'])
            ->get();
        $debtCategory = Category::system($user, 'debt_installment')->only(['id', 'name', 'color']);

        $bills = $bills->concat($installments->map(fn (DebtInstallment $i) => [
            'source' => 'debt',
            'id' => $i->id,
            'debt_id' => $i->debt_id,
            'name' => $i->debt->name,
            'amount' => $i->amount,
            'due_day' => $i->due_date->day,
            'category' => $debtCategory,
            'paid' => $i->paid_at ? max($i->amount, (int) $i->transactions->sum('amount')) : (int) $i->transactions->sum('amount'),
            'payments' => $i->transactions->sortBy('date')->map(fn ($t) => [
                'id' => $t->id,
                'date' => $t->date->toDateString(),
                'amount' => $t->amount,
                'account' => $t->account?->name,
            ])->values(),
        ]))->sortBy(fn ($b) => $b['due_day'] ?? 32)->values();

        // Baris dari skenario aktif untuk bulan yang sama (read-only). Cicilan yang sudah tampil
        // sebagai tagihan dari menu Utang tidak diulang agar tidak terhitung dua kali.
        $shownKinds = $installments->pluck('debt.kind')->unique();
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
