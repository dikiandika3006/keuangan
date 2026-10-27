<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Transaction extends Model
{
    protected $fillable = ['account_id', 'to_account_id', 'category_id', 'type', 'amount', 'date', 'note', 'source', 'debt_installment_id', 'receivable_schedule_id', 'asset_id', 'recurring_item_id'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'date' => 'date:Y-m-d'];
    }

    protected static function booted(): void
    {
        // Transaksi bertaut cicilan diubah/dihapus → status cicilan & sisa utang ikut menyesuaikan
        $sync = function (Transaction $tx) {
            $ids = array_filter([$tx->debt_installment_id, $tx->getOriginal('debt_installment_id')]);
            if ($ids) {
                Debt::whereIn('id', DebtInstallment::whereIn('id', $ids)->select('debt_id'))->get()->each->refreshFromInstallments();
            }
        };
        static::saved($sync);
        static::deleted($sync);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function toAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'to_account_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function debtInstallment(): BelongsTo
    {
        return $this->belongsTo(DebtInstallment::class);
    }

    public function receivableSchedule(): BelongsTo
    {
        return $this->belongsTo(ReceivableSchedule::class);
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }
}
