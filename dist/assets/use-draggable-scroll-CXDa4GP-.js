import{Q as i,r as s}from"./index-C69zp4mv.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=i("FileDown",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M12 18v-6",key:"17g6i2"}],["path",{d:"m9 15 3 3 3-3",key:"1npd3o"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=i("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);function p(r){const c=s.useRef(null),[m,a]=s.useState(!1),n=s.useRef(!1),l=s.useRef(0),f=s.useRef(0);return s.useEffect(()=>{const u=c.current;if(!u)return;const e=r!=null&&r.childSelector?u.querySelector(r.childSelector)??u:u,v=o=>{n.current=!0,a(!0),l.current=o.pageX-e.offsetLeft,f.current=e.scrollLeft,e.style.cursor="grabbing",e.style.userSelect="none"},t=()=>{n.current&&(n.current=!1,a(!1),e.style.cursor="grab",e.style.removeProperty("user-select"))},d=o=>{if(!n.current)return;o.preventDefault();const g=(o.pageX-e.offsetLeft-l.current)*2;e.scrollLeft=f.current-g};return e.style.cursor="grab",e.addEventListener("mousedown",v),e.addEventListener("mouseleave",t),e.addEventListener("mouseup",t),e.addEventListener("mousemove",d),window.addEventListener("mouseup",t),()=>{e.removeEventListener("mousedown",v),e.removeEventListener("mouseleave",t),e.removeEventListener("mouseup",t),e.removeEventListener("mousemove",d),window.removeEventListener("mouseup",t),e.style.removeProperty("cursor"),e.style.removeProperty("user-select")}},[r==null?void 0:r.childSelector]),{ref:c,isDragging:m}}export{h as F,E as M,p as u};
