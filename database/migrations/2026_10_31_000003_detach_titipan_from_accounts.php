<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Titipan lama yang masih tercatat di rekening dilepas dari rekeningnya, supaya semua titipan
     * hanya ada di halaman Titipan. Saldo rekening berubah sebesar selisih titipan (disesuaikan pengguna).
     */
    public function up(): void
    {
        DB::table('transactions')
            ->whereIn('category_id', DB::table('categories')->where('type', 'titipan')->select('id'))
            ->whereNotNull('account_id')
            ->update(['account_id' => null, 'to_account_id' => null]);
    }

    public function down(): void
    {
        // Rekening asal tidak disimpan; kembalikan dari backup otomatis bila perlu.
    }
};
