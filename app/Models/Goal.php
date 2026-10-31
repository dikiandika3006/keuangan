<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Goal extends Model
{
    use LogsActivity;

    protected $fillable = ['name', 'target_amount', 'current_amount', 'account_id', 'asset_id', 'target_date', 'priority', 'color'];

    protected function casts(): array
    {
        return ['target_amount' => 'integer', 'current_amount' => 'integer', 'target_date' => 'date:Y-m-d', 'priority' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }
}
