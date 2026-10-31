import { SVGAttributes } from 'react';

/** Logo Keuanganku: tiga batang naik dengan koin di atasnya (sama dengan favicon). Warna mengikuti `fill-current`. */
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg {...props} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="24" width="9" height="14" rx="3" opacity=".55" />
            <rect x="15.5" y="16" width="9" height="22" rx="3" opacity=".8" />
            <rect x="28" y="10" width="9" height="28" rx="3" />
            <circle cx="32.5" cy="4.5" r="3.5" className="fill-amber-400" />
        </svg>
    );
}
