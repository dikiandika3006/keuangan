<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\EmploymentStatus;
use App\Models\Scenario;
use App\Services\FinanceService;
use App\Services\ProjectionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
        ]);
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
