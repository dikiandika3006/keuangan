import{u as h,j as a,L as u}from"./app-DJ1FWTC5.js";import{c as n,t as e,a as s}from"./i18n-BG2QHneE.js";import{S as x,H as i}from"./layout-U__-I7Kp.js";import{L as k}from"./language-tabs-D2NUB9Xe.js";import{a as y}from"./app-layout-CVe8Fq2w.js";import"./index-BeiaAAgO.js";import"./index-CDp7Qef2.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],b=n("Monitor",g);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]],f=n("Moon",j);/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],M=n("Sun",v);function N({className:r="",...o}){const{appearance:l,updateAppearance:c}=h(),p=[{value:"light",icon:M,label:e("Terang")},{value:"dark",icon:f,label:e("Gelap")},{value:"system",icon:b,label:e("Ikuti HP")}];return a.jsx("div",{className:s("inline-flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800",r),...o,children:p.map(({value:t,icon:d,label:m})=>a.jsxs("button",{onClick:()=>c(t),className:s("flex items-center rounded-md px-3.5 py-1.5 transition-colors",l===t?"bg-white shadow-xs dark:bg-neutral-700 dark:text-neutral-100":"text-neutral-500 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-700/60"),children:[a.jsx(d,{className:"-ml-1 h-4 w-4"}),a.jsx("span",{className:"ml-1.5 text-sm",children:m})]},t))})}const L=[{title:e("Tampilan"),href:"/settings/appearance"}];function I(){return a.jsxs(y,{breadcrumbs:L,children:[a.jsx(u,{title:e("Tampilan")}),a.jsxs(x,{children:[a.jsxs("div",{className:"space-y-6",children:[a.jsx(i,{title:e("Tema"),description:e("Ikuti HP = otomatis mengikuti mode gelap/terang di HP. Pilihan disimpan di perangkat ini.")}),a.jsx(N,{})]}),a.jsxs("div",{className:"space-y-6",children:[a.jsx(i,{title:e("Bahasa"),description:e("Bahasa tampilan aplikasi, disimpan di akunmu.")}),a.jsx(k,{})]})]})]})}export{I as default};
