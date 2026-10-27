<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DebtInstallment extends Model
{
    protected $fillable = ['period', 'due_date', 'amount', 'paid_at'];

    protected function casts(): array
    {
        return ['period' => 'date:Y-m-d', 'due_date' => 'date:Y-m-d', 'paid_at' => 'date:Y-m-d', 'amount' => 'integer'];
    }

    public function debt(): BelongsTo
    {
        return $this->belongsTo(Debt::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /** paid, late (lewat jatuh tempo, BR-06), pending */
    public function status(): string
    {
        if ($this->paid_at) {
            return 'paid';
        }

        return $this->due_date->lt(today()) ? 'late' : 'pending';
    }
}
