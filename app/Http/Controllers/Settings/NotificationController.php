<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Services\ReminderService;
use App\Services\TaskRunner;
use App\Services\WebPush;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Notifikasi push ke HP/laptop: langganan per perangkat, kirim tes, dan isi notifikasi untuk service worker. */
class NotificationController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('settings/notifications', [
            'publicKey' => WebPush::publicKey(),
            'devices' => $user->pushSubscriptions()->latest()->get(['id', 'endpoint_hash', 'user_agent', 'created_at']),
            'recent' => $user->appNotifications()->latest('id')->limit(15)->get(['id', 'title', 'body', 'url', 'delivered_at', 'created_at']),
            'cronUrl' => route('cron.run', TaskRunner::cronToken()),
        ]);
    }

    public function subscribe(Request $request): RedirectResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'url', 'max:2000', 'starts_with:https://']]);
        $request->user()->pushSubscriptions()->updateOrCreate(
            ['endpoint_hash' => hash('sha256', $data['endpoint'])],
            ['endpoint' => $data['endpoint'], 'user_agent' => mb_substr((string) $request->userAgent(), 0, 255)],
        );

        return back()->with('success', __('Notifikasi aktif di perangkat ini.'));
    }

    public function unsubscribe(Request $request): RedirectResponse
    {
        $data = $request->validate(['endpoint_hash' => ['required', 'string']]);
        $request->user()->pushSubscriptions()->where('endpoint_hash', $data['endpoint_hash'])->delete();

        return back()->with('success', __('Notifikasi dimatikan untuk perangkat itu.'));
    }

    public function test(Request $request): RedirectResponse
    {
        $user = $request->user();
        $user->appNotifications()->create([
            'key' => 'test:'.now()->timestamp,
            'title' => __('Tes notifikasi'),
            'body' => __('Notifikasi sudah berfungsi. Pengingat tagihan akan muncul seperti ini.'),
            'url' => route('dashboard'),
        ]);
        $sent = (new ReminderService($user))->push();

        return back()->with($sent ? 'success' : 'error', $sent ? __('Tes terkirim ke :n perangkat.', ['n' => $sent]) : __('Belum ada perangkat yang aktif.'));
    }

    /** Dipanggil service worker setelah menerima push (tanpa isi). */
    public function pending(Request $request): JsonResponse
    {
        return response()->json((new ReminderService($request->user()))->takePending());
    }
}
