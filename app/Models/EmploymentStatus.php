<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmploymentStatus extends Model
{
    protected $fillable = ['status', 'since', 'employer', 'salary'];

    protected function casts(): array
    {
        return ['since' => 'date:Y-m-d', 'salary' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
