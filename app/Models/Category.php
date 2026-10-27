<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Category extends Model
{
    /** Kategori yang dipakai otomatis oleh sistem: key => [nama, tipe, warna]. */
    public const SYSTEM = [
        'unspecified_expense' => ['Pengeluaran Tidak Dirinci', 'expense', '#94a3b8'],
        'unspecified_income' => ['Pemasukan Tidak Dirinci', 'income', '#94a3b8'],
        'receivable_interest' => ['Bunga Piutang', 'income', '#0ea5e9'],
        'receivable_principal' => ['Pokok Piutang', 'income', '#6366f1'],
        'debt_installment' => ['Cicilan / Utang', 'expense', '#dc2626'],
        'asset_withdrawal' => ['Pencairan Aset', 'income', '#14b8a6'],
        'asset_deposit' => ['Setoran Investasi', 'expense', '#8b5cf6'],
    ];

    protected $fillable = ['name', 'type', 'color', 'system_key'];

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
