<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Target bisa ditautkan ke Dompet Tujuan/rekening atau Aset: dana terkumpul mengikuti saldonya,
     * bukan angka yang diisi manual (supaya tidak ada dua catatan untuk uang yang sama).
     */
    public function up(): void
    {
        Schema::table('goals', function (Blueprint $table) {
            $table->foreignId('account_id')->nullable()->after('current_amount')->constrained()->nullOnDelete();
            $table->foreignId('asset_id')->nullable()->after('account_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('goals', function (Blueprint $table) {
            $table->dropConstrainedForeignId('asset_id');
            $table->dropConstrainedForeignId('account_id');
        });
    }
};
