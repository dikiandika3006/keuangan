<?php

use App\Http\Controllers\Finance\AccountController;
use App\Http\Controllers\Finance\AssetController;
use App\Http\Controllers\Finance\BudgetController;
use App\Http\Controllers\Finance\CalendarController;
use App\Http\Controllers\Finance\DashboardController;
use App\Http\Controllers\Finance\DebtController;
use App\Http\Controllers\Finance\ExportController;
use App\Http\Controllers\Finance\FireController;
use App\Http\Controllers\Finance\GoalController;
use App\Http\Controllers\Finance\ImportController;
use App\Http\Controllers\Finance\MonthlyBillController;
use App\Http\Controllers\Finance\PlanController;
use App\Http\Controllers\Finance\ProjectionController;
use App\Http\Controllers\Finance\RecapController;
use App\Http\Controllers\Finance\ReceivableController;
use App\Http\Controllers\Finance\ReviewController;
use App\Http\Controllers\Finance\SetupController;
use App\Http\Controllers\Finance\TitipanController;
use App\Http\Controllers\Finance\TransactionController;
use App\Services\TaskRunner;
use App\Support\HomePage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;

Route::get('/', fn (Request $request) => auth()->check() ? redirect(HomePage::url($request)) : redirect()->route('login'))->name('home');

// Pemicu tugas berkala untuk cron eksternal (cron-job.org / cron Hostinger lewat URL); token diturunkan dari APP_KEY
Route::get('cron/{token}', function (string $token) {
    abort_unless(hash_equals(TaskRunner::cronToken(), $token), 404);

    return response()->json(TaskRunner::runDue());
})->middleware('throttle:10,1')->name('cron.run');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::resource('accounts', AccountController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::get('transactions/suggest', [TransactionController::class, 'suggest'])->name('transactions.suggest');
    Route::get('transactions/frequent', [TransactionController::class, 'frequent'])->name('transactions.frequent');
    Route::get('transactions/{transaction}/attachment', [TransactionController::class, 'attachment'])->name('transactions.attachment');

    Route::get('import', [ImportController::class, 'index'])->name('import.index');
    Route::post('import/preview', [ImportController::class, 'preview'])->name('import.preview');
    Route::post('import', [ImportController::class, 'store'])->name('import.store');
    Route::delete('import', [ImportController::class, 'cancel'])->name('import.cancel');

    Route::get('export', ExportController::class)->name('export');
    Route::get('review', ReviewController::class)->name('review.index');
    Route::resource('transactions', TransactionController::class)->only(['index', 'store', 'update', 'destroy']);

    Route::get('budgets', [BudgetController::class, 'index'])->name('budgets.index');
    Route::put('budgets/{category}', [BudgetController::class, 'setBudget'])->name('budgets.set');
    Route::post('categories', [BudgetController::class, 'storeCategory'])->name('categories.store');
    Route::put('categories/{category}', [BudgetController::class, 'updateCategory'])->name('categories.update');
    Route::delete('categories/{category}', [BudgetController::class, 'destroyCategory'])->name('categories.destroy');

    Route::resource('goals', GoalController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('goals/{goal}/deposit', [GoalController::class, 'deposit'])->name('goals.deposit');

    Route::resource('debts', DebtController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('debts/{debt}/pay', [DebtController::class, 'pay'])->name('debts.pay');

    Route::post('accounts/{account}/reconcile', [AccountController::class, 'reconcile'])->name('accounts.reconcile');

    Route::resource('receivables', ReceivableController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('receivables/{receivable}/receive', [ReceivableController::class, 'receive'])->name('receivables.receive');
    Route::post('receivables/{receivable}/topup', [ReceivableController::class, 'topup'])->name('receivables.topup');

    Route::resource('assets', AssetController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('assets/{asset}/valuate', [AssetController::class, 'valuate'])->name('assets.valuate');
    Route::post('assets/{asset}/move', [AssetController::class, 'move'])->name('assets.move');

    Route::get('projection', [ProjectionController::class, 'index'])->name('projection.index');
    Route::post('scenarios', [ProjectionController::class, 'store'])->name('scenarios.store');
    Route::put('scenarios/{scenario}', [ProjectionController::class, 'update'])->name('scenarios.update');
    Route::post('scenarios/{scenario}/activate', [ProjectionController::class, 'activate'])->name('scenarios.activate');
    Route::delete('scenarios/{scenario}', [ProjectionController::class, 'destroy'])->name('scenarios.destroy');
    Route::post('employment', [ProjectionController::class, 'storeEmployment'])->name('employment.store');
    Route::delete('employment/{employmentStatus}', [ProjectionController::class, 'destroyEmployment'])->name('employment.destroy');

    Route::post('setup/starter', SetupController::class)->name('setup.starter');
    Route::post('backup', function () {
        $ok = Artisan::call('keuangan:backup') === 0;

        return back()->with('success', $ok ? __('Backup database tersimpan di storage/app/backups.') : __('Backup gagal: :error', ['error' => trim(Artisan::output())]));
    })->name('backup.run');

    Route::get('recap', RecapController::class)->name('recap.index');
    Route::get('titipan', TitipanController::class)->name('titipan.index');
    Route::get('calendar', CalendarController::class)->name('calendar.index');
    Route::get('monthly', [MonthlyBillController::class, 'index'])->name('monthly.index');
    Route::post('monthly/{recurringItem}/pay', [MonthlyBillController::class, 'pay'])->name('monthly.pay');
    Route::post('monthly/{recurringItem}/renew', [MonthlyBillController::class, 'renew'])->name('monthly.renew');
    Route::post('monthly/{recurringItem}/confirm-end', [MonthlyBillController::class, 'confirmEnd'])->name('monthly.confirm-end');

    Route::get('calculator/fire', [FireController::class, 'index'])->name('calculator.fire');
    Route::put('calculator/fire/settings', [FireController::class, 'saveSettings'])->name('fire.settings');
    Route::post('calculator/fire/entries', [FireController::class, 'store'])->name('fire-entries.store');
    Route::delete('calculator/fire/entries/{fireEntry}', [FireController::class, 'destroy'])->name('fire-entries.destroy');
    Route::inertia('calculator/kpr', 'calculator/kpr')->name('calculator.kpr');

    Route::get('plan', [PlanController::class, 'index'])->name('plan.index');
    Route::post('plan/recurring', [PlanController::class, 'store'])->name('recurring.store');
    Route::put('plan/recurring/{recurringItem}', [PlanController::class, 'update'])->name('recurring.update');
    Route::delete('plan/recurring/{recurringItem}', [PlanController::class, 'destroy'])->name('recurring.destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
