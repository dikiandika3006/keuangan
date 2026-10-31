import { b64url, jsonFetch } from '@/lib/http';
import { router } from '@inertiajs/react';

type CreationOptions = {
    challenge: string;
    rp: { id: string; name: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: { type: 'public-key'; alg: number }[];
    authenticatorSelection: AuthenticatorSelectionCriteria;
    excludeCredentials: { type: 'public-key'; id: string }[];
    timeout: number;
    attestation: AttestationConveyancePreference;
};

type RequestOptions = { challenge: string; rpId: string; userVerification: UserVerificationRequirement; timeout: number };

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext;

/** Daftarkan perangkat ini (sidik jari / Face ID / PIN) untuk login biometrik. */
export async function registerPasskey(name: string, onError: (message: string) => void) {
    const o = await jsonFetch<CreationOptions>(route('passkeys.options'), { method: 'POST', body: {} });
    const credential = (await navigator.credentials.create({
        publicKey: {
            ...o,
            challenge: b64url.decode(o.challenge),
            user: { ...o.user, id: b64url.decode(o.user.id) },
            excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: b64url.decode(c.id) })),
        },
    })) as PublicKeyCredential | null;
    if (!credential) return;

    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKey = response.getPublicKey?.();
    if (!publicKey) {
        onError('unsupported');
        return;
    }

    router.post(
        route('passkeys.store'),
        {
            name,
            id: credential.id,
            clientDataJSON: b64url.encode(response.clientDataJSON),
            authenticatorData: b64url.encode(response.getAuthenticatorData()),
            publicKey: b64url.encode(publicKey),
            publicKeyAlgorithm: response.getPublicKeyAlgorithm(),
        },
        { preserveScroll: true, onError: (e) => onError(e.passkey ?? Object.values(e)[0] ?? '') },
    );
}

/** Masuk dengan passkey yang tersimpan di perangkat. */
export async function loginWithPasskey(onError: (message: string) => void) {
    const o = await jsonFetch<RequestOptions>(route('passkey.login.options'), { method: 'POST', body: {} });
    const credential = (await navigator.credentials.get({
        publicKey: { ...o, challenge: b64url.decode(o.challenge) },
    })) as PublicKeyCredential | null;
    if (!credential) return;

    const response = credential.response as AuthenticatorAssertionResponse;
    router.post(
        route('passkey.login'),
        {
            id: credential.id,
            clientDataJSON: b64url.encode(response.clientDataJSON),
            authenticatorData: b64url.encode(response.authenticatorData),
            signature: b64url.encode(response.signature),
        },
        { onError: (e) => onError(e.passkey ?? Object.values(e)[0] ?? '') },
    );
}
