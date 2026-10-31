<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReceivableSchedule extends Model
{
    protected $fillable = ['period', 'due_date', 'interest_due', 'principal_due'];

    protected function casts(): array
    {
        return ['period' => 'date:Y-m-d', 'due_date' => 'date:Y-m-d', 'interest_due' => 'integer', 'principal_due' => 'integer'];
    }

    public function receivable(): BelongsTo
    {
        return $this->belongsTo(Receivable::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /** @return array{interest: int, principal: int} */
    public function received(): array
    {
        $rows = $this->transactions()->join('categories', 'categories.id', '=', 'transactions.category_id')
            ->selectRaw('categories.system_key as k, SUM(transactions.amount) as total')
            ->groupBy('categories.system_key')->pluck('total', 'k');

        return ['interest' => (int) ($rows['receivable_interest'] ?? 0), 'principal' => (int) ($rows['receivable_principal'] ?? 0)];
    }

    /** received, partial, late (H+3 belum lengkap, BR-10), pending */
    public function status(?array $received = null): string
    {
        $received ??= $this->received();
        $got = $received['interest'] + $received['principal'];

        // Bunga & pokok dinilai terpisah: tarikan pokok besar di luar jadwal tidak membuat bunga bulan itu dianggap lunas
        if ($received['interest'] >= $this->interest_due && $received['principal'] >= $this->principal_due) {
            return 'received';
        }
        if ($this->due_date->copy()->addDays(3)->lt(today())) {
            return 'late';
        }

        return $got > 0 ? 'partial' : 'pending';
    }
}
