<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Goal;
use App\Services\FinanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GoalController extends Controller
{
    public function index(Request $request): Response
    {
        $finance = new FinanceService($request->user());
        $avg = $finance->averages();

        return Inertia::render('goals/index', [
            'goals' => $request->user()->goals()->orderBy('priority')->orderBy('target_date')->get(),
            'monthlySurplus' => $avg['income'] - $avg['expense'] - $finance->position()['monthly_debt_payment'],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->user()->goals()->create($this->validated($request));

        return back()->with('success', __('Target ditambahkan.'));
    }

    public function update(Request $request, Goal $goal): RedirectResponse
    {
        $this->ensureOwner($goal);
        $goal->update($this->validated($request));

        return back()->with('success', __('Target diperbarui.'));
    }

    public function deposit(Request $request, Goal $goal): RedirectResponse
    {
        $this->ensureOwner($goal);
        $data = $request->validate(['amount' => ['required', 'integer']]);
        $goal->update(['current_amount' => max(0, $goal->current_amount + $data['amount'])]);

        return back()->with('success', __('Progres target diperbarui.'));
    }

    public function destroy(Goal $goal): RedirectResponse
    {
        $this->ensureOwner($goal);
        $goal->delete();

        return back()->with('success', __('Target dihapus.'));
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'target_amount' => ['required', 'integer', 'min:1'],
            'current_amount' => ['required', 'integer', 'min:0'],
            'target_date' => ['nullable', 'date'],
            'priority' => ['required', 'integer', 'between:1,3'],
            'color' => ['required', 'string', 'max:20'],
        ]);
    }
}
