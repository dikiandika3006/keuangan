<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecurringItem extends Model
{
    protected $fillable = ['name', 'type', 'category_id', 'account_id', 'to_account_id', 'amount', 'due_day', 'start_date', 'end_date', 'end_confirmed_at'];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'due_day' => 'integer',
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'end_confirmed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Tanggal selesai diubah → konfirmasi lama tidak berlaku lagi
        static::saving(function (RecurringItem $item) {
            if ($item->isDirty('end_date') && ! $item->isDirty('end_confirmed_at')) {
                $item->end_confirmed_at = null;
            }
        });
    }

    /**
     * Item berbatas waktu yang berakhir paling lambat bulan depan dan belum dikonfirmasi
     * (diperpanjang atau memang selesai).
     */
    public function scopeEndingSoon(Builder $query): Builder
    {
        return $query->whereNotNull('end_date')
            ->whereNull('end_confirmed_at')
            ->where('end_date', '<=', now()->addMonthNoOverflow()->endOfMonth()->toDateString());
    }

    /** Apakah item berlaku di bulan tertentu ('Y-m'). Tanggal kosong = tanpa batas. */
    public function activeIn(string $month): bool
    {
        return ($this->start_date === null || $this->start_date->format('Y-m') <= $month)
            && ($this->end_date === null || $this->end_date->format('Y-m') >= $month);
    }

    /** Rekening sumber isi dompet (khusus type transfer). */
    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    /** Dompet Tujuan yang diisi (khusus type transfer). */
    public function toAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'to_account_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
