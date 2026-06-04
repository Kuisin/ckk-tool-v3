import{ap as u,av as fn,ay as Ve,ao as Ee,ag as Dt,K as je,aO as de,aJ as pn,aL as Ne,aQ as ut,ae as i,a as j,au as Ae,aT as ke,aN as Oe,z as Re,L as Nt,d as hn,a8 as ft,a3 as Be,aC as Ot,at as zt,a2 as mn,a5 as $t,a4 as It,O as Ye,$ as pt,g as gn,aF as Ft,v as bn,ax as vn,aG as yn,aE as xn,aD as wn,aS as Sn,aB as En,ai as jn,V as gt,u as kn,a9 as tt,az as Rn,a0 as _n,t as bt,F as vt,x as Cn,X as Mn,an as yt,aU as Pn,Y as Tn,a1 as Dn,a6 as Nn,R as ee,l as Le,n as xt,aq as On,U as wt,q as K,G as te,W as Ue,w as At,_ as V,S as Lt,b as zn,C as st,p as it,B as $n,H as Me,ab as In,s as Fn,m as An,i as Ln,as as Xn,al as Yn,f as Un}from"./design-modules-COjQbZJ7.js";import{a as Hn,u as Wn,h as Vn,n as _e}from"./notifications.store-xTUEnN1x.js";import{a as Bn,u as Gn}from"./use-computed-color-scheme-D1jYCRAW.js";import{A as re}from"./ActionIcon-BxqKhdml.js";import{g as qn}from"./get-env-B-6RN2XZ.js";import{c as B}from"./createReactComponent-DVtw2pxo.js";import{I as Jn}from"./IconArrowRight-thmqOEfD.js";function Kn(e,t){if(e===t||Number.isNaN(e)&&Number.isNaN(t))return!0;if(!(e instanceof Object)||!(t instanceof Object))return!1;const n=Object.keys(e),{length:r}=n;if(r!==Object.keys(t).length)return!1;for(let s=0;s<r;s+=1){const o=n[s];if(!(o in t)||e[o]!==t[o]&&!(Number.isNaN(e[o])&&Number.isNaN(t[o])))return!1}return!0}const Qn=e=>(e+1)%1e6;function Zn(){const[,e]=u.useReducer(Qn,0);return e}function eo(e,t){if(!e||!t)return!1;if(e===t)return!0;if(e.length!==t.length)return!1;for(let n=0;n<e.length;n+=1)if(!Kn(e[n],t[n]))return!1;return!0}function to(e){const t=u.useRef([]),n=u.useRef(0);return eo(t.current,e)||(t.current=e,n.current+=1),[n.current]}function no(e,t){u.useEffect(e,to(t))}function oo(e,t,n={autoInvoke:!1}){const r=u.useRef(null),s=fn(e),o=u.useCallback((...c)=>{r.current||(r.current=window.setTimeout(()=>{s(...c),r.current=null},t))},[t]),a=u.useCallback(()=>{r.current&&(window.clearTimeout(r.current),r.current=null)},[]);return u.useEffect(()=>(n.autoInvoke&&o(),a),[a,o]),{start:o,clear:a}}function ro(e,t,n){const r=u.useRef(null);u.useEffect(()=>{r.current&&(r.current.disconnect(),r.current=null);const s=typeof n=="function"?n():n;return s&&(r.current=new MutationObserver(e),r.current.observe(s,t)),()=>{r.current&&(r.current.disconnect(),r.current=null)}},[e,t,n])}function so(){const[e,t]=u.useState(!1);return u.useEffect(()=>t(!0),[]),e}function io(e){if(!e||typeof e=="string")return 0;const t=e/36;return Math.round((4+15*t**.25+t/5)*10)}function nt(e){return e.current?e.current.scrollHeight:"auto"}function ao({transitionDuration:e,transitionTimingFunction:t="ease",onTransitionEnd:n,onTransitionStart:r,expanded:s,keepMounted:o}){const a={height:0,overflow:"hidden",...o?{}:{display:"none"}},c=u.useEffectEvent(()=>r==null?void 0:r()),d=u.useRef(null),[h,b]=u.useState(s?{}:a),[x,v]=u.useState(s?"entered":"exited"),k=p=>{Ee.flushSync(()=>b(p))},m=p=>{k(l=>({...l,...p}))},w=p=>{const l=e??io(p);return{transition:`height ${l}ms ${t}, opacity ${l}ms ${t}`}};Ve(()=>{e!==0&&c(),s?window.requestAnimationFrame(()=>{Ee.flushSync(()=>v("entering")),m({willChange:"height",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const p=nt(d);m({...w(p),height:p})})}):window.requestAnimationFrame(()=>{Ee.flushSync(()=>v("exiting"));const p=nt(d);m({...w(p),willChange:"height",height:p}),window.requestAnimationFrame(()=>m({height:0,overflow:"hidden"}))})},[s]);const g=p=>{if(!(p.target!==d.current||p.propertyName!=="height"))if(s){const l=nt(d);l===h.height?k({}):m({height:l}),v("entered"),n==null||n()}else h.height===0&&(k(a),v("exited"),n==null||n())};return{state:x,getCollapseProps:p=>({"aria-hidden":!s,inert:!s,ref:Dt(d,p==null?void 0:p.ref),onTransitionEnd:g,style:{boxSizing:"border-box",...p==null?void 0:p.style,...h}})}}function lo(e){if(!e||typeof e=="string")return 0;const t=e/36;return Math.round((4+15*t**.25+t/5)*10)}function ot(e){return e.current?e.current.scrollWidth:"auto"}function co({transitionDuration:e,transitionTimingFunction:t="ease",onTransitionEnd:n,onTransitionStart:r,expanded:s,keepMounted:o}){const a={width:0,overflow:"hidden",...o?{}:{display:"none"}},c=u.useEffectEvent(()=>r==null?void 0:r()),d=u.useRef(null),[h,b]=u.useState(s?{}:a),[x,v]=u.useState(s?"entered":"exited"),k=p=>{Ee.flushSync(()=>b(p))},m=p=>{k(l=>({...l,...p}))},w=p=>{const l=e??lo(p);return{transition:`width ${l}ms ${t}, opacity ${l}ms ${t}`}};Ve(()=>{e!==0&&c(),s?window.requestAnimationFrame(()=>{Ee.flushSync(()=>v("entering")),m({willChange:"width",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const p=ot(d);m({...w(p),width:p})})}):window.requestAnimationFrame(()=>{Ee.flushSync(()=>v("exiting"));const p=ot(d);m({...w(p),willChange:"width",width:p}),window.requestAnimationFrame(()=>m({width:0,overflow:"hidden"}))})},[s]);const g=p=>{if(!(p.target!==d.current||p.propertyName!=="width"))if(s){const l=ot(d);l===h.width?k({}):m({width:l}),v("entered"),n==null||n()}else h.width===0&&(k(a),v("exited"),n==null||n())};return{state:x,getCollapseProps:p=>({"aria-hidden":!s,inert:!s,ref:Dt(d,p==null?void 0:p.ref),onTransitionEnd:g,style:{boxSizing:"border-box",...p==null?void 0:p.style,...h}})}}const uo=100;function xe(e){return e>0?1:e<0?-1:0}function St(e){const t=e??0;return typeof t=="number"?[t,t]:t}function fo(){return{isActive:!1,pointerId:-1,startXY:[0,0],prevXY:[0,0],startTimestamp:0,prevTimestamp:0,thresholdMet:!1,firstFired:!1,lockedAxis:null,canceled:!1,lastVelocity:[0,0]}}function po(e,t={}){const[n,r]=u.useState(!1),s=u.useRef(e);s.current=e;const o=u.useRef(t);o.current=t;const a=u.useRef(fo()),c=u.useRef(null);return{ref:u.useCallback(d=>{if(!d)return;const h=new AbortController,b=l=>{const f=o.current,E=a.current;if(f.axis==="x")return[l[0],0];if(f.axis==="y")return[0,l[1]];if(f.axis==="lock"){if(E.lockedAxis===null){const R=f.axisThreshold??1;(Math.abs(l[0])>R||Math.abs(l[1])>R)&&(E.lockedAxis=Math.abs(l[0])>=Math.abs(l[1])?"x":"y")}if(E.lockedAxis==="x")return[l[0],0];if(E.lockedAxis==="y")return[0,l[1]]}return l},x=()=>{var f;const l=a.current;l.isActive=!1,l.pointerId=-1,l.thresholdMet=!1,l.firstFired=!1,l.lockedAxis=null,l.canceled=!1,r(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="",(f=c.current)==null||f.abort(),c.current=null},v=()=>{a.current.isActive&&(a.current.canceled=!0,x())},k=()=>{r(!0),document.body.style.userSelect="none",document.body.style.webkitUserSelect="none"},m=l=>{var y;if(o.current.enabled===!1||l.button!==0||a.current.isActive)return;const f=a.current;f.isActive=!0,f.pointerId=l.pointerId,f.startXY=[l.clientX,l.clientY],f.prevXY=[l.clientX,l.clientY],f.startTimestamp=l.timeStamp,f.prevTimestamp=l.timeStamp,f.thresholdMet=!1,f.firstFired=!1,f.lockedAxis=null,f.canceled=!1,f.lastVelocity=[0,0];const[E,R]=St(o.current.threshold);E===0&&R===0&&(f.thresholdMet=!0,f.firstFired=!0,k(),s.current({xy:[l.clientX,l.clientY],initial:[l.clientX,l.clientY],movement:[0,0],delta:[0,0],distance:[0,0],direction:[0,0],velocity:[0,0],elapsedTime:0,first:!0,last:!1,active:!0,tap:!1,canceled:!1,cancel:v,event:l})),(y=c.current)==null||y.abort(),c.current=new AbortController;const S=c.current.signal;document.addEventListener("pointermove",w,{signal:S}),document.addEventListener("pointerup",g,{signal:S}),document.addEventListener("pointercancel",p,{signal:S})},w=l=>{const f=a.current;if(!f.isActive||l.pointerId!==f.pointerId)return;const E=[l.clientX-f.startXY[0],l.clientY-f.startXY[1]];if(!f.thresholdMet){const[F,O]=St(o.current.threshold);if(Math.abs(E[0])<F&&Math.abs(E[1])<O){f.prevXY=[l.clientX,l.clientY],f.prevTimestamp=l.timeStamp;return}f.thresholdMet=!0,k()}const R=b(E),S=b([l.clientX-f.prevXY[0],l.clientY-f.prevXY[1]]),y=l.timeStamp-f.prevTimestamp,T=y>0?[Math.abs(S[0])/y,Math.abs(S[1])/y]:f.lastVelocity;f.lastVelocity=T;const N=!f.firstFired;f.firstFired=!0,f.prevXY=[l.clientX,l.clientY],f.prevTimestamp=l.timeStamp,s.current({xy:[l.clientX,l.clientY],initial:[...f.startXY],movement:R,delta:S,distance:[Math.abs(R[0]),Math.abs(R[1])],direction:[xe(S[0]),xe(S[1])],velocity:T,elapsedTime:l.timeStamp-f.startTimestamp,first:N,last:!1,active:!0,tap:!1,canceled:!1,cancel:v,event:l})},g=l=>{const f=a.current;if(!f.isActive||l.pointerId!==f.pointerId)return;const E=o.current;if(!f.thresholdMet){if(E.filterTaps){const O=b([l.clientX-f.startXY[0],l.clientY-f.startXY[1]]),A=[Math.abs(O[0]),Math.abs(O[1])],z=Math.max(A[0],A[1])<(E.tapThreshold??3);s.current({xy:[l.clientX,l.clientY],initial:[...f.startXY],movement:O,delta:O,distance:A,direction:[xe(O[0]),xe(O[1])],velocity:[0,0],elapsedTime:l.timeStamp-f.startTimestamp,first:!0,last:!0,active:!1,tap:z,canceled:!1,cancel:v,event:l})}x();return}const R=b([l.clientX-f.startXY[0],l.clientY-f.startXY[1]]),S=[Math.abs(R[0]),Math.abs(R[1])],y=b([l.clientX-f.prevXY[0],l.clientY-f.prevXY[1]]),T=l.timeStamp-f.prevTimestamp>uo?[0,0]:f.lastVelocity,N=Math.max(S[0],S[1]),F=E.filterTaps===!0&&N<(E.tapThreshold??3);s.current({xy:[l.clientX,l.clientY],initial:[...f.startXY],movement:R,delta:y,distance:S,direction:[xe(y[0]),xe(y[1])],velocity:T,elapsedTime:l.timeStamp-f.startTimestamp,first:!f.firstFired,last:!0,active:!1,tap:F,canceled:!1,cancel:v,event:l}),x()},p=l=>{const f=a.current;if(!f.isActive||l.pointerId!==f.pointerId)return;const E=b([l.clientX-f.startXY[0],l.clientY-f.startXY[1]]);s.current({xy:[l.clientX,l.clientY],initial:[...f.startXY],movement:E,delta:[0,0],distance:[Math.abs(E[0]),Math.abs(E[1])],direction:[0,0],velocity:[0,0],elapsedTime:l.timeStamp-f.startTimestamp,first:!f.firstFired,last:!0,active:!1,tap:!1,canceled:!0,cancel:v,event:l}),x()};return d.addEventListener("pointerdown",m,{signal:h.signal}),()=>{var l;h.abort(),(l=c.current)==null||l.abort(),c.current=null,a.current.isActive&&(a.current.isActive=!1,r(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="")}},[]),active:n}}function ho(e){return typeof e=="string"||typeof e=="number"||typeof e=="boolean"||typeof e=="bigint"}function De(e,t){return Array.isArray(e)?[...e].reduce((n,r)=>({...n,...De(r,t)}),{}):typeof e=="function"?e(t):e??{}}const mo={transitionDuration:200,transitionTimingFunction:"ease",animateOpacity:!0,orientation:"vertical"},Xt=je(e=>{const{children:t,expanded:n,transitionDuration:r,transitionTimingFunction:s,style:o,onTransitionEnd:a,onTransitionStart:c,animateOpacity:d,keepMounted:h,ref:b,orientation:x,...v}=de("Collapse",mo,e),k=pn(),m=Ne(),w=ut(),g=m.respectReducedMotion&&w?0:r,p=(x==="horizontal"?co:ao)({expanded:n,transitionDuration:g,transitionTimingFunction:s,onTransitionEnd:a,onTransitionStart:c,keepMounted:!1});if(g===0)return h===!0&&k!=="test"?i.jsx(u.Activity,{mode:n?"visible":"hidden",children:i.jsx(j,{...v,children:t})}):n?i.jsx(j,{...v,children:t}):null;const l=p.state==="exited";let f;return h===!1?f=l?null:t:h===!0?f=i.jsx(u.Activity,{mode:l?"hidden":"visible",children:t}):f=t,i.jsx(j,{...v,...p.getCollapseProps({style:{opacity:n||!d?1:0,transition:d?`opacity ${g}ms ${s}`:"none",...De(o,m)},ref:b}),children:f})});Xt.displayName="@mantine/core/Collapse";const go={duration:100,transition:"fade"};function Et(e,t){return{...go,...t,...e}}function bo(e,t){if(!t||!e)return!1;let n=t.parentNode;for(;n!=null;){if(n===e)return!0;n=n.parentNode}return!1}function vo({target:e,parent:t,ref:n,displayAfterTransitionEnd:r,onTransitionStart:s,onTransitionEnd:o}){const a=u.useRef(-1),c=u.useRef(e),[d,h]=u.useState(!1),[b,x]=u.useState(typeof r=="boolean"?r:!1),v=()=>{if(!e||!t||!n.current)return;const g=e.getBoundingClientRect(),p=t.getBoundingClientRect(),l=window.getComputedStyle(e),f=window.getComputedStyle(t),E=Ae(l.borderTopWidth)+Ae(f.borderTopWidth),R=Ae(l.borderLeftWidth)+Ae(f.borderLeftWidth),S={top:g.top-p.top-E,left:g.left-p.left-R,width:g.width,height:g.height};n.current.style.transform=`translateY(${S.top}px) translateX(${S.left}px)`,n.current.style.width=`${S.width}px`,n.current.style.height=`${S.height}px`},k=()=>{window.clearTimeout(a.current),n.current&&(n.current.style.transitionDuration="0ms"),v(),a.current=window.setTimeout(()=>{n.current&&(n.current.style.transitionDuration="")},30)},m=u.useRef(null),w=u.useRef(null);return u.useEffect(()=>{if(d&&c.current!==e&&s&&s(),c.current=e,v(),e)return m.current=new ResizeObserver(k),m.current.observe(e),t&&(w.current=new ResizeObserver(k),w.current.observe(t)),()=>{var g,p;(g=m.current)==null||g.disconnect(),(p=w.current)==null||p.disconnect()}},[t,e]),u.useEffect(()=>{if(t){const g=p=>{bo(p.target,t)&&(k(),x(!1))};return t.addEventListener("transitionend",g),()=>{t.removeEventListener("transitionend",g)}}},[t]),u.useEffect(()=>{if(n.current&&o){const g=p=>{p.propertyName==="transform"&&o()};return n.current.addEventListener("transitionend",g),()=>{var p;(p=n.current)==null||p.removeEventListener("transitionend",g)}}},[o]),oo(()=>{qn()!=="test"&&h(!0)},20,{autoInvoke:!0}),ro(g=>{g.forEach(p=>{p.type==="attributes"&&p.attributeName==="dir"&&k()})},{attributes:!0,attributeFilter:["dir"]},()=>document.documentElement),{initialized:d,hidden:b}}var Yt={root:"m_96b553a6"};const Ut=Re((e,{transitionDuration:t},{shouldReduceMotion:n})=>({root:{"--transition-duration":e.respectReducedMotion&&n?"0ms":typeof t=="number"?`${t}ms`:t||"150ms"}})),Ge=je(e=>{const t=de("FloatingIndicator",null,e),{classNames:n,className:r,style:s,styles:o,unstyled:a,vars:c,target:d,parent:h,transitionDuration:b,mod:x,displayAfterTransitionEnd:v,onTransitionStart:k,onTransitionEnd:m,attributes:w,ref:g,...p}=t,l=ke({name:"FloatingIndicator",classes:Yt,props:t,className:r,style:s,classNames:n,styles:o,unstyled:a,attributes:w,vars:c,varsResolver:Ut,stylesCtx:{shouldReduceMotion:ut()}}),f=u.useRef(null),{initialized:E,hidden:R}=vo({target:d,parent:h,ref:f,displayAfterTransitionEnd:v,onTransitionStart:k,onTransitionEnd:m}),S=Oe(g,f);return!d||!h?null:i.jsx(j,{ref:S,mod:[{initialized:E,hidden:R},x],...l("root"),...p})});Ge.displayName="@mantine/core/FloatingIndicator";Ge.classes=Yt;Ge.varsResolver=Ut;var Ht={root:"m_a513464",icon:"m_a4ceffb",loader:"m_b0920b15",body:"m_a49ed24",title:"m_3feedf16",description:"m_3d733a3a",closeButton:"m_919a4d88"};const yo={withCloseButton:!0},Wt=Re((e,{radius:t,color:n})=>({root:{"--notification-radius":t===void 0?void 0:Be(t),"--notification-color":n?ft(n,e):void 0}})),qe=je(e=>{const t=de("Notification",yo,e),{className:n,color:r,radius:s,loading:o,withCloseButton:a,withBorder:c,title:d,icon:h,children:b,onClose:x,closeButtonProps:v,classNames:k,style:m,styles:w,unstyled:g,vars:p,mod:l,loaderProps:f,role:E,attributes:R,...S}=t,y=ke({name:"Notification",classes:Ht,props:t,className:n,style:m,classNames:k,styles:w,unstyled:g,attributes:R,vars:p,varsResolver:Wt});return i.jsxs(j,{...y("root"),mod:[{"data-with-icon":!!h||o,"data-with-border":c},l],role:E||"alert",...S,children:[h&&!o&&i.jsx("div",{...y("icon"),children:h}),o&&i.jsx(Nt,{size:28,color:r,...y("loader"),...f}),i.jsxs("div",{...y("body"),children:[d&&i.jsx("div",{...y("title"),children:d}),i.jsx(j,{...y("description"),mod:{"data-with-title":!!d},children:b})]}),a&&i.jsx(hn,{iconSize:16,color:"gray",...v,unstyled:g,onClick:T=>{var N;(N=v==null?void 0:v.onClick)==null||N.call(v,T),x==null||x()},...y("closeButton")})]})});qe.classes=Ht;qe.varsResolver=Wt;qe.displayName="@mantine/core/Notification";function xo({offset:e,position:t,defaultOpened:n}){const[r,s]=u.useState(n),o=u.useRef(null),{x:a,y:c,elements:d,refs:h,update:b,placement:x}=Ot({placement:t,middleware:[zt({crossAxis:!0,padding:5,rootBoundary:"document"})]}),v=x.includes("right")?e:t.includes("left")?e*-1:0,k=x.includes("bottom")?e:t.includes("top")?e*-1:0,m=u.useCallback(({clientX:w,clientY:g})=>{h.setPositionReference({getBoundingClientRect(){return{width:0,height:0,x:w,y:g,left:w+v,top:g+k,right:w,bottom:g}}})},[d.reference]);return u.useEffect(()=>{if(h.floating.current){const w=o.current;w.addEventListener("mousemove",m);const g=mn(h.floating.current);return g.forEach(p=>{p.addEventListener("scroll",b)}),()=>{w.removeEventListener("mousemove",m),g.forEach(p=>{p.removeEventListener("scroll",b)})}}},[d.reference,h.floating.current,b,m,r]),{handleMouseMove:m,x:a,y:c,opened:r,setOpened:s,boundaryRef:o,floating:h.setFloating}}var Je={tooltip:"m_1b3c8819",arrow:"m_f898399f"};const wo={refProp:"ref",withinPortal:!0,offset:10,position:"right",zIndex:pt("popover")},Vt=Re((e,{radius:t,color:n})=>({tooltip:{"--tooltip-radius":t===void 0?void 0:Be(t),"--tooltip-bg":n?ft(n,e):void 0,"--tooltip-color":n?"var(--mantine-color-white)":void 0}})),Ke=je(e=>{const t=de("TooltipFloating",wo,e),{children:n,refProp:r,withinPortal:s,style:o,className:a,classNames:c,styles:d,unstyled:h,radius:b,color:x,label:v,offset:k,position:m,multiline:w,zIndex:g,disabled:p,defaultOpened:l,variant:f,vars:E,portalProps:R,attributes:S,ref:y,...T}=t,N=Ne(),F=ke({name:"TooltipFloating",props:t,classes:Je,className:a,style:o,classNames:c,styles:d,unstyled:h,attributes:S,rootSelector:"tooltip",vars:E,varsResolver:Vt}),{handleMouseMove:O,x:A,y:z,opened:L,boundaryRef:G,floating:Q,setOpened:U}=xo({offset:k,position:m,defaultOpened:l}),$=$t(n);if(!$)throw new Error("[@mantine/core] Tooltip.Floating component children should be an element or a component that accepts ref, fragments, strings, numbers and other primitive values are not supported");const q=Oe(G,It($),y),I=$.props,D=X=>{var M;(M=I.onMouseEnter)==null||M.call(I,X),O(X),U(!0)},W=X=>{var M;(M=I.onMouseLeave)==null||M.call(I,X),U(!1)};return i.jsxs(i.Fragment,{children:[i.jsx(Ye,{...R,withinPortal:s,children:i.jsx(j,{...T,...F("tooltip",{style:{...De(o,N),zIndex:g,display:!p&&L?"block":"none",top:(z&&Math.round(z))??"",left:(A&&Math.round(A))??""}}),variant:f,ref:Q,mod:{multiline:w},children:v})}),u.cloneElement($,{...I,[r]:q,onMouseEnter:D,onMouseLeave:W})]})});Ke.classes=Je;Ke.varsResolver=Vt;Ke.displayName="@mantine/core/TooltipFloating";const Bt=u.createContext({withinGroup:!1}),So={openDelay:0,closeDelay:0};function ht(e){const{openDelay:t,closeDelay:n,children:r}=de("TooltipGroup",So,e);return i.jsx(Bt,{value:{withinGroup:!0},children:i.jsx(gn,{delay:{open:t,close:n},children:r})})}ht.displayName="@mantine/core/TooltipGroup";ht.extend=e=>e;function Eo(e){if(e===void 0)return{shift:!0,flip:!0};const t={...e};return e.shift===void 0&&(t.shift=!0),e.flip===void 0&&(t.flip=!0),t}function jo(e){const t=Eo(e.middlewares),n=[jn(e.offset)];return t.shift&&n.push(zt(typeof t.shift=="boolean"?{padding:8}:{padding:8,...t.shift})),t.flip&&n.push(typeof t.flip=="boolean"?gt():gt(t.flip)),n.push(kn({element:e.arrowRef,padding:e.arrowOffset})),t.inline?n.push(typeof t.inline=="boolean"?tt():tt(t.inline)):e.inline&&n.push(tt()),n}function ko(e){var E,R,S;const[t,n]=u.useState(e.defaultOpened),r=typeof e.opened=="boolean"?e.opened:t,s=u.use(Bt).withinGroup,o=Ft(),a=u.useCallback(y=>{n(y),y&&g(o)},[o]),{x:c,y:d,context:h,refs:b,placement:x,middlewareData:{arrow:{x:v,y:k}={}}}=Ot({strategy:e.strategy,placement:e.position,open:r,onOpenChange:a,middleware:jo(e),whileElementsMounted:bn}),{delay:m,currentId:w,setCurrentId:g}=vn(h,{id:o}),{getReferenceProps:p,getFloatingProps:l}=yn([xn(h,{enabled:(E=e.events)==null?void 0:E.hover,delay:s?m:{open:e.openDelay,close:e.closeDelay},mouseOnly:!((R=e.events)!=null&&R.touch)}),wn(h,{enabled:(S=e.events)==null?void 0:S.focus,visibleOnly:!0}),Sn(h,{role:"tooltip"}),En(h,{enabled:typeof e.opened>"u"})]);Ve(()=>{var y;(y=e.onPositionChange)==null||y.call(e,x)},[x]);const f=r&&w&&w!==o;return{x:c,y:d,arrowX:v,arrowY:k,reference:b.setReference,floating:b.setFloating,getFloatingProps:l,getReferenceProps:p,isGroupPhase:f,opened:r,placement:x}}const Ro={position:"top",refProp:"ref",withinPortal:!0,arrowSize:4,arrowOffset:5,arrowRadius:0,arrowPosition:"side",offset:5,transitionProps:{duration:100,transition:"fade"},events:{hover:!0,focus:!1,touch:!1},zIndex:pt("popover"),middlewares:{flip:!0,shift:!0,inline:!1}},Gt=Re((e,{radius:t,color:n,variant:r,autoContrast:s})=>{const o=e.variantColorResolver({theme:e,color:n||e.primaryColor,autoContrast:s,variant:r||"filled"});return{tooltip:{"--tooltip-radius":t===void 0?void 0:Be(t),"--tooltip-bg":n?o.background:void 0,"--tooltip-color":n?o.color:void 0}}}),se=je(e=>{const t=de("Tooltip",Ro,e),{children:n,position:r,refProp:s,label:o,openDelay:a,closeDelay:c,onPositionChange:d,opened:h,defaultOpened:b,withinPortal:x,radius:v,color:k,classNames:m,styles:w,unstyled:g,style:p,className:l,withArrow:f,arrowSize:E,arrowOffset:R,arrowRadius:S,arrowPosition:y,offset:T,transitionProps:N,multiline:F,events:O,zIndex:A,disabled:z,onClick:L,onMouseEnter:G,onMouseLeave:Q,inline:U,variant:$,keepMounted:q,vars:I,portalProps:D,mod:W,floatingStrategy:X,middlewares:M,autoContrast:ae,attributes:Y,target:H,ref:ve,...ue}=t,{dir:fe}=Rn(),C=u.useRef(null),P=ko({position:_n(fe,r),closeDelay:c,openDelay:a,onPositionChange:d,opened:h,defaultOpened:b,events:O,arrowRef:C,arrowOffset:R,offset:typeof T=="number"?T+(f?E/2:0):T,inline:U,strategy:X,middlewares:M});u.useEffect(()=>{const oe=H instanceof HTMLElement?H:typeof H=="string"?document.querySelector(H):(H==null?void 0:H.current)||null;oe&&P.reference(oe)},[H,P]);const Z=ke({name:"Tooltip",props:t,classes:Je,className:l,style:p,classNames:m,styles:w,unstyled:g,attributes:Y,rootSelector:"tooltip",vars:I,varsResolver:Gt}),ye=$t(n);if(!H&&!ye)throw new Error("[@mantine/core] Tooltip component children should be an element or a component that accepts ref, fragments, strings, numbers and other primitive values are not supported");const Ce=Z("tooltip");if(H){const oe=Et(N,{duration:100,transition:"fade"});return i.jsx(i.Fragment,{children:i.jsx(Ye,{...D,withinPortal:x,children:i.jsx(bt,{...oe,keepMounted:q,mounted:!z&&!!P.opened,duration:P.isGroupPhase?10:oe.duration,children:Ze=>i.jsxs(j,{...ue,"data-fixed":X==="fixed"||void 0,variant:$,mod:[{multiline:F},W],...Ce,...P.getFloatingProps({ref:P.floating,className:Ce.className,style:{...Ce.style,...Ze,zIndex:A,top:P.y??0,left:P.x??0}}),children:[o,i.jsx(vt,{ref:C,arrowX:P.arrowX,arrowY:P.arrowY,visible:f,position:P.placement,arrowSize:E,arrowOffset:R,arrowRadius:S,arrowPosition:y,...Z("arrow")})]})})})})}const ze=ye.props,le=Oe(P.reference,It(ye),ve),$e=Et(N,{duration:100,transition:"fade"});return i.jsxs(i.Fragment,{children:[i.jsx(Ye,{...D,withinPortal:x,children:i.jsx(bt,{...$e,keepMounted:q,mounted:!z&&!!P.opened,duration:P.isGroupPhase?10:$e.duration,children:oe=>i.jsxs(j,{...ue,"data-fixed":X==="fixed"||void 0,variant:$,mod:[{multiline:F},W],...P.getFloatingProps({ref:P.floating,className:Z("tooltip").className,style:{...Z("tooltip").style,...oe,zIndex:A,top:P.y??0,left:P.x??0}}),children:[o,i.jsx(vt,{ref:C,arrowX:P.arrowX,arrowY:P.arrowY,visible:f,position:P.placement,arrowSize:E,arrowOffset:R,arrowRadius:S,arrowPosition:y,...Z("arrow")})]})})}),u.cloneElement(ye,P.getReferenceProps({onClick:L,onMouseEnter:G,onMouseLeave:Q,onMouseMove:t.onMouseMove,onPointerDown:t.onPointerDown,onPointerEnter:t.onPointerEnter,...ze,className:Cn(l,ze.className),[s]:le}))]})});se.classes=Je;se.varsResolver=Gt;se.displayName="@mantine/core/Tooltip";se.Floating=Ke;se.Group=ht;var qt={root:"m_cf365364",indicator:"m_9e182ccd",label:"m_1738fcb2",input:"m_1714d588",control:"m_69686b9b",innerLabel:"m_78882f40"};const _o={withItemsBorders:!0},Jt=Re((e,{radius:t,color:n,transitionDuration:r,size:s,transitionTimingFunction:o})=>({root:{"--sc-radius":t===void 0?void 0:Be(t),"--sc-color":n?ft(n,e):void 0,"--sc-shadow":n?void 0:"var(--mantine-shadow-xs)","--sc-transition-duration":r===void 0?void 0:`${r}ms`,"--sc-transition-timing-function":o,"--sc-padding":Nn(s,"sc-padding"),"--sc-font-size":Dn(s)}})),Qe=Mn(e=>{var ue,fe;const t=de("SegmentedControl",_o,e),{classNames:n,className:r,style:s,styles:o,unstyled:a,vars:c,data:d,value:h,defaultValue:b,onChange:x,size:v,name:k,disabled:m,readOnly:w,fullWidth:g,orientation:p,radius:l,color:f,transitionDuration:E,transitionTimingFunction:R,variant:S,autoContrast:y,withItemsBorders:T,mod:N,attributes:F,ref:O,...A}=t,z=ke({name:"SegmentedControl",props:t,classes:qt,className:r,style:s,classNames:n,styles:o,unstyled:a,attributes:F,vars:c,varsResolver:Jt}),L=Ne(),G=d.map(C=>ho(C)?{label:`${C}`,value:C}:C),Q=so(),[U,$]=u.useState(yt()),[q,I]=u.useState(null),[D,W]=u.useState({}),X=(C,P)=>{D[P]=C,W(D)},[M,ae]=Pn({value:h,defaultValue:b,finalValue:Array.isArray(d)?((ue=G.find(C=>!C.disabled))==null?void 0:ue.value)??((fe=d[0])==null?void 0:fe.value)??null:null,onChange:x}),Y=Ft(k),H=G.map(C=>u.createElement(j,{...z("control"),mod:{active:M===C.value,orientation:p},key:`${C.value}`},u.createElement("input",{...z("input"),disabled:m||C.disabled,type:"radio",name:Y,value:`${C.value}`,id:`${Y}-${C.value}`,checked:M===C.value,onChange:()=>!w&&ae(C.value),"data-focus-ring":L.focusRing,key:`${C.value}-input`}),u.createElement(j,{component:"label",...z("label"),mod:{active:M===C.value&&!(m||C.disabled),disabled:m||C.disabled,"read-only":w},htmlFor:`${Y}-${C.value}`,ref:P=>X(P,`${C.value}`),__vars:{"--sc-label-color":f!==void 0?Tn({color:f,theme:L,autoContrast:y}):void 0},key:`${C.value}-label`},i.jsx("span",{...z("innerLabel"),children:C.label})))),ve=Oe(O,I);return no(()=>{$(yt())},[d.length]),d.length===0?null:i.jsxs(j,{...z("root"),variant:S,size:v,ref:ve,mod:[{"full-width":g,orientation:p,initialized:Q,"with-items-borders":T},N],...A,role:"radiogroup","data-disabled":m,children:[typeof M<"u"&&i.jsx(Ge,{target:D[`${M}`],parent:q,component:"span",transitionDuration:"var(--sc-transition-duration)",...z("indicator")},U),H]})});Qe.classes=qt;Qe.varsResolver=Jt;Qe.displayName="@mantine/core/SegmentedControl";const Kt=["bottom-center","bottom-left","bottom-right","top-center","top-left","top-right"];function Co(e,t){return e.reduce((n,r)=>(n[r.position||t].push(r),n),Kt.reduce((n,r)=>(n[r]=[],n),{}))}const jt={left:"translateX(-100%)",right:"translateX(100%)","top-center":"translateY(-100%)","bottom-center":"translateY(100%)"},Mo={left:"translateX(0)",right:"translateX(0)","top-center":"translateY(0)","bottom-center":"translateY(0)"};function Po({state:e,maxHeight:t,position:n,transitionDuration:r}){const[s,o]=n.split("-"),a=o==="center"?`${s}-center`:o,c={opacity:0,maxHeight:t,transform:jt[a],transitionDuration:`${r}ms, ${r}ms, ${r}ms`,transitionTimingFunction:"cubic-bezier(.51,.3,0,1.21), cubic-bezier(.51,.3,0,1.21), linear",transitionProperty:"opacity, transform, max-height"},d={opacity:1,transform:Mo[a]},h={opacity:0,maxHeight:0,transform:jt[a]};return{...c,...{entering:d,entered:d,exiting:h,exited:h}[e]}}function To(e,t){return typeof t=="number"?t:t===!1||e===!1?!1:e}const Do=120;function Qt({data:e,onHide:t,autoClose:n,transitionDuration:r,allowDragDismiss:s,allowScrollDismiss:o,paused:a,onHoverStart:c,onHoverEnd:d,ref:h,style:b,...x}){const[v,k]=u.useState(0),[m,w]=u.useState(!1),[g,p]=u.useState(1),[l,f]=u.useState(!1),E=Ne(),{autoClose:R,message:S,allowClose:y,position:T,style:N,withCloseButton:F,onOpen:O,...A}=e,z=To(n,e.autoClose),L=u.useRef(-1),G=u.useRef(-1),Q=u.useRef(-1),U=u.useRef(null),$=u.useRef(!1),q=u.useRef(0),I=y===!1,D=()=>window.clearTimeout(L.current),W=()=>window.clearTimeout(G.current),X=()=>window.clearTimeout(Q.current),M=_=>{q.current=_,k(_)},ae=()=>{t(e.id),D(),W(),X()},Y=()=>{m||Z||a||$.current||typeof z!="number"||(L.current=window.setTimeout(ae,z))},H=_=>{var J;return _*((((J=U.current)==null?void 0:J.offsetWidth)??440)+40)},ve=(_,J)=>{var Fe;const pe=((Fe=U.current)==null?void 0:Fe.offsetWidth)??440;return Math.abs(_)>pe*.35||J>.5},ue=()=>{X(),f(!1),M(0)},fe=_=>{p(_),w(!0),f(!1),M(H(_)),D(),W(),X(),G.current=window.setTimeout(ae,r)},C=()=>{X(),Q.current=window.setTimeout(()=>{f(!1),M(0),Y()},Do)},{ref:P,active:Z}=po(_=>{if(!m)if(_.first&&D(),_.last){if(_.tap||_.canceled){M(0),Y();return}const J=_.movement[0],pe=J===0?_.direction[0]===-1?-1:1:J>0?1:-1;ve(J,_.velocity[0])?fe(pe):(M(0),Y())}else M(_.movement[0])},{axis:"x",threshold:5,filterTaps:!0,enabled:s&&!I&&!m}),ye=Oe(h,U,P),Ce=De(b,E),ze=De(N,E),le={...Ce,...ze},$e=typeof le.opacity=="number"?le.opacity:1,oe=m?0:1-Math.min(Math.abs(v)/200,1)*.6,Ze=le.transitionDuration??`${r}ms, ${r}ms, ${r}ms`,ln={...le,"--notifications-state-transform":typeof le.transform=="string"?le.transform:"translateX(0)","--notifications-state-opacity":String($e),"--notifications-swipe-offset":`${v}px`,"--notifications-swipe-opacity":String(oe),transform:"var(--notifications-state-transform) translate3d(var(--notifications-swipe-offset), 0, 0)",opacity:"calc(var(--notifications-state-opacity) * var(--notifications-swipe-opacity))",transitionDuration:Z||l?"0ms, 0ms, 0ms":Ze,cursor:"default",touchAction:"pan-y"},cn=()=>{$.current=!0,D(),c==null||c()},dn=()=>{$.current=!1,l||(ue(),Y()),d==null||d()},Ie=u.useEffectEvent(_=>{if(m||Z)return;const J=_.currentTarget===document;if(!J&&!$.current)return;const{deltaX:pe,deltaY:Fe}=_;if(Math.abs(pe)<=Math.abs(Fe)||pe===0||!o||I)return;J||(_.preventDefault(),_.stopPropagation()),D(),f(!0);const et=q.current-pe,un=et>0?1:-1;if(ve(et,0)){fe(un);return}M(et),C()});return u.useEffect(()=>{if(l)return document.addEventListener("wheel",Ie,{passive:!1}),()=>document.removeEventListener("wheel",Ie,{passive:!1})},[l]),u.useEffect(()=>{const _=()=>{m&&M(H(g))};return window.addEventListener("resize",_),()=>window.removeEventListener("resize",_)},[g,m]),u.useEffect(()=>{const _=U.current;if(_)return _.addEventListener("wheel",Ie,{passive:!1}),()=>_.removeEventListener("wheel",Ie,{passive:!1})},[]),u.useEffect(()=>()=>{W(),X()},[]),u.useEffect(()=>{var _;(_=e.onOpen)==null||_.call(e,e)},[]),u.useEffect(()=>(Y(),D),[z,Z,m]),u.useEffect(()=>(a?D():Y(),D),[a]),i.jsx(qe,{ref:ye,...x,style:ln,...A,withCloseButton:I?!1:F,onClose:ae,onMouseEnter:cn,onMouseLeave:dn,children:S})}Qt.displayName="@mantine/notifications/NotificationContainer";var Zt={root:"m_b37d9ac7",notification:"m_5ed0edd0"};function at(){return at=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)({}).hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e},at.apply(null,arguments)}function en(e,t){if(e==null)return{};var n={};for(var r in e)if({}.hasOwnProperty.call(e,r)){if(t.indexOf(r)!==-1)continue;n[r]=e[r]}return n}function lt(e,t){return lt=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(n,r){return n.__proto__=r,n},lt(e,t)}function tn(e,t){e.prototype=Object.create(t.prototype),e.prototype.constructor=e,lt(e,t)}const kt={disabled:!1},He=ee.createContext(null);var No=function(t){return t.scrollTop},Pe="unmounted",he="exited",me="entering",Se="entered",ct="exiting",ie=(function(e){tn(t,e);function t(r,s){var o;o=e.call(this,r,s)||this;var a=s,c=a&&!a.isMounting?r.enter:r.appear,d;return o.appearStatus=null,r.in?c?(d=he,o.appearStatus=me):d=Se:r.unmountOnExit||r.mountOnEnter?d=Pe:d=he,o.state={status:d},o.nextCallback=null,o}t.getDerivedStateFromProps=function(s,o){var a=s.in;return a&&o.status===Pe?{status:he}:null};var n=t.prototype;return n.componentDidMount=function(){this.updateStatus(!0,this.appearStatus)},n.componentDidUpdate=function(s){var o=null;if(s!==this.props){var a=this.state.status;this.props.in?a!==me&&a!==Se&&(o=me):(a===me||a===Se)&&(o=ct)}this.updateStatus(!1,o)},n.componentWillUnmount=function(){this.cancelNextCallback()},n.getTimeouts=function(){var s=this.props.timeout,o,a,c;return o=a=c=s,s!=null&&typeof s!="number"&&(o=s.exit,a=s.enter,c=s.appear!==void 0?s.appear:a),{exit:o,enter:a,appear:c}},n.updateStatus=function(s,o){if(s===void 0&&(s=!1),o!==null)if(this.cancelNextCallback(),o===me){if(this.props.unmountOnExit||this.props.mountOnEnter){var a=this.props.nodeRef?this.props.nodeRef.current:Le.findDOMNode(this);a&&No(a)}this.performEnter(s)}else this.performExit();else this.props.unmountOnExit&&this.state.status===he&&this.setState({status:Pe})},n.performEnter=function(s){var o=this,a=this.props.enter,c=this.context?this.context.isMounting:s,d=this.props.nodeRef?[c]:[Le.findDOMNode(this),c],h=d[0],b=d[1],x=this.getTimeouts(),v=c?x.appear:x.enter;if(!s&&!a||kt.disabled){this.safeSetState({status:Se},function(){o.props.onEntered(h)});return}this.props.onEnter(h,b),this.safeSetState({status:me},function(){o.props.onEntering(h,b),o.onTransitionEnd(v,function(){o.safeSetState({status:Se},function(){o.props.onEntered(h,b)})})})},n.performExit=function(){var s=this,o=this.props.exit,a=this.getTimeouts(),c=this.props.nodeRef?void 0:Le.findDOMNode(this);if(!o||kt.disabled){this.safeSetState({status:he},function(){s.props.onExited(c)});return}this.props.onExit(c),this.safeSetState({status:ct},function(){s.props.onExiting(c),s.onTransitionEnd(a.exit,function(){s.safeSetState({status:he},function(){s.props.onExited(c)})})})},n.cancelNextCallback=function(){this.nextCallback!==null&&(this.nextCallback.cancel(),this.nextCallback=null)},n.safeSetState=function(s,o){o=this.setNextCallback(o),this.setState(s,o)},n.setNextCallback=function(s){var o=this,a=!0;return this.nextCallback=function(c){a&&(a=!1,o.nextCallback=null,s(c))},this.nextCallback.cancel=function(){a=!1},this.nextCallback},n.onTransitionEnd=function(s,o){this.setNextCallback(o);var a=this.props.nodeRef?this.props.nodeRef.current:Le.findDOMNode(this),c=s==null&&!this.props.addEndListener;if(!a||c){setTimeout(this.nextCallback,0);return}if(this.props.addEndListener){var d=this.props.nodeRef?[this.nextCallback]:[a,this.nextCallback],h=d[0],b=d[1];this.props.addEndListener(h,b)}s!=null&&setTimeout(this.nextCallback,s)},n.render=function(){var s=this.state.status;if(s===Pe)return null;var o=this.props,a=o.children;o.in,o.mountOnEnter,o.unmountOnExit,o.appear,o.enter,o.exit,o.timeout,o.addEndListener,o.onEnter,o.onEntering,o.onEntered,o.onExit,o.onExiting,o.onExited,o.nodeRef;var c=en(o,["children","in","mountOnEnter","unmountOnExit","appear","enter","exit","timeout","addEndListener","onEnter","onEntering","onEntered","onExit","onExiting","onExited","nodeRef"]);return ee.createElement(He.Provider,{value:null},typeof a=="function"?a(s,c):ee.cloneElement(ee.Children.only(a),c))},t})(ee.Component);ie.contextType=He;ie.propTypes={};function we(){}ie.defaultProps={in:!1,mountOnEnter:!1,unmountOnExit:!1,appear:!1,enter:!0,exit:!0,onEnter:we,onEntering:we,onEntered:we,onExit:we,onExiting:we,onExited:we};ie.UNMOUNTED=Pe;ie.EXITED=he;ie.ENTERING=me;ie.ENTERED=Se;ie.EXITING=ct;function Oo(e){if(e===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}function mt(e,t){var n=function(o){return t&&u.isValidElement(o)?t(o):o},r=Object.create(null);return e&&u.Children.map(e,function(s){return s}).forEach(function(s){r[s.key]=n(s)}),r}function zo(e,t){e=e||{},t=t||{};function n(b){return b in t?t[b]:e[b]}var r=Object.create(null),s=[];for(var o in e)o in t?s.length&&(r[o]=s,s=[]):s.push(o);var a,c={};for(var d in t){if(r[d])for(a=0;a<r[d].length;a++){var h=r[d][a];c[r[d][a]]=n(h)}c[d]=n(d)}for(a=0;a<s.length;a++)c[s[a]]=n(s[a]);return c}function ge(e,t,n){return n[t]!=null?n[t]:e.props[t]}function $o(e,t){return mt(e.children,function(n){return u.cloneElement(n,{onExited:t.bind(null,n),in:!0,appear:ge(n,"appear",e),enter:ge(n,"enter",e),exit:ge(n,"exit",e)})})}function Io(e,t,n){var r=mt(e.children),s=zo(t,r);return Object.keys(s).forEach(function(o){var a=s[o];if(u.isValidElement(a)){var c=o in t,d=o in r,h=t[o],b=u.isValidElement(h)&&!h.props.in;d&&(!c||b)?s[o]=u.cloneElement(a,{onExited:n.bind(null,a),in:!0,exit:ge(a,"exit",e),enter:ge(a,"enter",e)}):!d&&c&&!b?s[o]=u.cloneElement(a,{in:!1}):d&&c&&u.isValidElement(h)&&(s[o]=u.cloneElement(a,{onExited:n.bind(null,a),in:h.props.in,exit:ge(a,"exit",e),enter:ge(a,"enter",e)}))}}),s}var Fo=Object.values||function(e){return Object.keys(e).map(function(t){return e[t]})},Ao={component:"div",childFactory:function(t){return t}},ce=(function(e){tn(t,e);function t(r,s){var o;o=e.call(this,r,s)||this;var a=o.handleExited.bind(Oo(o));return o.state={contextValue:{isMounting:!0},handleExited:a,firstRender:!0},o}var n=t.prototype;return n.componentDidMount=function(){this.mounted=!0,this.setState({contextValue:{isMounting:!1}})},n.componentWillUnmount=function(){this.mounted=!1},t.getDerivedStateFromProps=function(s,o){var a=o.children,c=o.handleExited,d=o.firstRender;return{children:d?$o(s,c):Io(s,a,c),firstRender:!1}},n.handleExited=function(s,o){var a=mt(this.props.children);s.key in a||(s.props.onExited&&s.props.onExited(o),this.mounted&&this.setState(function(c){var d=at({},c.children);return delete d[s.key],{children:d}}))},n.render=function(){var s=this.props,o=s.component,a=s.childFactory,c=en(s,["component","childFactory"]),d=this.state.contextValue,h=Fo(this.state.children).map(a);return delete c.appear,delete c.enter,delete c.exit,o===null?ee.createElement(He.Provider,{value:d},h):ee.createElement(He.Provider,{value:d},ee.createElement(o,c,h))},t})(ee.Component);ce.propTypes={};ce.defaultProps=Ao;const Lo=ie,Xo={position:"bottom-right",autoClose:4e3,transitionDuration:250,allowDragDismiss:!0,allowScrollDismiss:!0,containerWidth:440,notificationMaxHeight:200,limit:5,zIndex:pt("overlay"),store:Hn,withinPortal:!0,pauseResetOnHover:"all"},nn=Re((e,{zIndex:t,containerWidth:n})=>({root:{"--notifications-z-index":t==null?void 0:t.toString(),"--notifications-container-width":On(n)}})),ne=je(e=>{const t=de("Notifications",Xo,e),{classNames:n,className:r,style:s,styles:o,unstyled:a,vars:c,attributes:d,position:h,autoClose:b,transitionDuration:x,allowDragDismiss:v,allowScrollDismiss:k,containerWidth:m,notificationMaxHeight:w,limit:g,zIndex:p,store:l,portalProps:f,withinPortal:E,pauseResetOnHover:R,...S}=t,y=Ne(),T=Wn(l),N=Zn(),F=ut(),O=u.useRef({}),A=u.useRef(0),[z,L]=u.useState(0),G=u.useCallback(()=>L(D=>D+1),[]),Q=u.useCallback(()=>L(D=>Math.max(0,D-1)),[]),U=y.respectReducedMotion&&F?1:x,$=ke({name:"Notifications",classes:Zt,props:t,className:r,style:s,classNames:n,styles:o,unstyled:a,attributes:d,vars:c,varsResolver:nn});u.useEffect(()=>{l==null||l.updateState(D=>({...D,limit:g||5,defaultPosition:h}))},[g,h]),Ve(()=>{T.notifications.length>A.current&&setTimeout(()=>N(),0),A.current=T.notifications.length},[T.notifications]);const q=Co(T.notifications,h),I=Kt.reduce((D,W)=>(D[W]=q[W].map(({style:X,...M})=>i.jsx(Lo,{timeout:U,onEnter:()=>O.current[M.id].offsetHeight,nodeRef:{current:O.current[M.id]},children:ae=>i.jsx(Qt,{ref:Y=>{Y&&(O.current[M.id]=Y)},data:M,onHide:Y=>Vn(Y,l),autoClose:b,transitionDuration:U,allowDragDismiss:v,allowScrollDismiss:k,paused:R==="all"?z>0:!1,onHoverStart:G,onHoverEnd:Q,...$("notification",{style:{...Po({state:ae,position:W,transitionDuration:U,maxHeight:w}),...X}})})},M.id)),D),{});return i.jsxs(Ye,{withinPortal:E,...f,children:[i.jsx(j,{...$("root"),"data-position":"top-center",...S,children:i.jsx(ce,{children:I["top-center"]})}),i.jsx(j,{...$("root"),"data-position":"top-left",...S,children:i.jsx(ce,{children:I["top-left"]})}),i.jsx(j,{...$("root",{className:xt.classNames.fullWidth}),"data-position":"top-right",...S,children:i.jsx(ce,{children:I["top-right"]})}),i.jsx(j,{...$("root",{className:xt.classNames.fullWidth}),"data-position":"bottom-right",...S,children:i.jsx(ce,{children:I["bottom-right"]})}),i.jsx(j,{...$("root"),"data-position":"bottom-left",...S,children:i.jsx(ce,{children:I["bottom-left"]})}),i.jsx(j,{...$("root"),"data-position":"bottom-center",...S,children:i.jsx(ce,{children:I["bottom-center"]})})]})});ne.classes=Zt;ne.varsResolver=nn;ne.displayName="@mantine/notifications/Notifications";ne.show=_e.show;ne.hide=_e.hide;ne.update=_e.update;ne.clean=_e.clean;ne.cleanQueue=_e.cleanQueue;ne.updateState=_e.updateState;/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Yo=[["path",{d:"M5 12l14 0",key:"svg-0"}],["path",{d:"M5 12l6 6",key:"svg-1"}],["path",{d:"M5 12l6 -6",key:"svg-2"}]],Uo=B("outline","arrow-left","ArrowLeft",Yo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ho=[["path",{d:"M9 6l6 6l-6 6",key:"svg-0"}]],Wo=B("outline","chevron-right","ChevronRight",Ho);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Vo=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-2.5 2.5",key:"svg-1"}],["path",{d:"M14 4l-1.201 4.805m-.802 3.207l-2 7.988",key:"svg-2"}],["path",{d:"M3 3l18 18",key:"svg-3"}]],Bo=B("outline","code-off","CodeOff",Vo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Go=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-4 4",key:"svg-1"}],["path",{d:"M14 4l-4 16",key:"svg-2"}]],qo=B("outline","code","Code",Go);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Jo=[["path",{d:"M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10",key:"svg-0"}],["path",{d:"M7 20h10",key:"svg-1"}],["path",{d:"M9 16v4",key:"svg-2"}],["path",{d:"M15 16v4",key:"svg-3"}]],Ko=B("outline","device-desktop","DeviceDesktop",Jo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Qo=[["path",{d:"M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14",key:"svg-0"}],["path",{d:"M11 4h2",key:"svg-1"}],["path",{d:"M12 17v.01",key:"svg-2"}]],Zo=B("outline","device-mobile","DeviceMobile",Qo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const er=[["path",{d:"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2",key:"svg-0"}],["path",{d:"M7 11l5 5l5 -5",key:"svg-1"}],["path",{d:"M12 4l0 12",key:"svg-2"}]],tr=B("outline","download","Download",er);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const nr=[["path",{d:"M14 3v4a1 1 0 0 0 1 1h4",key:"svg-0"}],["path",{d:"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",key:"svg-1"}]],or=B("outline","file","File",nr);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const rr=[["path",{d:"M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2",key:"svg-0"}]],sr=B("outline","folder-open","FolderOpen",rr);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const ir=[["path",{d:"M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2",key:"svg-0"}]],ar=B("outline","folder","Folder",ir);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const lr=[["path",{d:"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6",key:"svg-0"}],["path",{d:"M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0",key:"svg-1"}],["path",{d:"M8 11v-4a4 4 0 1 1 8 0v4",key:"svg-2"}]],cr=B("outline","lock","Lock",lr);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const dr=[["path",{d:"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008",key:"svg-0"}]],ur=B("outline","moon","Moon",dr);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const fr=[["path",{d:"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",key:"svg-0"}],["path",{d:"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",key:"svg-1"}]],We=B("outline","refresh","Refresh",fr);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const pr=[["path",{d:"M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",key:"svg-0"}],["path",{d:"M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7",key:"svg-1"}]],hr=B("outline","sun","Sun",pr);function on({nodes:e,selected:t,onSelect:n}){return i.jsx(j,{component:"nav","aria-label":"Design files",children:e.map(r=>i.jsx(rn,{node:r,selected:t,onSelect:n,depth:0},r.modulePath??r.name))})}function rn({node:e,selected:t,onSelect:n,depth:r}){var d;const s=!!((d=e.children)!=null&&d.length),[o,a]=u.useState(!0);if(s)return i.jsxs(j,{children:[i.jsx(wt,{onClick:()=>a(h=>!h),w:"100%",py:4,pl:r*12+4,pr:8,style:{borderRadius:"var(--mantine-radius-sm)"},children:i.jsxs(j,{component:"span",style:{display:"flex",alignItems:"center",gap:4,minWidth:0},children:[i.jsx(Wo,{size:14,style:{flexShrink:0,transition:"transform 150ms ease",transform:o?"rotate(90deg)":void 0}}),o?i.jsx(sr,{size:16,style:{flexShrink:0}}):i.jsx(ar,{size:16,style:{flexShrink:0}}),i.jsx(K,{size:"sm",fw:500,truncate:!0,children:e.name})]})}),i.jsx(Xt,{expanded:o,children:e.children.map(h=>i.jsx(rn,{node:h,selected:t,onSelect:n,depth:r+1},h.modulePath??h.name))})]});const c=e.modulePath===t;return i.jsx(wt,{onClick:()=>e.modulePath&&n(e.modulePath),w:"100%",py:4,pl:r*12+24,pr:8,style:{borderRadius:"var(--mantine-radius-sm)",background:c?"var(--mantine-color-blue-light)":void 0},children:i.jsxs(j,{component:"span",style:{display:"flex",alignItems:"center",gap:6,minWidth:0},children:[i.jsx(or,{size:15,style:{flexShrink:0,opacity:.7}}),i.jsx(K,{size:"sm",truncate:!0,c:c?"blue":void 0,fw:c?500:void 0,children:e.name})]})})}function mr(e){const t=new URL("/frame.html",window.location.origin);return t.searchParams.set("design",e.design),t.searchParams.set("viewport",e.viewport),t.searchParams.set("scheme",e.scheme),t.searchParams.set("mode",e.mode),e.remountKey!=null&&t.searchParams.set("t",String(e.remountKey)),`${t.pathname}${t.search}`}function gr({url:e,design:t,viewport:n="desktop",scheme:r,mode:s,remountKey:o=0,onViewportChange:a}){const c=n==="mobile",d=mr({design:t,viewport:n,scheme:r,mode:s,remountKey:o});return i.jsxs(j,{style:{border:"1px solid var(--mantine-color-default-border)",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",background:"var(--mantine-color-body)",display:"flex",flexDirection:"column",width:"100%",maxWidth:c?390:1280,margin:"0 auto"},children:[i.jsxs(j,{style:{background:"var(--mantine-color-default-hover)",borderBottom:"1px solid var(--mantine-color-default-border)",padding:"10px 14px 10px",flexShrink:0},children:[i.jsxs(te,{gap:8,mb:10,justify:"space-between",children:[i.jsxs(te,{gap:8,children:[i.jsx(j,{style:{width:12,height:12,borderRadius:"50%",background:"#ff5f57",border:"1px solid rgba(0,0,0,0.12)"}}),i.jsx(j,{style:{width:12,height:12,borderRadius:"50%",background:"#febc2e",border:"1px solid rgba(0,0,0,0.12)"}}),i.jsx(j,{style:{width:12,height:12,borderRadius:"50%",background:"#28c840",border:"1px solid rgba(0,0,0,0.12)"}})]}),i.jsx(se,{label:c?"Switch to desktop":"Switch to mobile",withArrow:!0,children:i.jsx(re,{variant:"subtle",color:"gray",size:"sm","aria-label":c?"Switch to desktop":"Switch to mobile",onClick:()=>a==null?void 0:a(c?"desktop":"mobile"),children:c?i.jsx(Ko,{size:14}):i.jsx(Zo,{size:14})})})]}),i.jsxs(te,{gap:6,align:"center",children:[i.jsx(re,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Back",children:i.jsx(Uo,{size:14})}),i.jsx(re,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Forward",children:i.jsx(Jn,{size:14})}),i.jsx(re,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Reload",children:i.jsx(We,{size:14})}),i.jsxs(j,{style:{flex:1,background:"var(--mantine-color-default)",borderRadius:6,padding:"4px 10px",border:"1px solid var(--mantine-color-default-border)",display:"flex",alignItems:"center",gap:6},children:[i.jsx(cr,{size:11,color:"var(--mantine-color-green-6)",style:{flexShrink:0}}),i.jsx(K,{size:"xs",c:"dimmed",ff:"mono",truncate:!0,children:e})]})]})]}),i.jsx("iframe",{title:"Design preview",src:d,style:{width:"100%",height:c?700:600,border:0,display:"block",background:"var(--mantine-color-body)"}},d)]})}function Xe(e,t){const[n,r]=u.useState(()=>new URLSearchParams(window.location.search).get(e)??t),s=u.useCallback(o=>{const a=new URLSearchParams(window.location.search);o?a.set(e,o):a.delete(e),window.history.replaceState(null,"",`?${a.toString()}`),r(o)},[e]);return[n,s]}function rt(e,t){return t.trim().split(".").reduce((n,r)=>{if(n!=null&&typeof n=="object")return n[r]},e)}function Rt(e,t,n){const r=`{{#${n} `,s=`{{/${n}}}`;let o=1,a=t;for(;a<e.length;){const c=e.indexOf(r,a),d=e.indexOf(s,a);if(d===-1)throw new Error(`Unclosed {{#${n}}}`);if(c!==-1&&c<d)o++,a=c+r.length;else{if(o--,o===0)return{inner:e.slice(t,d),after:d+s.length};a=d+s.length}}throw new Error(`Unclosed {{#${n}}}`)}function br(e,t){return dt(e,t)}function dt(e,t){const n=[];let r=0;for(;r<e.length;){const s=e.indexOf("{{",r);if(s===-1){n.push(e.slice(r));break}s>r&&n.push(e.slice(r,s));const o=e.indexOf("}}",s+2);if(o===-1){n.push(e.slice(s));break}const a=e.slice(s+2,o).trim();if(a.startsWith("#each ")){const c=a.slice(6).trim(),{inner:d,after:h}=Rt(e,o+2,"each"),b=rt(t,c);if(Array.isArray(b))for(const x of b){const v=x!=null&&typeof x=="object"?{...t,...x}:t;n.push(dt(d,v))}r=h}else if(a.startsWith("#if ")){const c=a.slice(4).trim(),{inner:d,after:h}=Rt(e,o+2,"if");rt(t,c)&&n.push(dt(d,t)),r=h}else if(a.startsWith("/"))r=o+2;else{const c=rt(t,a);n.push(c!=null?String(c):""),r=o+2}}return n.join("")}const vr=`/* Shared base styles for every PDF template. Flat / minimal: monochrome,
   no fills, no rounded corners, no shadows. Templates link this file and
   add only the markup they need. */

@page {
  size: A4;
  margin: 10mm;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
  font-size: 10pt;
  color: #1a1a1a;
  line-height: 1.5;
}

.sub {
  color: #888;
  font-size: 8pt;
}

/* ─── Header: title + issuer ──────────────────── */
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24pt;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 16pt;
}

.doc-title {
  font-size: 22pt;
  font-weight: bold;
  letter-spacing: 0.1em;
}

.doc-number {
  font-size: 16pt;
  font-weight: bold;
}

.issuer {
  text-align: right;
  font-size: 9pt;
  color: #444;
}

.issuer strong {
  font-size: 11pt;
  color: #1a1a1a;
}

/* ─── Recipient + doc info ─────────────────────── */
.meta-row {
  display: flex;
  gap: 40pt;
  margin-bottom: 20pt;
}

.recipient-block {
  flex: 1;
}

.recipient-name {
  font-size: 14pt;
  font-weight: bold;
  border-bottom: 1.5pt solid #1a1a1a;
  padding-bottom: 4pt;
  margin-bottom: 6pt;
}

.recipient-name .onchu {
  font-size: 10pt;
  font-weight: normal;
}

.recipient-meta {
  font-size: 9pt;
  color: #555;
}

.doc-info {
  min-width: 200pt;
  font-size: 9pt;
}

.doc-info table {
  border-collapse: collapse;
  width: 100%;
}

.doc-info td {
  padding: 2pt 6pt;
}

.doc-info td:first-child {
  color: #666;
  white-space: nowrap;
}

.doc-info td:last-child {
  font-weight: bold;
}

/* ─── Strip: flat bordered band (notices / summaries) ─── */
.strip {
  border: 1pt solid #ddd;
  padding: 8pt 16pt;
  margin-bottom: 20pt;
  font-size: 9pt;
  color: #444;
}

.strip.between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.strip.row {
  display: flex;
  gap: 32pt;
  align-items: center;
}

.strip.center {
  justify-content: center;
  text-align: center;
  color: #888;
}

.strip .label {
  font-size: 9pt;
  color: #555;
}

.strip .amount {
  font-size: 18pt;
  font-weight: bold;
  color: #1a1a1a;
}

.strip .end {
  text-align: right;
}

.strip .cell-label {
  font-size: 8pt;
  color: #888;
}

.strip .cell-value {
  font-weight: bold;
  font-size: 10pt;
}

/* ─── Badge (default monochrome; modifiers add status color) ─── */
.badge {
  display: inline-block;
  border: 1pt solid #1a1a1a;
  padding: 1pt 8pt;
  font-size: 8pt;
  font-weight: bold;
}

.badge + .badge {
  margin-left: 4pt;
}

.badge.outsource {
  border-color: #c62828;
  background: #fce4ec;
  color: #c62828;
}

.badge.pending {
  border-color: #757575;
  background: #f5f5f5;
  color: #757575;
}

.badge.registered {
  border-color: #1565c0;
  background: #e3f2fd;
  color: #1565c0;
}

.badge.approved {
  border-color: #2e7d32;
  background: #e8f5e9;
  color: #2e7d32;
}

/* ─── Card grid (info / detail blocks) ─────────── */
.card-grid {
  display: grid;
  gap: 12pt;
  margin-bottom: 20pt;
}

.card-grid.cols-2 {
  grid-template-columns: 1fr 1fr;
}

.card-grid.cols-3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.card {
  border: 1pt solid #ddd;
  padding: 6pt 10pt;
}

.card h4 {
  font-size: 8pt;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8pt;
  padding-bottom: 4pt;
  border-bottom: 1pt solid #eee;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8pt;
  margin-bottom: 8pt;
  padding-bottom: 4pt;
  border-bottom: 1pt solid #eee;
}

.card-head h4 {
  padding-bottom: 0;
  margin: 2pt 0;
  border-bottom: none;
}

.card-badges {
  display: flex;
  gap: 4pt;
  flex-shrink: 0;
}

.kv {
  display: flex;
  justify-content: space-between;
  font-size: 9pt;
  /* margin-bottom: 3pt; */
}

.kv + .kv {
  margin-top: 3pt;
}

.kv .k {
  color: #666;
}

.kv .v {
  font-weight: bold;
  text-align: right;
}

/* ─── Section title ────────────────────────────── */
.section-title {
  font-size: 10pt;
  font-weight: bold;
  border-left: 3pt solid #1a1a1a;
  padding-left: 8pt;
  margin: 16pt 0 10pt;
}

/* ─── Invoice: grouped by 受注書 / 納品書 ──────── */
.items-table.invoice-items {
  margin-bottom: 12pt;
}

.items-table.invoice-items td {
  padding: 3pt 8pt;
}

.items-table.invoice-items .sub {
  display: block;
  margin-top: 1pt;
}

.items-table.invoice-items tr.invoice-group-head td {
  padding: 0;
  border-bottom: none;
}

.invoice-group-head-inner {
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  gap: 0;
  font-size: 8.5pt;
  line-height: 1.35;
  padding: 5pt 8pt 5pt 10pt;
  margin-top: 8pt;
  border-left: 3pt solid #1a1a1a;
  background: #fafafa;
  border-bottom: 1pt solid #ddd;
}

.items-table.invoice-items tbody tr:first-child .invoice-group-head-inner {
  margin-top: 0;
}

.invoice-group-head-inner .ref {
  font-weight: bold;
  color: #1a1a1a;
  white-space: nowrap;
}

.invoice-group-head-inner .k {
  font-weight: normal;
  color: #888;
  font-size: 8pt;
  margin-right: 3pt;
}

.invoice-group-head-inner .sep {
  color: #ccc;
  padding: 0 10pt;
  font-weight: normal;
  user-select: none;
}

.invoice-group-head-end {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 16pt;
  white-space: nowrap;
}

.invoice-group-head-inner .ref-date {
  font-weight: normal;
  color: #555;
}

.invoice-group-head-inner .ref-date .k,
.invoice-group-head-inner .ref-subtotal .k {
  margin-right: 3pt;
}

.invoice-group-head-inner .ref-subtotal {
  font-weight: bold;
  color: #1a1a1a;
}

/* ─── Chips ─────────────────────────────────────── */
.chip-list {
  display: flex;
  gap: 8pt;
  flex-wrap: wrap;
  margin-bottom: 16pt;
}

.chip {
  display: inline-block;
  border: 1pt solid #bbb;
  padding: 3pt 10pt;
  font-size: 8pt;
  color: #555;
}

/* ─── Items table (flat: ruled header, no fill / zebra) ─── */
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16pt;
  font-size: 9pt;
}

.items-table thead th {
  padding: 6pt 8pt;
  text-align: left;
  font-weight: bold;
  letter-spacing: 0.02em;
  border-bottom: 1.5pt solid #1a1a1a;
}

.items-table td {
  padding: 5pt 8pt;
  border-bottom: 1pt solid #eee;
}

.items-table .right {
  text-align: right;
}

.items-table .center {
  text-align: center;
}

/* ─── Totals ────────────────────────────────────── */
.totals {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 24pt;
}

.totals table {
  border-collapse: collapse;
  font-size: 9pt;
  min-width: 200pt;
}

.totals td {
  padding: 3pt 8pt;
}

.totals td:first-child {
  color: #555;
}

.totals td:last-child {
  text-align: right;
  font-weight: bold;
}

.totals tr.grand-total td {
  border-top: 1.5pt solid #1a1a1a;
  font-size: 11pt;
  padding-top: 6pt;
}

/* ─── Notes ─────────────────────────────────────── */
.notes {
  border: 1pt solid #ddd;
  padding: 10pt;
  font-size: 9pt;
  color: #555;
  min-height: 40pt;
}

.notes-label {
  font-size: 8pt;
  color: #999;
  margin-bottom: 4pt;
}

/* ─── Blank field lines (receipt / confirmation) ─── */
.field-lines {
  display: flex;
  gap: 32pt;
}

.field-lines .fl-label {
  font-size: 8pt;
  color: #aaa;
}

.field-lines .fl-line {
  border-bottom: 1pt solid #ccc;
  width: 120pt;
  height: 20pt;
}

/* ─── Footer ────────────────────────────────────── */
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 8pt;
  color: #aaa;
  padding: 6pt 0;
  border-top: 1pt solid #eee;
}
`,be="../pdf-templates/",sn=Object.assign({"../pdf-templates/delivery-note.html":()=>V(()=>import("./delivery-note-sS540Im8.js"),[]).then(e=>e.default),"../pdf-templates/invoice.html":()=>V(()=>import("./invoice-StFHx3KR.js"),[]).then(e=>e.default),"../pdf-templates/order-acceptance.html":()=>V(()=>import("./order-acceptance-BbS0QBIR.js"),[]).then(e=>e.default),"../pdf-templates/quote.html":()=>V(()=>import("./quote-D04Kgwym.js"),[]).then(e=>e.default),"../pdf-templates/sales-order.html":()=>V(()=>import("./sales-order-Pfi3KWgJ.js"),[]).then(e=>e.default),"../pdf-templates/shipping-order.html":()=>V(()=>import("./shipping-order-CCos47B1.js"),[]).then(e=>e.default),"../pdf-templates/work-order.html":()=>V(()=>import("./work-order-fQdaFa_A.js"),[]).then(e=>e.default)}),an=Object.assign({"../pdf-templates/data/delivery-note.json":()=>V(()=>import("./delivery-note-mJ0mI4A8.js"),[]).then(e=>e.default),"../pdf-templates/data/invoice.json":()=>V(()=>import("./invoice-Cg5_V8mw.js"),[]).then(e=>e.default),"../pdf-templates/data/order-acceptance.json":()=>V(()=>import("./order-acceptance-0HF1S_ea.js"),[]).then(e=>e.default),"../pdf-templates/data/quote.json":()=>V(()=>import("./quote-BaHbwZiH.js"),[]).then(e=>e.default),"../pdf-templates/data/sales-order.json":()=>V(()=>import("./sales-order-G83QBgvp.js"),[]).then(e=>e.default),"../pdf-templates/data/shipping-order.json":()=>V(()=>import("./shipping-order-DsBIT-FR.js"),[]).then(e=>e.default),"../pdf-templates/data/work-order.json":()=>V(()=>import("./work-order-C9KROCEx.js"),[]).then(e=>e.default)}),Te=Object.keys(sn).sort((e,t)=>Ue(e,be,"html").localeCompare(Ue(t,be,"html"))),_t=At(Te,be,"html");function Ct(e){const t=e.replace(be,"").replace(/\.html$/,""),n=`${be}data/${t}.json`;return n in an?n:null}const Mt=794,Pt=1123,yr=`@font-face {
  font-family: 'Noto Sans JP';
  src: url('/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}`;function xr(e){const t=`<style>
${yr}
</style>`,n=`<style>
${vr}
</style>`,r="<style>body { padding: 10mm !important; }</style>",s=/<link[^>]*href=["']base\.css["'][^>]*\/?>/i,o=s.test(e)?e.replace(s,n):e.includes("<head>")?e.replace("<head>",`<head>
${n}`):n+e,a=`${t}
${r}`;return o.includes("</head>")?o.replace("</head>",`${a}
</head>`):a+o}function wr(){const[e,t]=Xe("template",Te[0]??""),n=Te.includes(e)?e:Te[0]??null,r=y=>t(y??""),[s,o]=u.useState(null),[a,c]=u.useState("{}"),[d,h]=u.useState("{}"),[b,x]=u.useState(!1),[v,k]=u.useState(!1),[m,w]=u.useState(!1),[g,p]=u.useState(0);u.useEffect(()=>{if(!n){o(null),h("{}"),c("{}");return}x(!0),o(null);const y=Ct(n);Promise.all([sn[n](),y?an[y]():Promise.resolve(null)]).then(([T,N])=>{o(T);const F=N||"{}";c(F),h(F),x(!1)})},[n,g]);const{processedHtml:l,jsonError:f}=u.useMemo(()=>{if(!s)return{processedHtml:null,jsonError:null};try{const y=JSON.parse(d);return{processedHtml:br(s,y),jsonError:null}}catch(y){return{processedHtml:s,jsonError:String(y)}}},[s,d]);async function E(){var y;if(!(!n||v)){k(!0);try{const T=n.slice(be.length),N=await fetch(`/api/pdf?template=${encodeURIComponent(T)}`,{method:"POST"});if(!N.ok)throw new Error(`PDF generation returned ${N.status}`);const F=await N.blob(),O=N.headers.get("content-disposition"),A=((y=O==null?void 0:O.match(/filename="?([^"]+)"?/))==null?void 0:y[1])??`${R??"template"}.pdf`,z=URL.createObjectURL(F),L=document.createElement("a");L.href=z,L.download=A,document.body.appendChild(L),L.click(),document.body.removeChild(L),URL.revokeObjectURL(z)}catch(T){console.error("PDF generation failed:",T)}finally{k(!1)}}}const R=n?Ue(n,be,"html"):null,S=Ct(n??"")!==null;return i.jsxs(j,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(j,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsx(Lt,{h:"100%",p:"xs",children:_t.length===0?i.jsx(K,{size:"sm",c:"dimmed",p:"xs",children:"No .html files in pdf-templates/ yet."}):i.jsx(on,{nodes:_t,selected:n,onSelect:r})})}),i.jsxs(j,{style:{flex:1,display:"flex",flexDirection:"column",minHeight:0},children:[n&&i.jsx(j,{px:"md",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)",flexShrink:0},children:i.jsxs(te,{justify:"space-between",children:[i.jsx(K,{size:"sm",c:"dimmed",ff:"monospace",children:R}),i.jsxs(te,{gap:"xs",children:[i.jsx(re,{variant:"default",title:"Reload template",onClick:()=>p(y=>y+1),children:i.jsx(We,{size:16})}),S&&i.jsx(se,{label:m?"Hide data editor":"Edit JSON data",children:i.jsx(re,{variant:m?"filled":"default",onClick:()=>w(y=>!y),children:m?i.jsx(Bo,{size:16}):i.jsx(qo,{size:16})})}),i.jsx(zn,{size:"xs",leftSection:i.jsx(tr,{size:14}),onClick:E,disabled:!l,loading:v,children:"Save PDF"})]})]})}),i.jsxs(j,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(j,{style:{flex:1,overflow:"auto",background:"var(--mantine-color-gray-2)",padding:32},children:n?b?i.jsx(st,{style:{minHeight:"100%"},children:i.jsxs(it,{align:"center",gap:"xs",children:[i.jsx(Nt,{size:"sm"}),i.jsx(K,{size:"sm",c:"dimmed",children:"Loading…"})]})}):l?i.jsx(j,{style:{width:Mt,minHeight:Pt,background:"white",boxShadow:"0 4px 32px rgba(0,0,0,0.18)",margin:"0 auto",overflow:"hidden"},children:i.jsx("iframe",{srcDoc:xr(l),title:R??"PDF Template",style:{width:Mt,height:Pt,border:"none",display:"block"}},`${n}-${g}-${d}`)}):null:i.jsx(st,{style:{minHeight:"100%"},children:i.jsx(K,{c:"dimmed",children:Te.length===0?"Drop an .html file into design-preview/pdf-templates/ to get started.":"Select a template from the tree on the left."})})}),m&&i.jsxs(j,{w:380,style:{flexShrink:0,borderLeft:"1px solid var(--mantine-color-default-border)",display:"flex",flexDirection:"column",background:"var(--mantine-color-body)"},children:[i.jsx(j,{px:"sm",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",flexShrink:0},children:i.jsxs(te,{justify:"space-between",children:[i.jsxs(te,{gap:"xs",children:[i.jsx(K,{size:"xs",fw:600,children:"JSON Data"}),f&&i.jsx(se,{label:f,multiline:!0,w:260,withArrow:!0,children:i.jsx($n,{color:"red",size:"xs",style:{cursor:"help"},children:"Parse error"})})]}),i.jsx(se,{label:"Reset to default",children:i.jsx(re,{size:"xs",variant:"subtle",onClick:()=>h(a),disabled:d===a,children:i.jsx(We,{size:12})})})]})}),i.jsx("textarea",{value:d,onChange:y=>h(y.target.value),spellCheck:!1,style:{flex:1,resize:"none",border:"none",outline:"none",padding:"10px 12px",fontFamily:'ui-monospace, "Cascadia Code", "Fira Code", monospace',fontSize:"11px",lineHeight:1.6,background:"var(--mantine-color-body)",color:"var(--mantine-color-text)"}})]})]})]})]})}const Tt=At(Me);function Sr(e){return`https://ckk.local/${e.replace("../designs/","").replace(/\.tsx$/,"").split("/").map(r=>r.replace(/([A-Z])/g,(s,o,a)=>a===0?o.toLowerCase():`-${o.toLowerCase()}`)).join("/")}`}function Er(){const[e,t]=Xe("mode","ui"),n=e==="pdf"?"pdf":"ui",[r,s]=Xe("design",Me[0]??""),o=Me.includes(r)?r:Me[0]??null,a=p=>s(p??""),[c,d]=Xe("viewport","desktop"),h=c==="mobile"?"mobile":"desktop",[b,x]=u.useState(0),{toggleColorScheme:v}=Bn(),m=Gn("light",{getInitialValueInEffect:!1})==="dark"?"dark":"light",w=m==="dark",g=o&&In(o)?"component":"page";return i.jsxs(it,{gap:0,h:"100vh",children:[i.jsx(j,{p:"sm",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsxs(te,{justify:"space-between",children:[i.jsxs(te,{gap:"sm",children:[i.jsx(Fn,{order:5,style:{flexShrink:0},children:"Design Preview"}),n==="ui"&&o&&i.jsx(K,{size:"sm",c:"dimmed",ff:"monospace",children:Ue(o)})]}),i.jsxs(te,{gap:"xs",children:[n==="ui"&&i.jsx(re,{variant:"default",title:"Re-render",onClick:()=>x(p=>p+1),children:i.jsx(We,{size:16})}),i.jsx(re,{variant:"default",title:w?"ライトモード":"ダークモード",onClick:()=>v(),"aria-label":"カラーモード切替",children:w?i.jsx(hr,{size:16}):i.jsx(ur,{size:16})}),i.jsx(Qe,{size:"xs",value:n,onChange:p=>t(p),data:[{label:"UI Designs",value:"ui"},{label:"PDF Templates",value:"pdf"}]})]})]})}),n==="pdf"?i.jsx(wr,{}):i.jsxs(j,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(j,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsx(Lt,{h:"100%",p:"xs",children:Tt.length===0?i.jsx(K,{size:"sm",c:"dimmed",p:"xs",children:"No .tsx files in designs/ yet."}):i.jsx(on,{nodes:Tt,selected:o,onSelect:a})})}),i.jsx(j,{style:{flex:1,overflow:"auto",background:w?"var(--mantine-color-dark-8)":"var(--mantine-color-gray-2)",padding:24},children:o?i.jsx(gr,{url:Sr(o),design:o,viewport:h,scheme:m,mode:g,remountKey:b,onViewportChange:d}):i.jsx(st,{style:{minHeight:"100%"},children:i.jsx(it,{align:"center",gap:"xs",children:i.jsx(K,{c:"dimmed",children:Me.length===0?"Drop a .tsx file into design-preview/designs/ to get started.":"Select a design file from the tree on the left."})})})})]})]})}An.createRoot(document.getElementById("root")).render(i.jsx(ee.StrictMode,{children:i.jsx(Ln,{theme:Yn,colorSchemeManager:Xn,children:i.jsxs(Un,{settings:{locale:"ja"},children:[i.jsx(ne,{}),i.jsx(Er,{})]})})}));
