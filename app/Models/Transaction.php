<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class Transaction extends Model
{
    use LogsActivity;

    protected $fillable = [
        'account_id', 'to_account_id', 'category_id', 'type', 'amount', 'date', 'note', 'source',
        'debt_installment_id', 'receivable_schedule_id', 'asset_id', 'recurring_item_id',
        'attachment_path', 'attachment_name', 'attachment_mime', 'attachment_size', 'split_group', 'import_hash',
    ];

    // Lokasi file tidak dikirim ke browser; bukti dibuka lewat route yang mengecek pemilik
    protected $hidden = ['attachment_path'];

    protected $appends = ['attachment_url'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'date' => 'date:Y-m-d', 'attachment_size' => 'integer'];
    }

    protected function attachmentUrl(): Attribute
    {
        return Attribute::get(fn () => $this->attributes['attachment_path'] ?? null
            ? route('transactions.attachment', $this->id)
            : null);
    }

    /** Simpan bukti baru (menggantikan yang lama) di disk privat. */
    public function attachFile(UploadedFile $file): void
    {
        $this->deleteAttachment();
        $path = $file->store("attachments/{$this->user_id}", 'local');

        $this->forceFill([
            'attachment_path' => $path,
            'attachment_name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'attachment_mime' => $file->getMimeType(),
            'attachment_size' => $file->getSize(),
        ])->save();
    }

    public function deleteAttachment(): void
    {
        if ($this->attachment_path) {
            Storage::disk('local')->delete($this->attachment_path);
            $this->forceFill(['attachment_path' => null, 'attachment_name' => null, 'attachment_mime' => null, 'attachment_size' => null])->save();
        }
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

        static::deleted(function (Transaction $tx) {
            if ($tx->attachment_path) {
                Storage::disk('local')->delete($tx->attachment_path);
            }
        });
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

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class);
    }

    public function activitySummary(): string
    {
        return trim($this->type.' Rp'.number_format($this->amount, 0, ',', '.').' '.($this->note ?? ''));
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    /** Hanya uang milik sendiri: transaksi berkategori titipan (dana lewat) dikecualikan. */
    public function scopeOwnMoney(Builder $query): void
    {
        $query->where(fn ($q) => $q->whereNull('category_id')
            ->orWhereNotIn('category_id', Category::query()->where('type', Category::TITIPAN)->select('id')));
    }

    /** Pemasukan/pengeluaran sebenarnya: tanpa titipan dan tanpa pindahan ke/dari aset & pokok piutang. */
    public function scopeReportable(Builder $query): void
    {
        $query->ownMoney()->where(fn ($q) => $q->whereNull('category_id')
            ->orWhereNotIn('category_id', Category::query()->whereIn('system_key', Category::INTERNAL_MOVES)->select('id')));
    }
}
