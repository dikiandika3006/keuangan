<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Goal;
use App\Services\FinanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class GoalController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $finance = new FinanceService($user);
        $avg = $finance->averages();

        return Inertia::render('goals/index', [
            'goals' => $finance->goals(),
            'monthlySurplus' => $avg['income'] - $avg['expense'] - $finance->position()['monthly_debt_payment'],
            'accounts' => $user->accounts()->where('is_archived', false)->orderByRaw("type = 'pocket' desc")->orderBy('name')->get(['id', 'name', 'type']),
            'assets' => $user->assets()->orderBy('name')->get(['id', 'name']),
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
        // Target bertaut mengikuti saldo; tambah dana lewat transfer ke dompetnya / setor ke aset
        abort_if($goal->account_id || $goal->asset_id, 422, 'Target ini mengikuti saldo yang ditautkan.');
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
        $userId = $request->user()->id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'target_amount' => ['required', 'integer', 'min:1'],
            'current_amount' => ['required', 'integer', 'min:0'],
            'account_id' => ['nullable', Rule::exists('accounts', 'id')->where('user_id', $userId)],
            'asset_id' => ['nullable', 'prohibits:account_id', Rule::exists('assets', 'id')->where('user_id', $userId)],
            'target_date' => ['nullable', 'date'],
            'priority' => ['required', 'integer', 'between:1,3'],
            'color' => ['required', 'string', 'max:20'],
        ]);

        return [...$data, 'account_id' => $data['account_id'] ?? null, 'asset_id' => $data['asset_id'] ?? null];
    }
}
