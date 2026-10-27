<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Item rutin bertipe 'transfer' = isi Dompet Tujuan tiap bulan (dari account_id ke to_account_id)
        Schema::table('recurring_items', function (Blueprint $table) {
            $table->foreignId('account_id')->nullable()->after('category_id')->constrained()->nullOnDelete();
            $table->foreignId('to_account_id')->nullable()->after('account_id')->constrained('accounts')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('recurring_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('to_account_id');
            $table->dropConstrainedForeignId('account_id');
        });
    }
};
