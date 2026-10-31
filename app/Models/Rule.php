<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Aturan otomatis: catatan yang mengandung kata kunci → kategori (dan rekening / biaya bulanan) tertentu.
 */
class Rule extends Model
{
    use LogsActivity;

    protected $fillable = ['keyword', 'category_id', 'account_id', 'recurring_item_id'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function recurringItem(): BelongsTo
    {
        return $this->belongsTo(RecurringItem::class);
    }

    public function activitySummary(): string
    {
        return $this->keyword;
    }

    /** Aturan pertama yang kata kuncinya ada di catatan (kata kunci terpanjang menang). */
    public static function match(Collection $rules, ?string $note): ?self
    {
        $note = Str::lower((string) $note);
        if ($note === '') {
            return null;
        }

        return $rules->sortByDesc(fn (self $r) => mb_strlen($r->keyword))
            ->first(fn (self $r) => str_contains($note, Str::lower($r->keyword)));
    }
}
