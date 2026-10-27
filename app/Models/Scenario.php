<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Scenario extends Model
{
    protected $fillable = ['name', 'is_active', 'start_month', 'months', 'assumptions'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'start_month' => 'date:Y-m-d', 'months' => 'integer', 'assumptions' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
