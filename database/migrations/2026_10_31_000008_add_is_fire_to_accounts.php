<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rekening FIRE: sumber otomatis tab Realisasi Kalkulator FIRE (setoran = transfer masuk, saldo = saldo rekening).
     */
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->boolean('is_fire')->default(false)->after('is_emergency_fund');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn('is_fire');
        });
    }
};
