<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Asset extends Model
{
    use LogsActivity;

    public const KINDS = ['investment', 'jht', 'business', 'property', 'other'];

    protected $fillable = ['name', 'kind', 'target_value', 'color', 'note'];

    protected function casts(): array
    {
        return ['target_value' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function valuations(): HasMany
    {
        return $this->hasMany(AssetValuation::class)->orderByDesc('date')->orderByDesc('id');
    }

    public function latestValuation(): HasOne
    {
        return $this->hasOne(AssetValuation::class)->ofMany(['date' => 'max', 'id' => 'max']);
    }

    public function currentValue(): int
    {
        return (int) ($this->latestValuation?->value ?? 0);
    }
}
