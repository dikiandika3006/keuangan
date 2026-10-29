<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\FinanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class AccountController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        // Rata-rata pengeluaran mingguan 8 minggu terakhir, untuk peringatan selisih rekonsiliasi besar (BR-23)
        $expense8w = (int) $user->transactions()->where('type', 'expense')->ownMoney()
            ->whereBetween('date', [now()->subWeeks(8)->toDateString(), now()->toDateString()])->sum('amount');

        $allocations = $user->recurringItems()->where('type', 'transfer')->get()->keyBy('to_account_id');

        return Inertia::render('accounts/index', [
            'accounts' => (new FinanceService($user))->accounts()->each(function (Account $a) use ($allocations) {
                $a->allocation = $allocations->get($a->id)?->only(['amount', 'account_id', 'due_day']);
            }),
            'weeklyExpense' => (int) round($expense8w / 8),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $account = $request->user()->accounts()->create(Arr::except($data, self::ALLOCATION_FIELDS));
        $this->syncAllocation($account, $data);

        return back()->with('success', $account->type === 'pocket' ? __('Dompet ditambahkan.') : __('Rekening ditambahkan.'));
    }

    public function update(Request $request, Account $account): RedirectResponse
    {
        $this->ensureOwner($account);
        $data = $this->validated($request, $account);
        $account->update(Arr::except($data, self::ALLOCATION_FIELDS));
        $this->syncAllocation($account, $data);

        return back()->with('success', __('Rekening diperbarui.'));
    }

    private const ALLOCATION_FIELDS = ['monthly_allocation', 'funding_account_id', 'allocation_day'];

    /** Dompet Tujuan: isi rutin bulanan disimpan sebagai item rutin bertipe transfer agar muncul di Biaya Bulanan & proyeksi. */
    private function syncAllocation(Account $account, array $data): void
    {
        $existing = $account->allocation()->first();

        if ($account->type !== 'pocket' || empty($data['monthly_allocation'])) {
            $existing?->delete();

            return;
        }

        $values = [
            'name' => "Isi {$account->name}",
            'amount' => $data['monthly_allocation'],
            'account_id' => $data['funding_account_id'] ?? null,
            'due_day' => $data['allocation_day'] ?? null,
        ];

        $existing
            ? $existing->update($values)
            : $account->user->recurringItems()->create([...$values, 'type' => 'transfer', 'to_account_id' => $account->id]);
    }

    public function destroy(Account $account): RedirectResponse
    {
        $this->ensureOwner($account);
        $account->delete();

        return back()->with('success', __('Rekening dihapus.'));
    }

    public function reconcile(Request $request, Account $account): RedirectResponse
    {
        $this->ensureOwner($account);
        $data = $request->validate([
            'actual_balance' => ['required', 'integer'],
            'date' => ['required', 'date', 'before_or_equal:today'],
        ]);

        $tx = (new FinanceService($request->user()))->reconcile($account, $data['actual_balance'], $data['date']);

        return back()->with('success', $tx
            ? __('Saldo dicocokkan. Selisih :amount dicatat sebagai :type tidak dirinci.', [
                'amount' => 'Rp'.number_format($tx->amount, 0, ',', '.'),
                'type' => $tx->type === 'expense' ? __('pengeluaran') : __('pemasukan'),
            ])
            : __('Saldo sudah cocok.'));
    }

    private function validated(Request $request, ?Account $account = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:bank,cash,ewallet,investment,pocket'],
            'initial_balance' => ['required', 'integer'],
            'color' => ['required', 'string', 'max:20'],
            'is_emergency_fund' => ['boolean'],
            'is_archived' => ['boolean'],
            'monthly_allocation' => ['nullable', 'integer', 'min:0'],
            'funding_account_id' => [
                'nullable',
                Rule::exists('accounts', 'id')->where('user_id', $request->user()->id),
                Rule::notIn(array_filter([$account?->id])),
            ],
            'allocation_day' => ['nullable', 'integer', 'between:1,31'],
        ]);
    }
}
