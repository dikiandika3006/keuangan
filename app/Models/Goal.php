<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Goal extends Model
{
    protected $fillable = ['name', 'target_amount', 'current_amount', 'target_date', 'priority', 'color'];

    protected function casts(): array
    {
        return ['target_amount' => 'integer', 'current_amount' => 'integer', 'target_date' => 'date:Y-m-d', 'priority' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
