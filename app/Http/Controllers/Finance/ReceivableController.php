<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Receivable;
use App\Models\ReceivableSchedule;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
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
        $request->user()->receivables()->create($this->validated($request))->syncSchedule();

        return back()->with('success', 'Piutang ditambahkan.');
    }

    public function update(Request $request, Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $receivable->update($this->validated($request));
        $receivable->syncSchedule();

        return back()->with('success', 'Piutang diperbarui.');
    }

    public function destroy(Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $receivable->delete();

        return back()->with('success', 'Piutang dihapus.');
    }

    /**
     * Catat uang masuk (RCV-03, BR-08): dialokasikan ke bunga dulu, sisanya ke pokok,
     * dicatat sebagai dua transaksi pemasukan bertaut jadwal bulan itu.
     */
    public function receive(Request $request, Receivable $receivable): RedirectResponse
    {
        $this->ensureOwner($receivable);
        $user = $request->user();
        $data = $request->validate([
            'schedule_id' => ['required', Rule::exists('receivable_schedules', 'id')->where('receivable_id', $receivable->id)],
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('user_id', $user->id)->where(fn ($q) => $q->where('is_archived', false))],
            'amount' => ['required', 'integer', 'min:1'],
            'date' => ['required', 'date'],
        ]);

        $schedule = ReceivableSchedule::findOrFail($data['schedule_id']);
        $received = $schedule->received();
        $interest = min($data['amount'], max(0, $schedule->interest_due - $received['interest']));
        $principal = $data['amount'] - $interest;
        $month = $schedule->period->locale('id')->translatedFormat('M Y');

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

        return back()->with('success', 'Diterima: bunga Rp'.number_format($interest, 0, ',', '.').' + pokok Rp'.number_format($principal, 0, ',', '.').'.');
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

        $data['start_month'] .= '-01';
        $data['withdrawal_change_month'] = ! empty($data['withdrawal_change_month']) ? $data['withdrawal_change_month'].'-01' : null;

        return $data;
    }
}
