import{c as a,r as j,a as v,b as h,j as e,X as c,i as y,H as N}from"./index-DO9zxgcv.js";import{F as x}from"./folder-C6nDsPry.js";/**
 * @license lucide-react v0.439.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=a("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);/**
 * @license lucide-react v0.439.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=a("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.439.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=a("FolderOpen",[["path",{d:"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",key:"usdka0"}]]);/**
 * @license lucide-react v0.439.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=a("LoaderCircle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);/**
 * @license lucide-react v0.439.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=a("Save",[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",key:"1c8476"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",key:"1ydtos"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7",key:"t51u73"}]]),z=r=>h(`/api/fs?path=${encodeURIComponent(r)}`),F=()=>h("/api/fs/drives");function M({initialPath:r,onSelect:p,onCancel:d}){const[t,l]=j.useState(r||""),m=t||"drives",{data:u,error:o,isLoading:i}=v(m,t?()=>z(t):F),n=u?.filter(s=>s.isDirectory)||[],f=s=>{l(s)},b=()=>{if(!t)return;const s=t.split(/[/\\]/);if(s.pop(),s.length===0||s.length===1&&s[0]==="")l("");else{const g=s.join("\\")||"";t.endsWith(":\\")||t.length===2&&t[1]===":"?l(""):l(g)}};return e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:e.jsxs("div",{className:"bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]",children:[e.jsxs("div",{className:"p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800 rounded-t-lg",children:[e.jsxs("h3",{className:"font-semibold text-white flex items-center gap-2",children:[e.jsx(x,{className:"text-blue-400",size:20}),"Select Folder"]}),e.jsx("button",{onClick:d,className:"text-slate-400 hover:text-white",children:e.jsx(c,{size:20})})]}),e.jsxs("div",{className:"p-2 bg-slate-800 border-b border-slate-700 flex gap-2 items-center",children:[e.jsx("button",{onClick:b,disabled:!t,className:"p-2 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed",title:"Go Up",children:e.jsx(C,{size:20})}),e.jsx("div",{className:"flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 font-mono truncate",children:y(t)||"This PC"})]}),e.jsxs("div",{className:"flex-1 overflow-y-auto p-2 min-h-[300px]",children:[i&&e.jsxs("div",{className:"flex items-center justify-center h-full text-slate-400 gap-2",children:[e.jsx(w,{className:"animate-spin",size:24}),"Loading..."]}),o&&e.jsxs("div",{className:"flex items-center justify-center h-full text-red-400 gap-2",children:[e.jsx(c,{size:24}),"Failed to load directory"]}),!i&&!o&&n.length===0&&e.jsx("div",{className:"flex items-center justify-center h-full text-slate-500 italic",children:"No folders found"}),!i&&!o&&e.jsx("div",{className:"grid grid-cols-1 gap-1",children:n.map(s=>e.jsxs("button",{onClick:()=>f(s.fullPath||s.name),className:"flex items-center gap-3 p-2 hover:bg-slate-800 rounded text-left group",children:[t===""?e.jsx(N,{className:"text-slate-400 group-hover:text-blue-400",size:20}):e.jsx(x,{className:"text-yellow-500 group-hover:text-yellow-400",size:20}),e.jsx("span",{className:"text-slate-200 text-sm flex-1 truncate",children:s.name})]},s.fullPath||s.name))})]}),e.jsxs("div",{className:"p-4 border-t border-slate-700 bg-slate-800 rounded-b-lg flex justify-end gap-2",children:[e.jsx("button",{onClick:d,className:"px-4 py-2 rounded text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors",children:"Cancel"}),e.jsxs("button",{onClick:()=>p(t),disabled:!t,className:"px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2",children:[e.jsx(k,{size:16}),"Select This Folder"]})]})]})})}export{C,S as F,w as L,L as S,M as a};
