<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Biaya tetap bulanan: kategori & tanggal bayar, dan transaksi bertaut agar realisasi per bulan terlacak
        Schema::table('recurring_items', function (Blueprint $table) {
            $table->foreignId('category_id')->nullable()->after('type')->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('due_day')->nullable()->after('amount');
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('recurring_item_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('recurring_item_id');
        });

        Schema::table('recurring_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('category_id');
            $table->dropColumn('due_day');
        });
    }
};
