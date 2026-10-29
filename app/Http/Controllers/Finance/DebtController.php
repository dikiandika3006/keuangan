<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Debt;
use App\Models\DebtInstallment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DebtController extends Controller
{
    public function index(Request $request): Response
    {
        $debts = $request->user()->debts()->with('installments')->orderByDesc('remaining_amount')->get()
            ->map(fn (Debt $d) => [
                ...$d->toArray(),
                'installments' => $d->installments->map(fn (DebtInstallment $i) => [...$i->toArray(), 'status' => $i->status()]),
            ]);

        return Inertia::render('debts/index', ['debts' => $debts]);
    }

    public function store(Request $request): RedirectResponse
    {
        $debt = $request->user()->debts()->create($this->validated($request));
        $debt->syncSchedule();

        return back()->with('success', __('Utang ditambahkan.'));
    }

    public function update(Request $request, Debt $debt): RedirectResponse
    {
        $this->ensureOwner($debt);
        $debt->update($this->validated($request));
        $debt->syncSchedule();

        return back()->with('success', __('Utang diperbarui.'));
    }

    /**
     * Bayar cicilan (DEBT-03). Utang berjadwal: cicilan terlama yang belum dibayar ditandai lunas lewat
     * transaksi pengeluaran bertaut. Utang tanpa jadwal: sisa dikurangi, transaksi dibuat bila rekening dipilih.
     */
    public function pay(Request $request, Debt $debt): RedirectResponse
    {
        $this->ensureOwner($debt);
        $user = $request->user();
        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:1'],
            'account_id' => [Rule::requiredIf($debt->hasSchedule()), 'nullable', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'date' => ['nullable', 'date'],
            'installment_id' => ['nullable', Rule::exists('debt_installments', 'id')->where('debt_id', $debt->id)],
        ]);

        DB::transaction(function () use ($user, $debt, $data) {
            $installment = $debt->hasSchedule()
                ? ($data['installment_id'] ?? null ? DebtInstallment::find($data['installment_id']) : $debt->installments()->whereNull('paid_at')->first())
                : null;
            abort_if($debt->hasSchedule() && ! $installment, 422, 'Semua cicilan sudah lunas.');

            if (! empty($data['account_id'])) {
                $user->transactions()->create([
                    'type' => 'expense',
                    'account_id' => $data['account_id'],
                    'category_id' => Category::system($user, 'debt_installment')->id,
                    'amount' => $data['amount'],
                    'date' => $data['date'] ?? now()->toDateString(),
                    'note' => $installment ? "Cicilan {$debt->name} ".$installment->period->locale(app()->getLocale())->translatedFormat('M Y') : "Bayar {$debt->name}",
                    'debt_installment_id' => $installment?->id,
                ]);
            }

            if (! $installment) {
                $debt->update(['remaining_amount' => max(0, $debt->remaining_amount - $data['amount'])]);
            }
        });

        return back()->with('success', __('Pembayaran dicatat.'));
    }

    public function destroy(Debt $debt): RedirectResponse
    {
        $this->ensureOwner($debt);
        $debt->delete();

        return back()->with('success', __('Utang dihapus.'));
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'lender' => ['nullable', 'string', 'max:100'],
            'kind' => ['nullable', Rule::in(Debt::KINDS)],
            'total_amount' => ['required', 'integer', 'min:1'],
            'remaining_amount' => ['required', 'integer', 'min:0', 'lte:total_amount'],
            'monthly_payment' => ['required', 'integer', 'min:0'],
            'interest_rate' => ['required', 'numeric', 'between:0,100'],
            'due_day' => ['nullable', 'integer', 'between:1,31'],
            'start_month' => ['nullable', 'date_format:Y-m'],
            'tenor_months' => ['nullable', 'integer', 'between:1,600'],
        ]);

        $data['kind'] ??= 'other';
        $data['start_month'] = ! empty($data['start_month']) ? $data['start_month'].'-01' : null;

        return $data;
    }
}
