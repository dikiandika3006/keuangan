<?php

use App\Http\Controllers\Finance\AccountController;
use App\Http\Controllers\Finance\AssetController;
use App\Http\Controllers\Finance\BudgetController;
use App\Http\Controllers\Finance\CalendarController;
use App\Http\Controllers\Finance\DashboardController;
use App\Http\Controllers\Finance\DebtController;
use App\Http\Controllers\Finance\GoalController;
use App\Http\Controllers\Finance\MonthlyBillController;
use App\Http\Controllers\Finance\PlanController;
use App\Http\Controllers\Finance\ProjectionController;
use App\Http\Controllers\Finance\RecapController;
use App\Http\Controllers\Finance\ReceivableController;
use App\Http\Controllers\Finance\SetupController;
use App\Http\Controllers\Finance\TransactionController;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => auth()->check() ? redirect()->route('dashboard') : redirect()->route('login'))->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::resource('accounts', AccountController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::get('transactions/{transaction}/attachment', [TransactionController::class, 'attachment'])->name('transactions.attachment');
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

        return back()->with('success', $ok ? 'Backup database tersimpan di storage/app/backups.' : 'Backup gagal: '.trim(Artisan::output()));
    })->name('backup.run');

    Route::get('recap', RecapController::class)->name('recap.index');
    Route::get('calendar', CalendarController::class)->name('calendar.index');
    Route::get('monthly', [MonthlyBillController::class, 'index'])->name('monthly.index');
    Route::post('monthly/{recurringItem}/pay', [MonthlyBillController::class, 'pay'])->name('monthly.pay');
    Route::post('monthly/{recurringItem}/renew', [MonthlyBillController::class, 'renew'])->name('monthly.renew');
    Route::post('monthly/{recurringItem}/confirm-end', [MonthlyBillController::class, 'confirmEnd'])->name('monthly.confirm-end');

    Route::get('plan', [PlanController::class, 'index'])->name('plan.index');
    Route::post('plan/recurring', [PlanController::class, 'store'])->name('recurring.store');
    Route::put('plan/recurring/{recurringItem}', [PlanController::class, 'update'])->name('recurring.update');
    Route::delete('plan/recurring/{recurringItem}', [PlanController::class, 'destroy'])->name('recurring.destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
