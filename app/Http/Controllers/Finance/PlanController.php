<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\RecurringItem;
use App\Services\FinanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Rencana & proyeksi keuangan ke depan. Simulasinya dihitung di sisi klien
 * supaya asumsi (kenaikan gaji, inflasi, imbal hasil) bisa diubah langsung.
 */
class PlanController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $finance = new FinanceService($user);

        return Inertia::render('plan/index', [
            'position' => $finance->position(),
            'averages' => $finance->averages(),
            'recurringTotals' => $finance->recurringTotals(),
            'recurringItems' => $user->recurringItems()->whereIn('type', ['income', 'expense'])->orderBy('type')->orderByDesc('amount')->get(),
            'goals' => $user->goals()->orderBy('priority')->orderBy('target_date')->get(),
            'debts' => $user->debts()->where('remaining_amount', '>', 0)->get(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->user()->recurringItems()->create($this->validated($request));

        return back()->with('success', 'Item rutin ditambahkan.');
    }

    public function update(Request $request, RecurringItem $recurringItem): RedirectResponse
    {
        $this->ensureOwner($recurringItem);
        $recurringItem->update($this->validated($request));

        return back()->with('success', 'Item rutin diperbarui.');
    }

    public function destroy(RecurringItem $recurringItem): RedirectResponse
    {
        $this->ensureOwner($recurringItem);
        $recurringItem->delete();

        return back()->with('success', 'Item rutin dihapus.');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:income,expense'],
            'amount' => ['required', 'integer', 'min:1'],
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $request->user()->id)],
            'due_day' => ['nullable', 'integer', 'between:1,31'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', Rule::when($request->filled('start_date'), 'after_or_equal:start_date')],
        ]);
    }
}
