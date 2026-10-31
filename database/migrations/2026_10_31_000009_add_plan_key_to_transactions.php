<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Realisasi pemasukan skenario (salary, plastic, djitu, jht): transaksi yang ditautkan ke baris rencana
     * Proyeksi, supaya rencana bulan itu tidak dihitung lagi di samping angka aktualnya.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('plan_key', 30)->nullable()->after('recurring_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn('plan_key');
        });
    }
};
