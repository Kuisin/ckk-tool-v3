import{a1 as x,aW as R,ax as F,y as k,am as a,aV as C}from"./design-modules-Bz3EomlZ.js";import{c as v}from"./createReactComponent-DSefK2yo.js";const M=x(s=>{const{onChange:n,children:o,multiple:r,accept:l,name:c,form:i,resetRef:u,disabled:p,capture:f,inputProps:d,ref:m,...g}=R("FileButton",null,s),t=F.useRef(null),h=()=>{var e;!p&&((e=t.current)==null||e.click())},y=e=>{if(e.currentTarget.files===null)return n(r?[]:null);n(r?Array.from(e.currentTarget.files):e.currentTarget.files[0]||null)};return k(u,()=>{t.current&&(t.current.value="")}),a.jsxs(a.Fragment,{children:[a.jsx("input",{style:{display:"none"},type:"file",accept:l,multiple:r,onChange:y,ref:C(m,t),name:c,form:i,capture:f,...d}),o({onClick:h,...g})]})});M.displayName="@mantine/core/FileButton";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2",key:"svg-0"}],["path",{d:"M7 9l5 -5l5 5",key:"svg-1"}],["path",{d:"M12 4l0 12",key:"svg-2"}]],I=v("outline","upload","Upload",j);export{M as F,I};
