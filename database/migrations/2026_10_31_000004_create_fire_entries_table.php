<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Realisasi Kalkulator FIRE: setoran & saldo dana FIRE per bulan, diisi manual dan terpisah dari rekening/transaksi.
     */
    public function up(): void
    {
        Schema::create('fire_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('month', 7);
            $table->bigInteger('deposit')->default(0);
            $table->bigInteger('balance');
            $table->timestamps();
            $table->unique(['user_id', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fire_entries');
    }
};
