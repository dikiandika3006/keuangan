<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Keamanan: perangkat login biometrik + log aktivitas akun. */
class SecurityController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('settings/security', [
            'passkeys' => $user->passkeys()->latest()->get(['id', 'name', 'last_used_at', 'created_at']),
            'logs' => $user->activityLogs()->latest('id')
                ->when($request->query('action'), fn ($q, $a) => $q->where('action', $a))
                ->paginate(30, ['id', 'action', 'subject_type', 'description', 'ip', 'user_agent', 'created_at'])
                ->withQueryString(),
            'filter' => $request->query('action'),
        ]);
    }
}
