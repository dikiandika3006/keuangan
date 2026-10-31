import{c}from"./i18n-SduDASxI.js";import{j as e}from"./app-CTMfk3kl.js";import{I as i}from"./index-Cq00uFTM.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],d=c("RotateCcw",p);function x({value:a,onChange:r,id:s,suffix:n="%"}){return e.jsxs("div",{className:"relative",children:[e.jsx(i,{id:s,inputMode:"decimal",value:String(a).replace(".",","),onChange:o=>{const t=parseFloat(o.target.value.replace(",","."));r(Number.isFinite(t)?t:0)},className:"pr-12"}),e.jsx("span",{className:"text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm",children:n})]})}export{x as P,d as R};
