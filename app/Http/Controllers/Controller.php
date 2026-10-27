<?php

namespace App\Http\Controllers;

use Illuminate\Database\Eloquent\Model;

abstract class Controller
{
    /**
     * Pastikan data milik user yang sedang login.
     */
    protected function ensureOwner(Model $model): void
    {
        abort_unless($model->getAttribute('user_id') === auth()->id(), 403);
    }
}
