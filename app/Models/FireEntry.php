<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FireEntry extends Model
{
    protected $fillable = ['month', 'deposit', 'balance'];

    protected function casts(): array
    {
        return ['deposit' => 'integer', 'balance' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
