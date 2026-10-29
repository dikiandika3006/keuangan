<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\Category;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Aset non-likuid: Pelagic, JHT, modal usaha, dll (AST-01 s/d AST-05).
 */
class AssetController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $employment = $user->currentEmployment();

        return Inertia::render('assets/index', [
            'assets' => $user->assets()->with(['valuations' => fn ($q) => $q->limit(24)])->orderBy('name')->get()
                ->map(fn (Asset $a) => [...$a->toArray(), 'value' => $a->currentValue()]),
            // AST-04: JHT bisa dicairkan bila sudah ≥ 1 bulan tidak bekerja
            'jhtClaimableFrom' => $employment?->status === 'unemployed' ? $employment->since->copy()->addMonth()->toDateString() : null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $asset = $request->user()->assets()->create($data);
        $asset->valuations()->create(['date' => now()->toDateString(), 'value' => $request->integer('value'), 'note' => 'Nilai awal']);

        return back()->with('success', __('Aset ditambahkan.'));
    }

    public function update(Request $request, Asset $asset): RedirectResponse
    {
        $this->ensureOwner($asset);
        $asset->update($this->validated($request));

        return back()->with('success', __('Aset diperbarui.'));
    }

    public function destroy(Asset $asset): RedirectResponse
    {
        $this->ensureOwner($asset);
        $asset->delete();

        return back()->with('success', __('Aset dihapus.'));
    }

    /** Perbarui nilai aset manual (AST-02). */
    public function valuate(Request $request, Asset $asset): RedirectResponse
    {
        $this->ensureOwner($asset);
        $data = $request->validate([
            'value' => ['required', 'integer', 'min:0'],
            'date' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $asset->valuations()->create($data);

        return back()->with('success', __('Nilai aset diperbarui.'));
    }

    /**
     * Setor ke aset (pengeluaran dari rekening, nilai aset naik) atau cairkan (pemasukan ke rekening, nilai turun) (AST-05).
     */
    public function move(Request $request, Asset $asset): RedirectResponse
    {
        $this->ensureOwner($asset);
        $user = $request->user();
        $data = $request->validate([
            'direction' => ['required', 'in:deposit,withdraw'],
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'amount' => ['required', 'integer', 'min:1'],
            'date' => ['required', 'date'],
        ]);
        $deposit = $data['direction'] === 'deposit';

        DB::transaction(function () use ($user, $asset, $data, $deposit) {
            $user->transactions()->create([
                'type' => $deposit ? 'expense' : 'income',
                'account_id' => $data['account_id'],
                'category_id' => Category::system($user, $deposit ? 'asset_deposit' : 'asset_withdrawal')->id,
                'amount' => $data['amount'],
                'date' => $data['date'],
                'note' => ($deposit ? 'Setor ke ' : 'Pencairan ').$asset->name,
                'asset_id' => $asset->id,
            ]);
            $asset->valuations()->create([
                'date' => $data['date'],
                'value' => max(0, $asset->currentValue() + ($deposit ? $data['amount'] : -$data['amount'])),
                'note' => $deposit ? 'Setoran' : 'Pencairan',
            ]);
        });

        return back()->with('success', $deposit ? __('Setoran dicatat.') : __('Pencairan dicatat.'));
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'kind' => ['required', Rule::in(Asset::KINDS)],
            'target_value' => ['nullable', 'integer', 'min:0'],
            'color' => ['required', 'string', 'max:20'],
            'note' => ['nullable', 'string', 'max:255'],
            'value' => [$request->isMethod('post') ? 'required' : 'nullable', 'integer', 'min:0'],
        ]);
        unset($data['value']);

        return $data;
    }
}
