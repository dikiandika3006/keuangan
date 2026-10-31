<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\EmploymentStatus;
use App\Models\Scenario;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Proyeksi 26 bulan per skenario, perbandingan skenario, rencana vs aktual (PRJ-01 s/d PRJ-06),
 * sekaligus status kerja (JOB-05).
 */
class ProjectionController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        ProjectionService::ensureScenarios($user);
        $projection = new ProjectionService($user, new FinanceService($user));

        $scenarios = $user->scenarios()->orderByDesc('is_active')->orderBy('id')->get();
        $selected = $scenarios->firstWhere('id', $request->integer('scenario')) ?? $scenarios->first();

        return Inertia::render('projection/index', [
            'scenarios' => $scenarios,
            'selectedId' => $selected->id,
            'projection' => $projection->project($selected),
            // PRJ-03: saldo kas semua skenario untuk dibandingkan dalam satu grafik
            'comparison' => $scenarios->map(fn (Scenario $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'balances' => collect($projection->project($s)['rows'])->pluck('balance', 'label'),
            ]),
            'defaults' => ProjectionService::DEFAULTS,
            'recurringItems' => $user->recurringItems()->whereIn('type', ['income', 'expense'])->orderBy('type')->orderBy('id')->get(),
            'employment' => $user->employmentStatuses()->limit(10)->get(),
            // Untuk dialog Realisasi pemasukan bulan berjalan
            'accounts' => $user->accounts()->where('is_archived', false)->orderBy('name')->get(['id', 'name']),
            'incomeCategories' => $user->categories()->where('type', 'income')->orderBy('name')->get(['id', 'name']),
            'unlinkedIncomes' => $user->transactions()->where('type', 'income')
                ->whereBetween('date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                ->whereNull('plan_key')->whereNull('recurring_item_id')->whereNull('receivable_schedule_id')
                ->with('category:id,name')->orderByDesc('date')->get(['id', 'amount', 'date', 'note', 'category_id']),
        ]);
    }

    /**
     * Realisasi satu baris pemasukan bulan berjalan: catat pemasukan baru, atau tautkan pemasukan yang sudah
     * dicatat, supaya Proyeksi memakai angka aktualnya dan tidak menghitung rencananya lagi.
     */
    public function realize(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'key' => ['required', 'string', 'regex:/^(salary|plastic|djitu|jht|recurring:\d+)$/'],
            'transaction_id' => ['nullable', Rule::exists('transactions', 'id')->where('user_id', $user->id)->where('type', 'income')],
            'amount' => ['required_without:transaction_id', 'nullable', 'integer', 'min:1'],
            'date' => ['required_without:transaction_id', 'nullable', 'date'],
            'account_id' => ['required_without:transaction_id', 'nullable', Rule::exists('accounts', 'id')->where('user_id', $user->id)],
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $user->id)->where('type', 'income')],
        ]);

        $item = null;
        if (str_starts_with($data['key'], 'recurring:')) {
            $item = $user->recurringItems()->where('type', 'income')->findOrFail((int) substr($data['key'], 10));
        }
        $link = $item ? ['recurring_item_id' => $item->id] : ['plan_key' => $data['key']];
        $label = $item?->name ?? __(ProjectionService::PLAN_INCOME[$data['key']]);

        if (! empty($data['transaction_id'])) {
            $user->transactions()->findOrFail($data['transaction_id'])->update($link);
        } else {
            $user->transactions()->create([
                ...$link,
                'type' => 'income',
                'account_id' => $data['account_id'],
                'category_id' => $data['category_id'] ?? $item?->category_id ?? Category::system($user, 'unspecified_income')->id,
                'amount' => $data['amount'],
                'date' => $data['date'],
                'note' => $label,
            ]);
        }

        return back()->with('success', __('Realisasi :name dicatat.', ['name' => $label]));
    }

    /** Lepas tautan realisasi bulan berjalan (transaksinya tetap ada sebagai pemasukan biasa). */
    public function unrealize(Request $request): RedirectResponse
    {
        $data = $request->validate(['key' => ['required', 'string', 'regex:/^(salary|plastic|djitu|jht|recurring:\d+)$/']]);
        $query = $request->user()->transactions()->where('type', 'income')
            ->whereBetween('date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()]);
        str_starts_with($data['key'], 'recurring:')
            ? $query->where('recurring_item_id', (int) substr($data['key'], 10))->update(['recurring_item_id' => null])
            : $query->where('plan_key', $data['key'])->update(['plan_key' => null]);

        return back()->with('success', __('Tautan realisasi dilepas.'));
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:50'], 'copy_from' => ['nullable', 'integer']]);
        $source = $request->user()->scenarios()->find($data['copy_from'] ?? 0) ?? (new ProjectionService($request->user(), new FinanceService($request->user())))->activeScenario();

        $scenario = $request->user()->scenarios()->create([
            'name' => $data['name'],
            'is_active' => false,
            'start_month' => $source?->start_month ?? now()->startOfMonth()->addMonth()->toDateString(),
            'months' => $source?->months ?? 26,
            'assumptions' => $source?->assumptions ?? ProjectionService::DEFAULTS,
        ]);

        return redirect()->route('projection.index', ['scenario' => $scenario->id])->with('success', __('Skenario dibuat.'));
    }

    public function update(Request $request, Scenario $scenario): RedirectResponse
    {
        $this->ensureOwner($scenario);
        $money = ['nullable', 'integer', 'min:0'];
        $month = ['nullable', 'date_format:Y-m'];
        $data = $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'start_month' => ['required', 'date_format:Y-m'],
            'months' => ['required', 'integer', 'between:6,60'],
            'assumptions.salary' => $money,
            'assumptions.last_salary_month' => $month,
            'assumptions.rehire_month' => $month,
            'assumptions.new_salary' => $money,
            'assumptions.plastic_income' => $money,
            'assumptions.djitu_income' => $money,
            'assumptions.friend_principal' => $money,
            'assumptions.friend_interest_pct' => ['nullable', 'numeric', 'between:0,100'],
            'assumptions.friend_withdraw_during_car' => $money,
            'assumptions.friend_withdraw_after_car' => $money,
            'assumptions.jht_amount' => $money,
            'assumptions.jht_month' => $month,
            'assumptions.car_installment' => $money,
            'assumptions.car_last_month' => $month,
            'assumptions.house_installment' => $money,
            'assumptions.house_last_month' => $month,
            'assumptions.school_fee' => $money,
            'assumptions.school_start_month' => $month,
            'assumptions.groceries' => $money,
            'assumptions.pelagic_deposit' => $money,
            'assumptions.other_expense' => $money,
            'assumptions.emergency_target' => $money,
        ]);

        $assumptions = collect($data['assumptions'] ?? [])
            ->map(fn ($v, $k) => $v ?? (is_int(ProjectionService::DEFAULTS[$k] ?? null) ? 0 : null))
            ->all();

        $scenario->update([
            'name' => $data['name'],
            'start_month' => $data['start_month'].'-01',
            'months' => $data['months'],
            'assumptions' => [...ProjectionService::DEFAULTS, ...$assumptions],
        ]);

        return back()->with('success', __('Skenario disimpan.'));
    }

    public function activate(Request $request, Scenario $scenario): RedirectResponse
    {
        $this->ensureOwner($scenario);
        $request->user()->scenarios()->update(['is_active' => false]);
        $scenario->update(['is_active' => true]);

        return back()->with('success', __('Skenario :name dipakai di dashboard.', ['name' => $scenario->name]));
    }

    public function destroy(Request $request, Scenario $scenario): RedirectResponse
    {
        $this->ensureOwner($scenario);
        abort_if($request->user()->scenarios()->count() <= 1, 422, 'Minimal harus ada satu skenario.');
        $scenario->delete();

        if (! $request->user()->scenarios()->where('is_active', true)->exists()) {
            $request->user()->scenarios()->first()?->update(['is_active' => true]);
        }

        return redirect()->route('projection.index')->with('success', __('Skenario dihapus.'));
    }

    public function storeEmployment(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:employed,unemployed'],
            'since' => ['required', 'date'],
            'employer' => ['nullable', 'string', 'max:100'],
            'salary' => ['nullable', 'integer', 'min:0'],
        ]);
        $request->user()->employmentStatuses()->create($data);

        return back()->with('success', __('Status kerja disimpan.'));
    }

    public function destroyEmployment(EmploymentStatus $employmentStatus): RedirectResponse
    {
        $this->ensureOwner($employmentStatus);
        $employmentStatus->delete();

        return back()->with('success', __('Status kerja dihapus.'));
    }
}
