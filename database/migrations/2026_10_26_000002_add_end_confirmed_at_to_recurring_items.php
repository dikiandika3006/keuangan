<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Diisi saat user mengonfirmasi biaya tetap memang selesai di end_date (tidak diperpanjang)
        Schema::table('recurring_items', function (Blueprint $table) {
            $table->timestamp('end_confirmed_at')->nullable()->after('end_date');
        });
    }

    public function down(): void
    {
        Schema::table('recurring_items', function (Blueprint $table) {
            $table->dropColumn('end_confirmed_at');
        });
    }
};
