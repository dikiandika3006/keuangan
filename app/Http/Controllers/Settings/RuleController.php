<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\Rule as AutoRule;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Aturan otomatis: kata kunci di catatan → kategori, rekening, dan tautan Biaya Bulanan. */
class RuleController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('settings/rules', [
            'rules' => $user->rules()->with(['category:id,name,color,type', 'account:id,name', 'recurringItem:id,name'])->orderBy('keyword')->get(),
            'recurringItems' => $user->recurringItems()->where('type', 'expense')->orderBy('name')->get(['id', 'name']),
            'tags' => $user->tags()->withCount('transactions')->orderBy('name')->get(['id', 'name', 'color']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->user()->rules()->create($this->validated($request));

        return back()->with('success', __('Aturan ditambahkan.'));
    }

    public function update(Request $request, AutoRule $rule): RedirectResponse
    {
        abort_unless($rule->user_id === $request->user()->id, 403);
        $rule->update($this->validated($request, $rule));

        return back()->with('success', __('Aturan diperbarui.'));
    }

    public function destroy(Request $request, AutoRule $rule): RedirectResponse
    {
        abort_unless($rule->user_id === $request->user()->id, 403);
        $rule->delete();

        return back()->with('success', __('Aturan dihapus.'));
    }

    private function validated(Request $request, ?AutoRule $rule = null): array
    {
        $userId = $request->user()->id;

        return $request->validate([
            'keyword' => ['required', 'string', 'min:2', 'max:100', Rule::unique('rules')->where('user_id', $userId)->ignore($rule?->id)],
            'category_id' => ['required', Rule::exists('categories', 'id')->where('user_id', $userId)],
            'account_id' => ['nullable', Rule::exists('accounts', 'id')->where('user_id', $userId)],
            'recurring_item_id' => ['nullable', Rule::exists('recurring_items', 'id')->where('user_id', $userId)],
        ]);
    }
}
