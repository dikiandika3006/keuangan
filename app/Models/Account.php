<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Account extends Model
{
    protected $fillable = ['name', 'type', 'initial_balance', 'color', 'is_emergency_fund', 'is_archived', 'last_reconciled_at', 'last_reconciled_balance'];

    protected function casts(): array
    {
        return [
            'initial_balance' => 'integer',
            'is_emergency_fund' => 'boolean',
            'is_archived' => 'boolean',
            'last_reconciled_at' => 'date:Y-m-d',
            'last_reconciled_balance' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Isi rutin bulanan untuk Dompet Tujuan (type 'pocket'). */
    public function allocation(): HasOne
    {
        return $this->hasOne(RecurringItem::class, 'to_account_id')->where('type', 'transfer');
    }
}
