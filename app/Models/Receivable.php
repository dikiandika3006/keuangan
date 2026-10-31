<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Receivable extends Model
{
    use LogsActivity;

    protected $fillable = ['counterparty', 'principal', 'interest_pct', 'withdrawal', 'withdrawal_change_month', 'withdrawal_after', 'due_day', 'start_month', 'agreement_url', 'note'];

    protected function casts(): array
    {
        return [
            'principal' => 'integer',
            'interest_pct' => 'float',
            'withdrawal' => 'integer',
            'withdrawal_after' => 'integer',
            'withdrawal_change_month' => 'date:Y-m-d',
            'due_day' => 'integer',
            'start_month' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(ReceivableSchedule::class)->orderBy('period');
    }

    /** Pokok yang sudah dikembalikan, dari transaksi kategori Pokok Piutang. */
    public function principalReceived(): int
    {
        return (int) Transaction::query()
            ->whereIn('receivable_schedule_id', $this->schedules()->select('id'))
            ->whereHas('category', fn ($q) => $q->where('system_key', 'receivable_principal'))
            ->sum('amount');
    }

    public function remainingPrincipal(): int
    {
        return max(0, $this->principal - $this->principalReceived());
    }

    /** Tarikan pokok untuk bulan tertentu (RCV-05: bisa berubah mulai bulan tertentu). */
    public function withdrawalFor(CarbonImmutable $period): int
    {
        if ($this->withdrawal_change_month && $period->gte(CarbonImmutable::parse($this->withdrawal_change_month)->startOfMonth())) {
            return (int) ($this->withdrawal_after ?? 0);
        }

        return $this->withdrawal;
    }

    /**
     * Jadwal dari start_month sampai bulan depan (RCV-02). Jadwal yang belum menerima apa pun dihitung ulang:
     * bunga = sisa pokok awal bulan × bunga%, pokok = tarikan (maks. sisa pokok).
     */
    public function syncSchedule(): void
    {
        $start = CarbonImmutable::parse($this->start_month)->startOfMonth();
        $thisMonth = CarbonImmutable::now()->startOfMonth();
        $end = $thisMonth->addMonth();
        $remaining = $this->principal;

        for ($period = $start; $period->lte($end); $period = $period->addMonth()) {
            $schedule = $this->schedules()->firstOrNew(['period' => $period->toDateString()]);
            $received = $schedule->exists ? $schedule->received() : ['interest' => 0, 'principal' => 0];

            if (! $schedule->exists || $received['interest'] + $received['principal'] === 0) {
                $schedule->fill([
                    'due_date' => $period->day(min($this->due_day ?: 1, $period->daysInMonth))->toDateString(),
                    'interest_due' => (int) round($remaining * $this->interest_pct / 100),
                    'principal_due' => min($remaining, $this->withdrawalFor($period)),
                ])->save();
            }

            // Bulan lalu pakai pokok yang benar-benar diterima; bulan berjalan/depan diasumsikan sesuai jadwal
            $remaining -= $period->lt($thisMonth) ? $received['principal'] : max($received['principal'], $schedule->principal_due);
            $remaining = max(0, $remaining);
        }

        $this->schedules()->where('period', '>', $end->toDateString())->whereDoesntHave('transactions')->delete();
    }
}
