<?php

use App\Http\Controllers\Settings\BackupController;
use App\Http\Controllers\Settings\LocaleController;
use App\Http\Controllers\Settings\NotificationController;
use App\Http\Controllers\Settings\PasskeyController;
use App\Http\Controllers\Settings\PasswordController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\RuleController;
use App\Http\Controllers\Settings\SecurityController;
use App\Models\Tag;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Bisa dipakai juga dari halaman login (disimpan di cookie)
Route::put('locale', [LocaleController::class, 'update'])->name('locale.update');

// Login biometrik (tamu)
Route::middleware(['guest', 'throttle:20,1'])->group(function () {
    Route::post('login/passkey/options', [PasskeyController::class, 'loginOptions'])->name('passkey.login.options');
    Route::post('login/passkey', [PasskeyController::class, 'login'])->name('passkey.login');
});

Route::middleware('auth')->group(function () {
    Route::redirect('settings', 'settings/appearance');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/password', [PasswordController::class, 'edit'])->name('password.edit');
    Route::put('settings/password', [PasswordController::class, 'update'])->name('password.update');

    Route::get('settings/appearance', function (Request $request) {
        return Inertia::render('settings/appearance', ['emergencyMonths' => $request->user()->emergency_months]);
    })->name('appearance');
    Route::put('settings/emergency', function (Request $request) {
        $data = $request->validate(['emergency_months' => ['required', 'integer', 'between:1,24']]);
        $request->user()->forceFill($data)->save();

        return back()->with('success', __('Target dana darurat disimpan.'));
    })->name('emergency.update');

    Route::get('settings/security', SecurityController::class)->name('security.index');
    Route::post('settings/passkeys/options', [PasskeyController::class, 'options'])->name('passkeys.options');
    Route::post('settings/passkeys', [PasskeyController::class, 'store'])->name('passkeys.store');
    Route::delete('settings/passkeys/{passkey}', [PasskeyController::class, 'destroy'])->name('passkeys.destroy');

    Route::get('settings/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('settings/notifications/subscribe', [NotificationController::class, 'subscribe'])->name('notifications.subscribe');
    Route::post('settings/notifications/unsubscribe', [NotificationController::class, 'unsubscribe'])->name('notifications.unsubscribe');
    Route::post('settings/notifications/test', [NotificationController::class, 'test'])->name('notifications.test');
    Route::get('notifications/pending', [NotificationController::class, 'pending'])->name('notifications.pending');

    Route::get('settings/backup', [BackupController::class, 'index'])->name('backup.index');
    Route::post('settings/backup', [BackupController::class, 'run'])->name('backup.now');
    Route::get('settings/backup/download/{name}', [BackupController::class, 'download'])->name('backup.download');
    Route::get('settings/backup/google', [BackupController::class, 'connect'])->name('backup.google');
    Route::get('settings/backup/google/callback', [BackupController::class, 'callback'])->name('backup.google.callback');
    Route::delete('settings/backup/google', [BackupController::class, 'disconnect'])->name('backup.google.disconnect');

    Route::get('settings/rules', [RuleController::class, 'index'])->name('rules.index');
    Route::post('settings/rules', [RuleController::class, 'store'])->name('rules.store');
    Route::put('settings/rules/{rule}', [RuleController::class, 'update'])->name('rules.update');
    Route::delete('settings/rules/{rule}', [RuleController::class, 'destroy'])->name('rules.destroy');
    Route::delete('settings/tags/{tag}', function (Request $request, Tag $tag) {
        abort_unless($tag->user_id === $request->user()->id, 403);
        $tag->delete();

        return back()->with('success', __('Tag dihapus.'));
    })->name('tags.destroy');
});
