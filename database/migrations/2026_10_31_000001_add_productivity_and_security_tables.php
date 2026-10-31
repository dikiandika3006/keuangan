<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Aturan kategori otomatis, tag, pecah transaksi, notifikasi push, login biometrik (passkey),
     * log aktivitas, target dana darurat, dan backup Google Drive.
     */
    public function up(): void
    {
        Schema::create('rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('keyword', 100);
            $table->foreignId('category_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('recurring_item_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 50);
            $table->string('color')->default('#64748b');
            $table->timestamps();
            $table->unique(['user_id', 'name']);
        });

        Schema::create('tag_transaction', function (Blueprint $table) {
            $table->foreignId('tag_id')->constrained()->cascadeOnDelete();
            $table->foreignId('transaction_id')->constrained()->cascadeOnDelete();
            $table->primary(['tag_id', 'transaction_id']);
        });

        Schema::table('transactions', function (Blueprint $table) {
            // Transaksi hasil pecah satu struk berbagi kode grup yang sama
            $table->string('split_group', 36)->nullable()->index();
            // Baris mutasi bank yang diimpor (untuk deteksi duplikat)
            $table->string('import_hash', 64)->nullable()->index();
        });

        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('endpoint');
            $table->string('endpoint_hash', 64)->unique();
            $table->string('user_agent')->nullable();
            $table->timestamps();
        });

        Schema::create('app_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 120); // mencegah notifikasi yang sama dikirim dua kali
            $table->string('title');
            $table->string('body', 500);
            $table->string('url')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'key']);
        });

        Schema::create('passkeys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('credential_id', 512)->unique();
            $table->text('public_key'); // PEM
            $table->integer('algorithm');
            $table->unsignedBigInteger('sign_count')->default(0);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('action', 50);
            $table->string('subject_type', 50)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('description', 500);
            $table->string('ip', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedTinyInteger('emergency_months')->default(6);
            $table->text('google_drive_token')->nullable(); // terenkripsi
            $table->string('google_drive_folder_id')->nullable();
            $table->timestamp('google_drive_backup_at')->nullable();
            $table->date('reviewed_month')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['emergency_months', 'google_drive_token', 'google_drive_folder_id', 'google_drive_backup_at', 'reviewed_month']));
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('passkeys');
        Schema::dropIfExists('app_notifications');
        Schema::dropIfExists('push_subscriptions');
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['import_hash']);
            $table->dropIndex(['split_group']);
            $table->dropColumn(['split_group', 'import_hash']);
        });
        Schema::dropIfExists('tag_transaction');
        Schema::dropIfExists('tags');
        Schema::dropIfExists('rules');
    }
};
