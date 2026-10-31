<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Category extends Model
{
    use LogsActivity;

    /** Kategori yang dipakai otomatis oleh sistem: key => [nama, tipe, warna]. */
    public const SYSTEM = [
        'unspecified_expense' => ['Pengeluaran Tidak Dirinci', 'expense', '#94a3b8'],
        'unspecified_income' => ['Pemasukan Tidak Dirinci', 'income', '#94a3b8'],
        'receivable_interest' => ['Bunga Piutang', 'income', '#0ea5e9'],
        'receivable_principal' => ['Pokok Piutang', 'income', '#6366f1'],
        'receivable_out' => ['Dana ke Piutang', 'expense', '#6366f1'],
        'receivable_topup' => ['Tambah Pokok Piutang', 'expense', '#818cf8'],
        'debt_installment' => ['Cicilan / Utang', 'expense', '#dc2626'],
        'debt_interest' => ['Bunga Utang', 'expense', '#b91c1c'],
        'debt_principal' => ['Pokok Utang', 'expense', '#f87171'],
        'asset_withdrawal' => ['Pencairan Aset', 'income', '#14b8a6'],
        'asset_deposit' => ['Setoran Investasi', 'expense', '#8b5cf6'],
    ];

    /** Tipe kategori untuk dana titipan / uang usaha yang cuma lewat: bukan pemasukan/pengeluaran pribadi. */
    public const TITIPAN = 'titipan';

    /**
     * Kategori sistem untuk uang yang cuma pindah kantong (setor/cair aset, pokok piutang kembali, pokok utang dilunasi):
     * mengubah saldo rekening, tetapi bukan pemasukan/pengeluaran sehingga tidak ikut rekap & rasio.
     */
    public const INTERNAL_MOVES = ['asset_deposit', 'asset_withdrawal', 'receivable_principal', 'receivable_out', 'receivable_topup', 'debt_principal'];

    protected $fillable = ['name', 'type', 'color', 'icon', 'system_key'];

    protected function casts(): array
    {
        return [];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Kategori sistem milik user; dibuat bila belum ada, atau ditautkan ke kategori lama yang namanya sama.
     */
    public static function system(User $user, string $key): self
    {
        [$name, $type, $color] = self::SYSTEM[$key];

        $category = $user->categories()->where('system_key', $key)->first()
            ?? $user->categories()->whereNull('system_key')->where('name', $name)->where('type', $type)->first();

        if ($category) {
            if ($category->system_key !== $key) {
                $category->update(['system_key' => $key]);
            }

            return $category;
        }

        return $user->categories()->create(['name' => $name, 'type' => $type, 'color' => $color, 'system_key' => $key]);
    }
}
