<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Receivable;
use App\Models\ReceivableSchedule;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Piutang: dana milik pengguna di pihak lain yang dikembalikan bertahap + bunga (RCV-01 s/d RCV-05).
 */
class ReceivableController extends Controller
{
    public function index(Request $request): Response
    {
        $receivables = $request->user()->receivables()->orderBy('counterparty')->get()->map(function (Receivable $r) {
            $r->syncSchedule();

            return [
                ...$r->toArray(),
                'remaining' => $r->remainingPrincipal(),
                // Riwayat uang masuk (bunga & tarikan pokok) terbaru
                // Riwayat uang masuk (bunga & tarikan pokok) dan uang keluar (dana awal & tambah pokok)
                'history' => Transaction::query()
                    ->where(fn ($q) => $q->whereIn('receivable_schedule_id', $r->schedules()->select('id'))->orWhere('receivable_id', $r->id))
                    ->with(['account:id,name', 'category:id,system_key'])
                    ->latest('date')->latest('id')->limit(10)
                    ->get()
                    ->map(fn (Transaction $t) => [
                        'id' => $t->id,
                        'date' => $t->date->toDateString(),
                        'amount' => $t->amount,
                        'kind' => match ($t->category?->system_key) {
                            'receivable_interest' => 'interest',
                            'receivable_out' => 'out',
                            'receivable_topup' => 'topup',
                            default => 'principal',
                        },
                        'account' => $t->account?->name,
                    ]),
                'topped_up' => (int) $r->topupsByMonth()->sum(),
                'schedules' => $r->schedules()->get()->map(function (ReceivableSchedule $s) {
                    $received = $s->received();

                    return [
                        ...$s->toArray(),
                        'interest_received' => $received['interest'],
                        'principal_received' => $received['principal'],
                        'status' => $s->status($received),
                    ];
                }),
            ];
        });

        return Inertia::render('receivables/index', ['receivables' => $receivables]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        // Opsional: dana diambil dari rekening → saldo rekening berkurang, tanpa tercatat sebagai pengeluaran
        $funding = $request->validate([
            'account_id' => ['nullable', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'funded_date' => ['nullable', 'date', 'before_or_equal:today'],
        ]);

        DB::transaction(function () use ($request, $user, $funding) {
            $receivable = $user->receivables()->create($this->validated($request));
            if (! empty($funding['account_id'])) {
                $user->transactions()->create([
                    'type' => 'expense',
                    'account_id' => $funding['account_id'],
                    'category_id' => Category::system($user, 'receivable_out')->id,
                    'amount' => $receivable->principal,
                    'date' => $funding['funded_date'] ?? min(now()->toDateString(), $receivable->start_month->toDateString()),
                    'note' => "Dana ke {$receivable->counterparty}",
                    'receivable_id' => $receivable->id,
                ]);
            }
            $receivable->syncSchedule();
        });

        return back()->with('success', __('Piutang ditambahkan.'));
    }

    /** Tambah pokok: uang dari rekening ditambahkan ke dana di pihak lain; bunga bulan berikutnya ikut naik. */
    public function topup(Request $request, Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $user = $request->user();
        $data = $request->validate([
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'amount' => ['required', 'integer', 'min:1'],
            'date' => ['required', 'date', 'before_or_equal:today'],
        ]);

        DB::transaction(function () use ($user, $receivable, $data) {
            $user->transactions()->create([
                'type' => 'expense',
                'account_id' => $data['account_id'],
                'category_id' => Category::system($user, 'receivable_topup')->id,
                'amount' => $data['amount'],
                'date' => $data['date'],
                'note' => "Tambah pokok {$receivable->counterparty}",
                'receivable_id' => $receivable->id,
            ]);
            $receivable->syncSchedule();
        });

        return back()->with('success', __('Pokok ditambah :amount.', ['amount' => 'Rp'.number_format($data['amount'], 0, ',', '.')]));
    }

    public function update(Request $request, Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $receivable->update($this->validated($request));
        $receivable->syncSchedule();

        return back()->with('success', __('Piutang diperbarui.'));
    }

    public function destroy(Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $receivable->delete();

        return back()->with('success', __('Piutang dihapus.'));
    }

    /**
     * Catat uang masuk (RCV-03, BR-08), langsung tanpa pengajuan. Mode 'auto': bunga bulan itu dulu, sisanya pokok;
     * mode 'principal': tarikan pokok saja (mis. tarik dana di luar jadwal). Tanpa schedule_id, jadwal dipilih dari
     * bulan tanggal terima. Dicatat sebagai transaksi pemasukan ke rekening pilihan, bertaut jadwal bulan itu.
     */
    public function receive(Request $request, Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $user = $request->user();
        $data = $request->validate([
            'schedule_id' => ['nullable', Rule::exists('receivable_schedules', 'id')->where('receivable_id', $receivable->id)],
            'mode' => ['nullable', 'in:auto,principal'],
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'amount' => ['required', 'integer', 'min:1'],
            'date' => ['required', 'date', 'before_or_equal:today'],
        ]);

        $receivable->syncSchedule();
        $schedule = ! empty($data['schedule_id'])
            ? ReceivableSchedule::findOrFail($data['schedule_id'])
            : $receivable->schedules()->where('period', CarbonImmutable::parse($data['date'])->startOfMonth()->toDateString())->first();
        if (! $schedule) {
            throw ValidationException::withMessages(['date' => __('Tanggal sebelum piutang dimulai (:month).', [
                'month' => $receivable->start_month->locale(app()->getLocale())->translatedFormat('F Y'),
            ])]);
        }

        $received = $schedule->received();
        $interest = ($data['mode'] ?? 'auto') === 'principal' ? 0 : min($data['amount'], max(0, $schedule->interest_due - $received['interest']));
        $principal = $data['amount'] - $interest;
        if ($principal > $receivable->remainingPrincipal()) {
            throw ValidationException::withMessages(['amount' => __('Pokok :amount melebihi sisa pokok :remaining.', [
                'amount' => 'Rp'.number_format($principal, 0, ',', '.'),
                'remaining' => 'Rp'.number_format($receivable->remainingPrincipal(), 0, ',', '.'),
            ])]);
        }
        $month = $schedule->period->locale(app()->getLocale())->translatedFormat('M Y');

        DB::transaction(function () use ($user, $data, $schedule, $interest, $principal, $receivable, $month) {
            foreach (['receivable_interest' => $interest, 'receivable_principal' => $principal] as $key => $amount) {
                if ($amount <= 0) {
                    continue;
                }
                $user->transactions()->create([
                    'type' => 'income',
                    'account_id' => $data['account_id'],
                    'category_id' => Category::system($user, $key)->id,
                    'amount' => $amount,
                    'date' => $data['date'],
                    'note' => ($key === 'receivable_interest' ? 'Bunga' : 'Pokok')." {$receivable->counterparty} {$month}",
                    'receivable_schedule_id' => $schedule->id,
                ]);
            }
            $receivable->syncSchedule();
        });

        return back()->with('success', __('Diterima: bunga :interest + pokok :principal.', ['interest' => 'Rp'.number_format($interest, 0, ',', '.'), 'principal' => 'Rp'.number_format($principal, 0, ',', '.')]));
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'counterparty' => ['required', 'string', 'max:100'],
            'principal' => ['required', 'integer', 'min:1'],
            'interest_pct' => ['required', 'numeric', 'between:0,100'],
            'withdrawal' => ['required', 'integer', 'min:0'],
            'withdrawal_change_month' => ['nullable', 'date_format:Y-m'],
            'withdrawal_after' => ['nullable', 'integer', 'min:0'],
            'due_day' => ['required', 'integer', 'between:1,31'],
            'start_month' => ['required', 'date_format:Y-m'],
            'agreement_url' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        // Perubahan tarikan harus setelah bulan mulai; kalau sejak awal, cukup ubah "Tarik pokok per bulan"
        if (! empty($data['withdrawal_change_month']) && $data['withdrawal_change_month'] <= $data['start_month']) {
            throw ValidationException::withMessages(['withdrawal_change_month' => __('Bulan perubahan tarikan harus setelah bulan mulai.')]);
        }

        $data['start_month'] .= '-01';
        // Perubahan tarikan hanya berlaku bila bulan dan nominal pengganti sama-sama diisi
        $changes = ! empty($data['withdrawal_change_month']) && ($data['withdrawal_after'] ?? null) !== null;
        $data['withdrawal_change_month'] = $changes ? $data['withdrawal_change_month'].'-01' : null;
        $data['withdrawal_after'] = $changes ? $data['withdrawal_after'] : null;

        return $data;
    }
}
