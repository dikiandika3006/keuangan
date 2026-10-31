import { Head, useForm } from '@inertiajs/react';
import { Fingerprint, LoaderCircle } from 'lucide-react';
import { FormEventHandler, useState } from 'react';

import InputError from '@/components/input-error';
import LanguageTabs from '@/components/language-tabs';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/auth-layout';
import { t } from '@/lib/i18n';
import { loginWithPasskey, passkeyRemembered, passkeySupported } from '@/lib/webauthn';

type LoginForm = {
    email: string;
    password: string;
    remember: boolean;
};

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
}

export default function Login({ status, canResetPassword, canRegister }: LoginProps) {
    const biometric = passkeySupported();
    // Perangkat yang sudah pernah memakai sidik jari: tombol biometrik jadi pilihan utama di atas form
    const preferBiometric = biometric && passkeyRemembered();
    const [passkeyError, setPasskeyError] = useState('');
    const biometricButton = (
        <div className="grid gap-2">
            <Button
                type="button"
                variant={preferBiometric ? 'default' : 'outline'}
                size={preferBiometric ? 'lg' : 'default'}
                className="w-full"
                onClick={() => {
                    setPasskeyError('');
                    loginWithPasskey(setPasskeyError).catch(() => setPasskeyError(t('Login biometrik dibatalkan.')));
                }}
            >
                <Fingerprint /> {t('Masuk dengan sidik jari / Face ID')}
            </Button>
            <InputError message={passkeyError} />
        </div>
    );
    const { data, setData, post, processing, errors, reset } = useForm<LoginForm>({
        email: '',
        password: '',
        remember: false,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <AuthLayout title={t('Masuk ke akunmu')} description={t('Masukkan username/email dan kata sandi')}>
            <Head title={t('Masuk|login')} />

            <form className="flex flex-col gap-6" onSubmit={submit}>
                {preferBiometric && (
                    <>
                        {biometricButton}
                        <div className="text-muted-foreground flex items-center gap-3 text-xs">
                            <span className="bg-border h-px flex-1" />
                            {t('atau pakai kata sandi')}
                            <span className="bg-border h-px flex-1" />
                        </div>
                    </>
                )}
                <div className="grid gap-6">
                    <div className="grid gap-2">
                        <Label htmlFor="email">{t('Username atau email')}</Label>
                        <Input
                            id="email"
                            type="text"
                            required
                            autoFocus={!preferBiometric}
                            tabIndex={1}
                            autoComplete="username"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            placeholder="dikiandika"
                        />
                        <InputError message={errors.email} />
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-center">
                            <Label htmlFor="password">{t('Kata sandi')}</Label>
                            {canResetPassword && (
                                <TextLink href={route('password.request')} className="ml-auto text-sm" tabIndex={5}>
                                    {t('Lupa kata sandi?')}
                                </TextLink>
                            )}
                        </div>
                        <Input
                            id="password"
                            type="password"
                            required
                            tabIndex={2}
                            autoComplete="current-password"
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            placeholder={t('Kata sandi')}
                        />
                        <InputError message={errors.password} />
                    </div>

                    <div className="flex items-center space-x-3">
                        <Checkbox id="remember" name="remember" tabIndex={3} />
                        <Label htmlFor="remember">{t('Ingat saya')}</Label>
                    </div>

                    <Button
                        type="submit"
                        variant={preferBiometric ? 'outline' : 'default'}
                        className="mt-2 w-full"
                        tabIndex={4}
                        disabled={processing}
                    >
                        {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {t('Masuk|login')}
                    </Button>
                    {biometric && !preferBiometric && biometricButton}
                </div>

                {canRegister && (
                    <div className="text-muted-foreground text-center text-sm">
                        {t('Belum punya akun?')}{' '}
                        <TextLink href={route('register')} tabIndex={5}>
                            {t('Daftar')}
                        </TextLink>
                    </div>
                )}
            </form>

            {status && <div className="mb-4 text-center text-sm font-medium text-green-600">{status}</div>}

            <LanguageTabs className="mx-auto" />
        </AuthLayout>
    );
}
