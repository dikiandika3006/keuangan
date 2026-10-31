<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Uang keluar dari rekening ke piutang (dana awal yang diberikan & tambah pokok) ditautkan ke piutangnya,
     * supaya saldo rekening berkurang tanpa tercatat sebagai pengeluaran.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('receivable_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', fn (Blueprint $table) => $table->dropConstrainedForeignId('receivable_id'));
    }
};
