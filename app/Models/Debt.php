<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Debt extends Model
{
    use LogsActivity;

    public const KINDS = ['car', 'house', 'credit_card', 'paylater', 'personal', 'other'];

    protected $fillable = ['name', 'lender', 'kind', 'total_amount', 'remaining_amount', 'monthly_payment', 'interest_rate', 'due_day', 'start_month', 'tenor_months'];

    protected function casts(): array
    {
        return [
            'total_amount' => 'integer',
            'remaining_amount' => 'integer',
            'monthly_payment' => 'integer',
            'interest_rate' => 'float',
            'due_day' => 'integer',
            'start_month' => 'date:Y-m-d',
            'tenor_months' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function installments(): HasMany
    {
        return $this->hasMany(DebtInstallment::class)->orderBy('period');
    }

    /**
     * Perkiraan porsi bunga dari satu kali bayar, dari bunga % per tahun. Utang berjadwal memakai rumus anuitas
     * (sisa pokok = nilai kini sisa cicilan); utang tanpa jadwal = sisa utang × bunga per bulan.
     * Bunga 0% → null (tidak diketahui), cicilan dicatat utuh seperti biasa.
     */
    public function interestEstimate(): ?int
    {
        $rate = (float) $this->interest_rate / 1200;
        if ($rate <= 0) {
            return null;
        }

        if ($this->hasSchedule()) {
            $left = $this->installments()->whereNull('paid_at')->count();
            $principal = $left > 0 ? $this->monthly_payment * (1 - (1 + $rate) ** -$left) / $rate : 0;

            return (int) round($principal * $rate);
        }

        return (int) round($this->remaining_amount * $rate);
    }

    public function hasSchedule(): bool
    {
        return $this->start_month !== null && $this->tenor_months > 0;
    }

    /**
     * Susun jadwal cicilan dari start_month sebanyak tenor_months (DEBT-02).
     * Cicilan yang sudah dibayar tidak diubah.
     */
    public function syncSchedule(): void
    {
        if (! $this->hasSchedule()) {
            $this->installments()->whereNull('paid_at')->delete();

            return;
        }

        $start = CarbonImmutable::parse($this->start_month)->startOfMonth();
        $periods = [];
        for ($i = 0; $i < $this->tenor_months; $i++) {
            $period = $start->addMonths($i);
            $periods[] = $period->toDateString();
            $installment = $this->installments()->firstOrNew(['period' => $period->toDateString()]);
            if ($installment->paid_at) {
                continue;
            }
            $installment->fill([
                'due_date' => $period->day(min($this->due_day ?: 1, $period->daysInMonth))->toDateString(),
                'amount' => $this->monthly_payment,
            ])->save();
        }

        $this->installments()->whereNotIn('period', $periods)->whereNull('paid_at')->delete();
        $this->refreshFromInstallments();
    }

    /**
     * Status lunas cicilan mengikuti transaksi bertaut; sisa utang = total cicilan belum dibayar (BR-05).
     */
    public function refreshFromInstallments(): void
    {
        if (! $this->hasSchedule()) {
            return;
        }

        foreach ($this->installments()->withMax('transactions', 'date')->get() as $installment) {
            $paidAt = $installment->transactions_max_date ? substr($installment->transactions_max_date, 0, 10) : null;
            if ($installment->paid_at?->toDateString() !== $paidAt) {
                $installment->update(['paid_at' => $paidAt]);
            }
        }

        $this->update(['remaining_amount' => (int) $this->installments()->whereNull('paid_at')->sum('amount')]);
    }
}
