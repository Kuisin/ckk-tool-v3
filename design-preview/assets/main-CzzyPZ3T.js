import{ax as f,aG as Xe,aw as xe,ao as _t,Y as Re,aW as ve,aR as on,aT as Ye,aY as Rt,am as i,a as w,a$ as Ve,L as Mt,d as sn,K as He,af as Ct,aa as rt,aK as Pt,aB as Dt,a8 as rn,ac as Tt,aV as at,ab as Ot,O as Ie,a4 as lt,g as an,aN as ln,z as cn,aF as dn,aO as un,aM as pn,aL as fn,a_ as hn,aJ as mn,aq as gn,$ as ut,x as bn,ag as Je,aH as xn,a5 as vn,w as pt,F as ft,H as yn,R as J,o as ze,q as ht,ay as wn,U as mt,t as B,G as K,a0 as Ae,E as Nt,_ as X,S as zt,b as Sn,C as et,s as tt,B as jn,V as je,ai as En,v as kn,p as _n,k as Rn,aA as Mn,at as Cn,f as Pn}from"./design-modules-Bz3EomlZ.js";import{a as Dn,u as Tn,h as On,n as ye}from"./notifications.store-C6DUL0Ks.js";import{a as Nn,u as zn}from"./use-computed-color-scheme-tfBDWNZU.js";import{A as te}from"./ActionIcon-pWzxZHVh.js";import{S as Fn}from"./SegmentedControl-sp9JlrUi.js";import{I as In}from"./IconChevronRight-CaSIW3rp.js";import{c as W}from"./createReactComponent-DSefK2yo.js";import{I as An}from"./IconArrowRight-Bdpc6xy1.js";import{I as $n}from"./IconLock-BY1jJPWi.js";import{I as Ln}from"./IconDownload-BRYf0YW_.js";import"./get-env-B-6RN2XZ.js";const Xn=e=>(e+1)%1e6;function Yn(){const[,e]=f.useReducer(Xn,0);return e}function Vn(e){if(!e||typeof e=="string")return 0;const n=e/36;return Math.round((4+15*n**.25+n/5)*10)}function Ke(e){return e.current?e.current.scrollHeight:"auto"}function Hn({transitionDuration:e,transitionTimingFunction:n="ease",onTransitionEnd:t,onTransitionStart:a,expanded:s,keepMounted:o}){const r={height:0,overflow:"hidden",...o?{}:{display:"none"}},c=f.useEffectEvent(()=>a==null?void 0:a()),d=f.useRef(null),[p,g]=f.useState(s?{}:r),[v,b]=f.useState(s?"entered":"exited"),R=h=>{xe.flushSync(()=>g(h))},x=h=>{R(l=>({...l,...h}))},j=h=>{const l=e??Vn(h);return{transition:`height ${l}ms ${n}, opacity ${l}ms ${n}`}};Xe(()=>{e!==0&&c(),s?window.requestAnimationFrame(()=>{xe.flushSync(()=>b("entering")),x({willChange:"height",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const h=Ke(d);x({...j(h),height:h})})}):window.requestAnimationFrame(()=>{xe.flushSync(()=>b("exiting"));const h=Ke(d);x({...j(h),willChange:"height",height:h}),window.requestAnimationFrame(()=>x({height:0,overflow:"hidden"}))})},[s]);const S=h=>{if(!(h.target!==d.current||h.propertyName!=="height"))if(s){const l=Ke(d);l===p.height?R({}):x({height:l}),b("entered"),t==null||t()}else p.height===0&&(R(r),b("exited"),t==null||t())};return{state:v,getCollapseProps:h=>({"aria-hidden":!s,inert:!s,ref:_t(d,h==null?void 0:h.ref),onTransitionEnd:S,style:{boxSizing:"border-box",...h==null?void 0:h.style,...p}})}}function Un(e){if(!e||typeof e=="string")return 0;const n=e/36;return Math.round((4+15*n**.25+n/5)*10)}function Qe(e){return e.current?e.current.scrollWidth:"auto"}function Gn({transitionDuration:e,transitionTimingFunction:n="ease",onTransitionEnd:t,onTransitionStart:a,expanded:s,keepMounted:o}){const r={width:0,overflow:"hidden",...o?{}:{display:"none"}},c=f.useEffectEvent(()=>a==null?void 0:a()),d=f.useRef(null),[p,g]=f.useState(s?{}:r),[v,b]=f.useState(s?"entered":"exited"),R=h=>{xe.flushSync(()=>g(h))},x=h=>{R(l=>({...l,...h}))},j=h=>{const l=e??Un(h);return{transition:`width ${l}ms ${n}, opacity ${l}ms ${n}`}};Xe(()=>{e!==0&&c(),s?window.requestAnimationFrame(()=>{xe.flushSync(()=>b("entering")),x({willChange:"width",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const h=Qe(d);x({...j(h),width:h})})}):window.requestAnimationFrame(()=>{xe.flushSync(()=>b("exiting"));const h=Qe(d);x({...j(h),willChange:"width",width:h}),window.requestAnimationFrame(()=>x({width:0,overflow:"hidden"}))})},[s]);const S=h=>{if(!(h.target!==d.current||h.propertyName!=="width"))if(s){const l=Qe(d);l===p.width?R({}):x({width:l}),b("entered"),t==null||t()}else p.width===0&&(R(r),b("exited"),t==null||t())};return{state:v,getCollapseProps:h=>({"aria-hidden":!s,inert:!s,ref:_t(d,h==null?void 0:h.ref),onTransitionEnd:S,style:{boxSizing:"border-box",...h==null?void 0:h.style,...p}})}}const Bn=100;function me(e){return e>0?1:e<0?-1:0}function gt(e){const n=e??0;return typeof n=="number"?[n,n]:n}function Wn(){return{isActive:!1,pointerId:-1,startXY:[0,0],prevXY:[0,0],startTimestamp:0,prevTimestamp:0,thresholdMet:!1,firstFired:!1,lockedAxis:null,canceled:!1,lastVelocity:[0,0]}}function qn(e,n={}){const[t,a]=f.useState(!1),s=f.useRef(e);s.current=e;const o=f.useRef(n);o.current=n;const r=f.useRef(Wn()),c=f.useRef(null);return{ref:f.useCallback(d=>{if(!d)return;const p=new AbortController,g=l=>{const u=o.current,y=r.current;if(u.axis==="x")return[l[0],0];if(u.axis==="y")return[0,l[1]];if(u.axis==="lock"){if(y.lockedAxis===null){const _=u.axisThreshold??1;(Math.abs(l[0])>_||Math.abs(l[1])>_)&&(y.lockedAxis=Math.abs(l[0])>=Math.abs(l[1])?"x":"y")}if(y.lockedAxis==="x")return[l[0],0];if(y.lockedAxis==="y")return[0,l[1]]}return l},v=()=>{var u;const l=r.current;l.isActive=!1,l.pointerId=-1,l.thresholdMet=!1,l.firstFired=!1,l.lockedAxis=null,l.canceled=!1,a(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="",(u=c.current)==null||u.abort(),c.current=null},b=()=>{r.current.isActive&&(r.current.canceled=!0,v())},R=()=>{a(!0),document.body.style.userSelect="none",document.body.style.webkitUserSelect="none"},x=l=>{var m;if(o.current.enabled===!1||l.button!==0||r.current.isActive)return;const u=r.current;u.isActive=!0,u.pointerId=l.pointerId,u.startXY=[l.clientX,l.clientY],u.prevXY=[l.clientX,l.clientY],u.startTimestamp=l.timeStamp,u.prevTimestamp=l.timeStamp,u.thresholdMet=!1,u.firstFired=!1,u.lockedAxis=null,u.canceled=!1,u.lastVelocity=[0,0];const[y,_]=gt(o.current.threshold);y===0&&_===0&&(u.thresholdMet=!0,u.firstFired=!0,R(),s.current({xy:[l.clientX,l.clientY],initial:[l.clientX,l.clientY],movement:[0,0],delta:[0,0],distance:[0,0],direction:[0,0],velocity:[0,0],elapsedTime:0,first:!0,last:!1,active:!0,tap:!1,canceled:!1,cancel:b,event:l})),(m=c.current)==null||m.abort(),c.current=new AbortController;const E=c.current.signal;document.addEventListener("pointermove",j,{signal:E}),document.addEventListener("pointerup",S,{signal:E}),document.addEventListener("pointercancel",h,{signal:E})},j=l=>{const u=r.current;if(!u.isActive||l.pointerId!==u.pointerId)return;const y=[l.clientX-u.startXY[0],l.clientY-u.startXY[1]];if(!u.thresholdMet){const[F,O]=gt(o.current.threshold);if(Math.abs(y[0])<F&&Math.abs(y[1])<O){u.prevXY=[l.clientX,l.clientY],u.prevTimestamp=l.timeStamp;return}u.thresholdMet=!0,R()}const _=g(y),E=g([l.clientX-u.prevXY[0],l.clientY-u.prevXY[1]]),m=l.timeStamp-u.prevTimestamp,M=m>0?[Math.abs(E[0])/m,Math.abs(E[1])/m]:u.lastVelocity;u.lastVelocity=M;const P=!u.firstFired;u.firstFired=!0,u.prevXY=[l.clientX,l.clientY],u.prevTimestamp=l.timeStamp,s.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:_,delta:E,distance:[Math.abs(_[0]),Math.abs(_[1])],direction:[me(E[0]),me(E[1])],velocity:M,elapsedTime:l.timeStamp-u.startTimestamp,first:P,last:!1,active:!0,tap:!1,canceled:!1,cancel:b,event:l})},S=l=>{const u=r.current;if(!u.isActive||l.pointerId!==u.pointerId)return;const y=o.current;if(!u.thresholdMet){if(y.filterTaps){const O=g([l.clientX-u.startXY[0],l.clientY-u.startXY[1]]),I=[Math.abs(O[0]),Math.abs(O[1])],A=Math.max(I[0],I[1])<(y.tapThreshold??3);s.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:O,delta:O,distance:I,direction:[me(O[0]),me(O[1])],velocity:[0,0],elapsedTime:l.timeStamp-u.startTimestamp,first:!0,last:!0,active:!1,tap:A,canceled:!1,cancel:b,event:l})}v();return}const _=g([l.clientX-u.startXY[0],l.clientY-u.startXY[1]]),E=[Math.abs(_[0]),Math.abs(_[1])],m=g([l.clientX-u.prevXY[0],l.clientY-u.prevXY[1]]),M=l.timeStamp-u.prevTimestamp>Bn?[0,0]:u.lastVelocity,P=Math.max(E[0],E[1]),F=y.filterTaps===!0&&P<(y.tapThreshold??3);s.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:_,delta:m,distance:E,direction:[me(m[0]),me(m[1])],velocity:M,elapsedTime:l.timeStamp-u.startTimestamp,first:!u.firstFired,last:!0,active:!1,tap:F,canceled:!1,cancel:b,event:l}),v()},h=l=>{const u=r.current;if(!u.isActive||l.pointerId!==u.pointerId)return;const y=g([l.clientX-u.startXY[0],l.clientY-u.startXY[1]]);s.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:y,delta:[0,0],distance:[Math.abs(y[0]),Math.abs(y[1])],direction:[0,0],velocity:[0,0],elapsedTime:l.timeStamp-u.startTimestamp,first:!u.firstFired,last:!0,active:!1,tap:!1,canceled:!0,cancel:b,event:l}),v()};return d.addEventListener("pointerdown",x,{signal:p.signal}),()=>{var l;p.abort(),(l=c.current)==null||l.abort(),c.current=null,r.current.isActive&&(r.current.isActive=!1,a(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="")}},[]),active:t}}function _e(e,n){return Array.isArray(e)?[...e].reduce((t,a)=>({...t,..._e(a,n)}),{}):typeof e=="function"?e(n):e??{}}const Jn={transitionDuration:200,transitionTimingFunction:"ease",animateOpacity:!0,orientation:"vertical"},Ft=Re(e=>{const{children:n,expanded:t,transitionDuration:a,transitionTimingFunction:s,style:o,onTransitionEnd:r,onTransitionStart:c,animateOpacity:d,keepMounted:p,ref:g,orientation:v,...b}=ve("Collapse",Jn,e),R=on(),x=Ye(),j=Rt(),S=x.respectReducedMotion&&j?0:a,h=(v==="horizontal"?Gn:Hn)({expanded:t,transitionDuration:S,transitionTimingFunction:s,onTransitionEnd:r,onTransitionStart:c,keepMounted:!1});if(S===0)return p===!0&&R!=="test"?i.jsx(f.Activity,{mode:t?"visible":"hidden",children:i.jsx(w,{...b,children:n})}):t?i.jsx(w,{...b,children:n}):null;const l=h.state==="exited";let u;return p===!1?u=l?null:n:p===!0?u=i.jsx(f.Activity,{mode:l?"hidden":"visible",children:n}):u=n,i.jsx(w,{...b,...h.getCollapseProps({style:{opacity:t||!d?1:0,transition:d?`opacity ${S}ms ${s}`:"none",..._e(o,x)},ref:g}),children:u})});Ft.displayName="@mantine/core/Collapse";const Kn={duration:100,transition:"fade"};function bt(e,n){return{...Kn,...n,...e}}var It={root:"m_a513464",icon:"m_a4ceffb",loader:"m_b0920b15",body:"m_a49ed24",title:"m_3feedf16",description:"m_3d733a3a",closeButton:"m_919a4d88"};const Qn={withCloseButton:!0},At=He((e,{radius:n,color:t})=>({root:{"--notification-radius":n===void 0?void 0:rt(n),"--notification-color":t?Ct(t,e):void 0}})),Ue=Re(e=>{const n=ve("Notification",Qn,e),{className:t,color:a,radius:s,loading:o,withCloseButton:r,withBorder:c,title:d,icon:p,children:g,onClose:v,closeButtonProps:b,classNames:R,style:x,styles:j,unstyled:S,vars:h,mod:l,loaderProps:u,role:y,attributes:_,...E}=n,m=Ve({name:"Notification",classes:It,props:n,className:t,style:x,classNames:R,styles:j,unstyled:S,attributes:_,vars:h,varsResolver:At});return i.jsxs(w,{...m("root"),mod:[{"data-with-icon":!!p||o,"data-with-border":c},l],role:y||"alert",...E,children:[p&&!o&&i.jsx("div",{...m("icon"),children:p}),o&&i.jsx(Mt,{size:28,color:a,...m("loader"),...u}),i.jsxs("div",{...m("body"),children:[d&&i.jsx("div",{...m("title"),children:d}),i.jsx(w,{...m("description"),mod:{"data-with-title":!!d},children:g})]}),r&&i.jsx(sn,{iconSize:16,color:"gray",...b,unstyled:S,onClick:M=>{var P;(P=b==null?void 0:b.onClick)==null||P.call(b,M),v==null||v()},...m("closeButton")})]})});Ue.classes=It;Ue.varsResolver=At;Ue.displayName="@mantine/core/Notification";function Zn({offset:e,position:n,defaultOpened:t}){const[a,s]=f.useState(t),o=f.useRef(null),{x:r,y:c,elements:d,refs:p,update:g,placement:v}=Pt({placement:n,middleware:[Dt({crossAxis:!0,padding:5,rootBoundary:"document"})]}),b=v.includes("right")?e:n.includes("left")?e*-1:0,R=v.includes("bottom")?e:n.includes("top")?e*-1:0,x=f.useCallback(({clientX:j,clientY:S})=>{p.setPositionReference({getBoundingClientRect(){return{width:0,height:0,x:j,y:S,left:j+b,top:S+R,right:j,bottom:S}}})},[d.reference]);return f.useEffect(()=>{if(p.floating.current){const j=o.current;j.addEventListener("mousemove",x);const S=rn(p.floating.current);return S.forEach(h=>{h.addEventListener("scroll",g)}),()=>{j.removeEventListener("mousemove",x),S.forEach(h=>{h.removeEventListener("scroll",g)})}}},[d.reference,p.floating.current,g,x,a]),{handleMouseMove:x,x:r,y:c,opened:a,setOpened:s,boundaryRef:o,floating:p.setFloating}}var Ge={tooltip:"m_1b3c8819",arrow:"m_f898399f"};const eo={refProp:"ref",withinPortal:!0,offset:10,position:"right",zIndex:lt("popover")},$t=He((e,{radius:n,color:t})=>({tooltip:{"--tooltip-radius":n===void 0?void 0:rt(n),"--tooltip-bg":t?Ct(t,e):void 0,"--tooltip-color":t?"var(--mantine-color-white)":void 0}})),Be=Re(e=>{const n=ve("TooltipFloating",eo,e),{children:t,refProp:a,withinPortal:s,style:o,className:r,classNames:c,styles:d,unstyled:p,radius:g,color:v,label:b,offset:R,position:x,multiline:j,zIndex:S,disabled:h,defaultOpened:l,variant:u,vars:y,portalProps:_,attributes:E,ref:m,...M}=n,P=Ye(),F=Ve({name:"TooltipFloating",props:n,classes:Ge,className:r,style:o,classNames:c,styles:d,unstyled:p,attributes:E,rootSelector:"tooltip",vars:y,varsResolver:$t}),{handleMouseMove:O,x:I,y:A,opened:L,boundaryRef:ie,floating:se,setOpened:Y}=Zn({offset:R,position:x,defaultOpened:l}),N=Tt(t);if(!N)throw new Error("[@mantine/core] Tooltip.Floating component children should be an element or a component that accepts ref, fragments, strings, numbers and other primitive values are not supported");const Z=at(ie,Ot(N),m),z=N.props,D=$=>{var T;(T=z.onMouseEnter)==null||T.call(z,$),O($),Y(!0)},U=$=>{var T;(T=z.onMouseLeave)==null||T.call(z,$),Y(!1)};return i.jsxs(i.Fragment,{children:[i.jsx(Ie,{..._,withinPortal:s,children:i.jsx(w,{...M,...F("tooltip",{style:{..._e(o,P),zIndex:S,display:!h&&L?"block":"none",top:(A&&Math.round(A))??"",left:(I&&Math.round(I))??""}}),variant:u,ref:se,mod:{multiline:j},children:b})}),f.cloneElement(N,{...z,[a]:Z,onMouseEnter:D,onMouseLeave:U})]})});Be.classes=Ge;Be.varsResolver=$t;Be.displayName="@mantine/core/TooltipFloating";const Lt=f.createContext({withinGroup:!1}),to={openDelay:0,closeDelay:0};function ct(e){const{openDelay:n,closeDelay:t,children:a}=ve("TooltipGroup",to,e);return i.jsx(Lt,{value:{withinGroup:!0},children:i.jsx(an,{delay:{open:n,close:t},children:a})})}ct.displayName="@mantine/core/TooltipGroup";ct.extend=e=>e;function no(e){if(e===void 0)return{shift:!0,flip:!0};const n={...e};return e.shift===void 0&&(n.shift=!0),e.flip===void 0&&(n.flip=!0),n}function oo(e){const n=no(e.middlewares),t=[gn(e.offset)];return n.shift&&t.push(Dt(typeof n.shift=="boolean"?{padding:8}:{padding:8,...n.shift})),n.flip&&t.push(typeof n.flip=="boolean"?ut():ut(n.flip)),t.push(bn({element:e.arrowRef,padding:e.arrowOffset})),n.inline?t.push(typeof n.inline=="boolean"?Je():Je(n.inline)):e.inline&&t.push(Je()),t}function io(e){var y,_,E;const[n,t]=f.useState(e.defaultOpened),a=typeof e.opened=="boolean"?e.opened:n,s=f.use(Lt).withinGroup,o=ln(),r=f.useCallback(m=>{t(m),m&&S(o)},[o]),{x:c,y:d,context:p,refs:g,placement:v,middlewareData:{arrow:{x:b,y:R}={}}}=Pt({strategy:e.strategy,placement:e.position,open:a,onOpenChange:r,middleware:oo(e),whileElementsMounted:cn}),{delay:x,currentId:j,setCurrentId:S}=dn(p,{id:o}),{getReferenceProps:h,getFloatingProps:l}=un([pn(p,{enabled:(y=e.events)==null?void 0:y.hover,delay:s?x:{open:e.openDelay,close:e.closeDelay},mouseOnly:!((_=e.events)!=null&&_.touch)}),fn(p,{enabled:(E=e.events)==null?void 0:E.focus,visibleOnly:!0}),hn(p,{role:"tooltip"}),mn(p,{enabled:typeof e.opened>"u"})]);Xe(()=>{var m;(m=e.onPositionChange)==null||m.call(e,v)},[v]);const u=a&&j&&j!==o;return{x:c,y:d,arrowX:b,arrowY:R,reference:g.setReference,floating:g.setFloating,getFloatingProps:l,getReferenceProps:h,isGroupPhase:u,opened:a,placement:v}}const so={position:"top",refProp:"ref",withinPortal:!0,arrowSize:4,arrowOffset:5,arrowRadius:0,arrowPosition:"side",offset:5,transitionProps:{duration:100,transition:"fade"},events:{hover:!0,focus:!1,touch:!1},zIndex:lt("popover"),middlewares:{flip:!0,shift:!0,inline:!1}},Xt=He((e,{radius:n,color:t,variant:a,autoContrast:s})=>{const o=e.variantColorResolver({theme:e,color:t||e.primaryColor,autoContrast:s,variant:a||"filled"});return{tooltip:{"--tooltip-radius":n===void 0?void 0:rt(n),"--tooltip-bg":t?o.background:void 0,"--tooltip-color":t?o.color:void 0}}}),ne=Re(e=>{const n=ve("Tooltip",so,e),{children:t,position:a,refProp:s,label:o,openDelay:r,closeDelay:c,onPositionChange:d,opened:p,defaultOpened:g,withinPortal:v,radius:b,color:R,classNames:x,styles:j,unstyled:S,style:h,className:l,withArrow:u,arrowSize:y,arrowOffset:_,arrowRadius:E,arrowPosition:m,offset:M,transitionProps:P,multiline:F,events:O,zIndex:I,disabled:A,onClick:L,onMouseEnter:ie,onMouseLeave:se,inline:Y,variant:N,keepMounted:Z,vars:z,portalProps:D,mod:U,floatingStrategy:$,middlewares:T,autoContrast:fe,attributes:V,target:H,ref:Me,...Ce}=n,{dir:Pe}=xn(),we=f.useRef(null),C=io({position:vn(Pe,a),closeDelay:c,openDelay:r,onPositionChange:d,opened:p,defaultOpened:g,events:O,arrowRef:we,arrowOffset:_,offset:typeof M=="number"?M+(u?y/2:0):M,inline:Y,strategy:$,middlewares:T});f.useEffect(()=>{const ee=H instanceof HTMLElement?H:typeof H=="string"?document.querySelector(H):(H==null?void 0:H.current)||null;ee&&C.reference(ee)},[H,C]);const q=Ve({name:"Tooltip",props:n,classes:Ge,className:l,style:h,classNames:x,styles:j,unstyled:S,attributes:V,rootSelector:"tooltip",vars:z,varsResolver:Xt}),he=Tt(t);if(!H&&!he)throw new Error("[@mantine/core] Tooltip component children should be an element or a component that accepts ref, fragments, strings, numbers and other primitive values are not supported");const Se=q("tooltip");if(H){const ee=bt(P,{duration:100,transition:"fade"});return i.jsx(i.Fragment,{children:i.jsx(Ie,{...D,withinPortal:v,children:i.jsx(pt,{...ee,keepMounted:Z,mounted:!A&&!!C.opened,duration:C.isGroupPhase?10:ee.duration,children:We=>i.jsxs(w,{...Ce,"data-fixed":$==="fixed"||void 0,variant:N,mod:[{multiline:F},U],...Se,...C.getFloatingProps({ref:C.floating,className:Se.className,style:{...Se.style,...We,zIndex:I,top:C.y??0,left:C.x??0}}),children:[o,i.jsx(ft,{ref:we,arrowX:C.arrowX,arrowY:C.arrowY,visible:u,position:C.placement,arrowSize:y,arrowOffset:_,arrowRadius:E,arrowPosition:m,...q("arrow")})]})})})})}const De=he.props,re=at(C.reference,Ot(he),Me),Te=bt(P,{duration:100,transition:"fade"});return i.jsxs(i.Fragment,{children:[i.jsx(Ie,{...D,withinPortal:v,children:i.jsx(pt,{...Te,keepMounted:Z,mounted:!A&&!!C.opened,duration:C.isGroupPhase?10:Te.duration,children:ee=>i.jsxs(w,{...Ce,"data-fixed":$==="fixed"||void 0,variant:N,mod:[{multiline:F},U],...C.getFloatingProps({ref:C.floating,className:q("tooltip").className,style:{...q("tooltip").style,...ee,zIndex:I,top:C.y??0,left:C.x??0}}),children:[o,i.jsx(ft,{ref:we,arrowX:C.arrowX,arrowY:C.arrowY,visible:u,position:C.placement,arrowSize:y,arrowOffset:_,arrowRadius:E,arrowPosition:m,...q("arrow")})]})})}),f.cloneElement(he,C.getReferenceProps({onClick:L,onMouseEnter:ie,onMouseLeave:se,onMouseMove:n.onMouseMove,onPointerDown:n.onPointerDown,onPointerEnter:n.onPointerEnter,...De,className:yn(l,De.className),[s]:re}))]})});ne.classes=Ge;ne.varsResolver=Xt;ne.displayName="@mantine/core/Tooltip";ne.Floating=Be;ne.Group=ct;const Yt=["bottom-center","bottom-left","bottom-right","top-center","top-left","top-right"];function ro(e,n){return e.reduce((t,a)=>(t[a.position||n].push(a),t),Yt.reduce((t,a)=>(t[a]=[],t),{}))}const xt={left:"translateX(-100%)",right:"translateX(100%)","top-center":"translateY(-100%)","bottom-center":"translateY(100%)"},ao={left:"translateX(0)",right:"translateX(0)","top-center":"translateY(0)","bottom-center":"translateY(0)"};function lo({state:e,maxHeight:n,position:t,transitionDuration:a}){const[s,o]=t.split("-"),r=o==="center"?`${s}-center`:o,c={opacity:0,maxHeight:n,transform:xt[r],transitionDuration:`${a}ms, ${a}ms, ${a}ms`,transitionTimingFunction:"cubic-bezier(.51,.3,0,1.21), cubic-bezier(.51,.3,0,1.21), linear",transitionProperty:"opacity, transform, max-height"},d={opacity:1,transform:ao[r]},p={opacity:0,maxHeight:0,transform:xt[r]};return{...c,...{entering:d,entered:d,exiting:p,exited:p}[e]}}function co(e,n){return typeof n=="number"?n:n===!1||e===!1?!1:e}const uo=120;function Vt({data:e,onHide:n,autoClose:t,transitionDuration:a,allowDragDismiss:s,allowScrollDismiss:o,paused:r,onHoverStart:c,onHoverEnd:d,ref:p,style:g,...v}){const[b,R]=f.useState(0),[x,j]=f.useState(!1),[S,h]=f.useState(1),[l,u]=f.useState(!1),y=Ye(),{autoClose:_,message:E,allowClose:m,position:M,style:P,withCloseButton:F,onOpen:O,...I}=e,A=co(t,e.autoClose),L=f.useRef(-1),ie=f.useRef(-1),se=f.useRef(-1),Y=f.useRef(null),N=f.useRef(!1),Z=f.useRef(0),z=m===!1,D=()=>window.clearTimeout(L.current),U=()=>window.clearTimeout(ie.current),$=()=>window.clearTimeout(se.current),T=k=>{Z.current=k,R(k)},fe=()=>{n(e.id),D(),U(),$()},V=()=>{x||q||r||N.current||typeof A!="number"||(L.current=window.setTimeout(fe,A))},H=k=>{var G;return k*((((G=Y.current)==null?void 0:G.offsetWidth)??440)+40)},Me=(k,G)=>{var Ne;const le=((Ne=Y.current)==null?void 0:Ne.offsetWidth)??440;return Math.abs(k)>le*.35||G>.5},Ce=()=>{$(),u(!1),T(0)},Pe=k=>{h(k),j(!0),u(!1),T(H(k)),D(),U(),$(),ie.current=window.setTimeout(fe,a)},we=()=>{$(),se.current=window.setTimeout(()=>{u(!1),T(0),V()},uo)},{ref:C,active:q}=qn(k=>{if(!x)if(k.first&&D(),k.last){if(k.tap||k.canceled){T(0),V();return}const G=k.movement[0],le=G===0?k.direction[0]===-1?-1:1:G>0?1:-1;Me(G,k.velocity[0])?Pe(le):(T(0),V())}else T(k.movement[0])},{axis:"x",threshold:5,filterTaps:!0,enabled:s&&!z&&!x}),he=at(p,Y,C),Se=_e(g,y),De=_e(P,y),re={...Se,...De},Te=typeof re.opacity=="number"?re.opacity:1,ee=x?0:1-Math.min(Math.abs(b)/200,1)*.6,We=re.transitionDuration??`${a}ms, ${a}ms, ${a}ms`,Zt={...re,"--notifications-state-transform":typeof re.transform=="string"?re.transform:"translateX(0)","--notifications-state-opacity":String(Te),"--notifications-swipe-offset":`${b}px`,"--notifications-swipe-opacity":String(ee),transform:"var(--notifications-state-transform) translate3d(var(--notifications-swipe-offset), 0, 0)",opacity:"calc(var(--notifications-state-opacity) * var(--notifications-swipe-opacity))",transitionDuration:q||l?"0ms, 0ms, 0ms":We,cursor:"default",touchAction:"pan-y"},en=()=>{N.current=!0,D(),c==null||c()},tn=()=>{N.current=!1,l||(Ce(),V()),d==null||d()},Oe=f.useEffectEvent(k=>{if(x||q)return;const G=k.currentTarget===document;if(!G&&!N.current)return;const{deltaX:le,deltaY:Ne}=k;if(Math.abs(le)<=Math.abs(Ne)||le===0||!o||z)return;G||(k.preventDefault(),k.stopPropagation()),D(),u(!0);const qe=Z.current-le,nn=qe>0?1:-1;if(Me(qe,0)){Pe(nn);return}T(qe),we()});return f.useEffect(()=>{if(l)return document.addEventListener("wheel",Oe,{passive:!1}),()=>document.removeEventListener("wheel",Oe,{passive:!1})},[l]),f.useEffect(()=>{const k=()=>{x&&T(H(S))};return window.addEventListener("resize",k),()=>window.removeEventListener("resize",k)},[S,x]),f.useEffect(()=>{const k=Y.current;if(k)return k.addEventListener("wheel",Oe,{passive:!1}),()=>k.removeEventListener("wheel",Oe,{passive:!1})},[]),f.useEffect(()=>()=>{U(),$()},[]),f.useEffect(()=>{var k;(k=e.onOpen)==null||k.call(e,e)},[]),f.useEffect(()=>(V(),D),[A,q,x]),f.useEffect(()=>(r?D():V(),D),[r]),i.jsx(Ue,{ref:he,...v,style:Zt,...I,withCloseButton:z?!1:F,onClose:fe,onMouseEnter:en,onMouseLeave:tn,children:E})}Vt.displayName="@mantine/notifications/NotificationContainer";var Ht={root:"m_b37d9ac7",notification:"m_5ed0edd0"};function nt(){return nt=Object.assign?Object.assign.bind():function(e){for(var n=1;n<arguments.length;n++){var t=arguments[n];for(var a in t)({}).hasOwnProperty.call(t,a)&&(e[a]=t[a])}return e},nt.apply(null,arguments)}function Ut(e,n){if(e==null)return{};var t={};for(var a in e)if({}.hasOwnProperty.call(e,a)){if(n.indexOf(a)!==-1)continue;t[a]=e[a]}return t}function ot(e,n){return ot=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(t,a){return t.__proto__=a,t},ot(e,n)}function Gt(e,n){e.prototype=Object.create(n.prototype),e.prototype.constructor=e,ot(e,n)}const vt={disabled:!1},$e=J.createContext(null);var po=function(n){return n.scrollTop},Ee="unmounted",ce="exited",de="entering",be="entered",it="exiting",oe=(function(e){Gt(n,e);function n(a,s){var o;o=e.call(this,a,s)||this;var r=s,c=r&&!r.isMounting?a.enter:a.appear,d;return o.appearStatus=null,a.in?c?(d=ce,o.appearStatus=de):d=be:a.unmountOnExit||a.mountOnEnter?d=Ee:d=ce,o.state={status:d},o.nextCallback=null,o}n.getDerivedStateFromProps=function(s,o){var r=s.in;return r&&o.status===Ee?{status:ce}:null};var t=n.prototype;return t.componentDidMount=function(){this.updateStatus(!0,this.appearStatus)},t.componentDidUpdate=function(s){var o=null;if(s!==this.props){var r=this.state.status;this.props.in?r!==de&&r!==be&&(o=de):(r===de||r===be)&&(o=it)}this.updateStatus(!1,o)},t.componentWillUnmount=function(){this.cancelNextCallback()},t.getTimeouts=function(){var s=this.props.timeout,o,r,c;return o=r=c=s,s!=null&&typeof s!="number"&&(o=s.exit,r=s.enter,c=s.appear!==void 0?s.appear:r),{exit:o,enter:r,appear:c}},t.updateStatus=function(s,o){if(s===void 0&&(s=!1),o!==null)if(this.cancelNextCallback(),o===de){if(this.props.unmountOnExit||this.props.mountOnEnter){var r=this.props.nodeRef?this.props.nodeRef.current:ze.findDOMNode(this);r&&po(r)}this.performEnter(s)}else this.performExit();else this.props.unmountOnExit&&this.state.status===ce&&this.setState({status:Ee})},t.performEnter=function(s){var o=this,r=this.props.enter,c=this.context?this.context.isMounting:s,d=this.props.nodeRef?[c]:[ze.findDOMNode(this),c],p=d[0],g=d[1],v=this.getTimeouts(),b=c?v.appear:v.enter;if(!s&&!r||vt.disabled){this.safeSetState({status:be},function(){o.props.onEntered(p)});return}this.props.onEnter(p,g),this.safeSetState({status:de},function(){o.props.onEntering(p,g),o.onTransitionEnd(b,function(){o.safeSetState({status:be},function(){o.props.onEntered(p,g)})})})},t.performExit=function(){var s=this,o=this.props.exit,r=this.getTimeouts(),c=this.props.nodeRef?void 0:ze.findDOMNode(this);if(!o||vt.disabled){this.safeSetState({status:ce},function(){s.props.onExited(c)});return}this.props.onExit(c),this.safeSetState({status:it},function(){s.props.onExiting(c),s.onTransitionEnd(r.exit,function(){s.safeSetState({status:ce},function(){s.props.onExited(c)})})})},t.cancelNextCallback=function(){this.nextCallback!==null&&(this.nextCallback.cancel(),this.nextCallback=null)},t.safeSetState=function(s,o){o=this.setNextCallback(o),this.setState(s,o)},t.setNextCallback=function(s){var o=this,r=!0;return this.nextCallback=function(c){r&&(r=!1,o.nextCallback=null,s(c))},this.nextCallback.cancel=function(){r=!1},this.nextCallback},t.onTransitionEnd=function(s,o){this.setNextCallback(o);var r=this.props.nodeRef?this.props.nodeRef.current:ze.findDOMNode(this),c=s==null&&!this.props.addEndListener;if(!r||c){setTimeout(this.nextCallback,0);return}if(this.props.addEndListener){var d=this.props.nodeRef?[this.nextCallback]:[r,this.nextCallback],p=d[0],g=d[1];this.props.addEndListener(p,g)}s!=null&&setTimeout(this.nextCallback,s)},t.render=function(){var s=this.state.status;if(s===Ee)return null;var o=this.props,r=o.children;o.in,o.mountOnEnter,o.unmountOnExit,o.appear,o.enter,o.exit,o.timeout,o.addEndListener,o.onEnter,o.onEntering,o.onEntered,o.onExit,o.onExiting,o.onExited,o.nodeRef;var c=Ut(o,["children","in","mountOnEnter","unmountOnExit","appear","enter","exit","timeout","addEndListener","onEnter","onEntering","onEntered","onExit","onExiting","onExited","nodeRef"]);return J.createElement($e.Provider,{value:null},typeof r=="function"?r(s,c):J.cloneElement(J.Children.only(r),c))},n})(J.Component);oe.contextType=$e;oe.propTypes={};function ge(){}oe.defaultProps={in:!1,mountOnEnter:!1,unmountOnExit:!1,appear:!1,enter:!0,exit:!0,onEnter:ge,onEntering:ge,onEntered:ge,onExit:ge,onExiting:ge,onExited:ge};oe.UNMOUNTED=Ee;oe.EXITED=ce;oe.ENTERING=de;oe.ENTERED=be;oe.EXITING=it;function fo(e){if(e===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}function dt(e,n){var t=function(o){return n&&f.isValidElement(o)?n(o):o},a=Object.create(null);return e&&f.Children.map(e,function(s){return s}).forEach(function(s){a[s.key]=t(s)}),a}function ho(e,n){e=e||{},n=n||{};function t(g){return g in n?n[g]:e[g]}var a=Object.create(null),s=[];for(var o in e)o in n?s.length&&(a[o]=s,s=[]):s.push(o);var r,c={};for(var d in n){if(a[d])for(r=0;r<a[d].length;r++){var p=a[d][r];c[a[d][r]]=t(p)}c[d]=t(d)}for(r=0;r<s.length;r++)c[s[r]]=t(s[r]);return c}function ue(e,n,t){return t[n]!=null?t[n]:e.props[n]}function mo(e,n){return dt(e.children,function(t){return f.cloneElement(t,{onExited:n.bind(null,t),in:!0,appear:ue(t,"appear",e),enter:ue(t,"enter",e),exit:ue(t,"exit",e)})})}function go(e,n,t){var a=dt(e.children),s=ho(n,a);return Object.keys(s).forEach(function(o){var r=s[o];if(f.isValidElement(r)){var c=o in n,d=o in a,p=n[o],g=f.isValidElement(p)&&!p.props.in;d&&(!c||g)?s[o]=f.cloneElement(r,{onExited:t.bind(null,r),in:!0,exit:ue(r,"exit",e),enter:ue(r,"enter",e)}):!d&&c&&!g?s[o]=f.cloneElement(r,{in:!1}):d&&c&&f.isValidElement(p)&&(s[o]=f.cloneElement(r,{onExited:t.bind(null,r),in:p.props.in,exit:ue(r,"exit",e),enter:ue(r,"enter",e)}))}}),s}var bo=Object.values||function(e){return Object.keys(e).map(function(n){return e[n]})},xo={component:"div",childFactory:function(n){return n}},ae=(function(e){Gt(n,e);function n(a,s){var o;o=e.call(this,a,s)||this;var r=o.handleExited.bind(fo(o));return o.state={contextValue:{isMounting:!0},handleExited:r,firstRender:!0},o}var t=n.prototype;return t.componentDidMount=function(){this.mounted=!0,this.setState({contextValue:{isMounting:!1}})},t.componentWillUnmount=function(){this.mounted=!1},n.getDerivedStateFromProps=function(s,o){var r=o.children,c=o.handleExited,d=o.firstRender;return{children:d?mo(s,c):go(s,r,c),firstRender:!1}},t.handleExited=function(s,o){var r=dt(this.props.children);s.key in r||(s.props.onExited&&s.props.onExited(o),this.mounted&&this.setState(function(c){var d=nt({},c.children);return delete d[s.key],{children:d}}))},t.render=function(){var s=this.props,o=s.component,r=s.childFactory,c=Ut(s,["component","childFactory"]),d=this.state.contextValue,p=bo(this.state.children).map(r);return delete c.appear,delete c.enter,delete c.exit,o===null?J.createElement($e.Provider,{value:d},p):J.createElement($e.Provider,{value:d},J.createElement(o,c,p))},n})(J.Component);ae.propTypes={};ae.defaultProps=xo;const vo=oe,yo={position:"bottom-right",autoClose:4e3,transitionDuration:250,allowDragDismiss:!0,allowScrollDismiss:!0,containerWidth:440,notificationMaxHeight:200,limit:5,zIndex:lt("overlay"),store:Dn,withinPortal:!0,pauseResetOnHover:"all"},Bt=He((e,{zIndex:n,containerWidth:t})=>({root:{"--notifications-z-index":n==null?void 0:n.toString(),"--notifications-container-width":wn(t)}})),Q=Re(e=>{const n=ve("Notifications",yo,e),{classNames:t,className:a,style:s,styles:o,unstyled:r,vars:c,attributes:d,position:p,autoClose:g,transitionDuration:v,allowDragDismiss:b,allowScrollDismiss:R,containerWidth:x,notificationMaxHeight:j,limit:S,zIndex:h,store:l,portalProps:u,withinPortal:y,pauseResetOnHover:_,...E}=n,m=Ye(),M=Tn(l),P=Yn(),F=Rt(),O=f.useRef({}),I=f.useRef(0),[A,L]=f.useState(0),ie=f.useCallback(()=>L(D=>D+1),[]),se=f.useCallback(()=>L(D=>Math.max(0,D-1)),[]),Y=m.respectReducedMotion&&F?1:v,N=Ve({name:"Notifications",classes:Ht,props:n,className:a,style:s,classNames:t,styles:o,unstyled:r,attributes:d,vars:c,varsResolver:Bt});f.useEffect(()=>{l==null||l.updateState(D=>({...D,limit:S||5,defaultPosition:p}))},[S,p]),Xe(()=>{M.notifications.length>I.current&&setTimeout(()=>P(),0),I.current=M.notifications.length},[M.notifications]);const Z=ro(M.notifications,p),z=Yt.reduce((D,U)=>(D[U]=Z[U].map(({style:$,...T})=>i.jsx(vo,{timeout:Y,onEnter:()=>O.current[T.id].offsetHeight,nodeRef:{current:O.current[T.id]},children:fe=>i.jsx(Vt,{ref:V=>{V&&(O.current[T.id]=V)},data:T,onHide:V=>On(V,l),autoClose:g,transitionDuration:Y,allowDragDismiss:b,allowScrollDismiss:R,paused:_==="all"?A>0:!1,onHoverStart:ie,onHoverEnd:se,...N("notification",{style:{...lo({state:fe,position:U,transitionDuration:Y,maxHeight:j}),...$}})})},T.id)),D),{});return i.jsxs(Ie,{withinPortal:y,...u,children:[i.jsx(w,{...N("root"),"data-position":"top-center",...E,children:i.jsx(ae,{children:z["top-center"]})}),i.jsx(w,{...N("root"),"data-position":"top-left",...E,children:i.jsx(ae,{children:z["top-left"]})}),i.jsx(w,{...N("root",{className:ht.classNames.fullWidth}),"data-position":"top-right",...E,children:i.jsx(ae,{children:z["top-right"]})}),i.jsx(w,{...N("root",{className:ht.classNames.fullWidth}),"data-position":"bottom-right",...E,children:i.jsx(ae,{children:z["bottom-right"]})}),i.jsx(w,{...N("root"),"data-position":"bottom-left",...E,children:i.jsx(ae,{children:z["bottom-left"]})}),i.jsx(w,{...N("root"),"data-position":"bottom-center",...E,children:i.jsx(ae,{children:z["bottom-center"]})})]})});Q.classes=Ht;Q.varsResolver=Bt;Q.displayName="@mantine/notifications/Notifications";Q.show=ye.show;Q.hide=ye.hide;Q.update=ye.update;Q.clean=ye.clean;Q.cleanQueue=ye.cleanQueue;Q.updateState=ye.updateState;/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const wo=[["path",{d:"M5 12l14 0",key:"svg-0"}],["path",{d:"M5 12l6 6",key:"svg-1"}],["path",{d:"M5 12l6 -6",key:"svg-2"}]],So=W("outline","arrow-left","ArrowLeft",wo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const jo=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-2.5 2.5",key:"svg-1"}],["path",{d:"M14 4l-1.201 4.805m-.802 3.207l-2 7.988",key:"svg-2"}],["path",{d:"M3 3l18 18",key:"svg-3"}]],Eo=W("outline","code-off","CodeOff",jo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const ko=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-4 4",key:"svg-1"}],["path",{d:"M14 4l-4 16",key:"svg-2"}]],_o=W("outline","code","Code",ko);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ro=[["path",{d:"M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10",key:"svg-0"}],["path",{d:"M7 20h10",key:"svg-1"}],["path",{d:"M9 16v4",key:"svg-2"}],["path",{d:"M15 16v4",key:"svg-3"}]],Mo=W("outline","device-desktop","DeviceDesktop",Ro);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Co=[["path",{d:"M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14",key:"svg-0"}],["path",{d:"M11 4h2",key:"svg-1"}],["path",{d:"M12 17v.01",key:"svg-2"}]],Po=W("outline","device-mobile","DeviceMobile",Co);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Do=[["path",{d:"M14 3v4a1 1 0 0 0 1 1h4",key:"svg-0"}],["path",{d:"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",key:"svg-1"}]],To=W("outline","file","File",Do);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oo=[["path",{d:"M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2",key:"svg-0"}]],No=W("outline","folder-open","FolderOpen",Oo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const zo=[["path",{d:"M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2",key:"svg-0"}]],Fo=W("outline","folder","Folder",zo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Io=[["path",{d:"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008",key:"svg-0"}]],Ao=W("outline","moon","Moon",Io);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const $o=[["path",{d:"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",key:"svg-0"}],["path",{d:"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",key:"svg-1"}]],Le=W("outline","refresh","Refresh",$o);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Lo=[["path",{d:"M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",key:"svg-0"}],["path",{d:"M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7",key:"svg-1"}]],Xo=W("outline","sun","Sun",Lo);function Wt({nodes:e,selected:n,onSelect:t}){return i.jsx(w,{component:"nav","aria-label":"Design files",children:e.map(a=>i.jsx(qt,{node:a,selected:n,onSelect:t,depth:0},a.modulePath??a.name))})}function qt({node:e,selected:n,onSelect:t,depth:a}){var d;const s=!!((d=e.children)!=null&&d.length),[o,r]=f.useState(!0);if(s)return i.jsxs(w,{children:[i.jsx(mt,{onClick:()=>r(p=>!p),w:"100%",py:4,pl:a*12+4,pr:8,style:{borderRadius:"var(--mantine-radius-sm)"},children:i.jsxs(w,{component:"span",style:{display:"flex",alignItems:"center",gap:4,minWidth:0},children:[i.jsx(In,{size:14,style:{flexShrink:0,transition:"transform 150ms ease",transform:o?"rotate(90deg)":void 0}}),o?i.jsx(No,{size:16,style:{flexShrink:0}}):i.jsx(Fo,{size:16,style:{flexShrink:0}}),i.jsx(B,{size:"sm",fw:500,truncate:!0,children:e.name})]})}),i.jsx(Ft,{expanded:o,children:e.children.map(p=>i.jsx(qt,{node:p,selected:n,onSelect:t,depth:a+1},p.modulePath??p.name))})]});const c=e.modulePath===n;return i.jsx(mt,{onClick:()=>e.modulePath&&t(e.modulePath),w:"100%",py:4,pl:a*12+24,pr:8,style:{borderRadius:"var(--mantine-radius-sm)",background:c?"var(--mantine-color-blue-light)":void 0},children:i.jsxs(w,{component:"span",style:{display:"flex",alignItems:"center",gap:6,minWidth:0},children:[i.jsx(To,{size:15,style:{flexShrink:0,opacity:.7}}),i.jsx(B,{size:"sm",truncate:!0,c:c?"blue":void 0,fw:c?500:void 0,children:e.name})]})})}function Yo(e){const n="/ckk-tool-v3/design-preview/",t=new URL(`${n}frame.html`,window.location.origin);return t.searchParams.set("design",e.design),t.searchParams.set("viewport",e.viewport),t.searchParams.set("scheme",e.scheme),t.searchParams.set("mode",e.mode),e.remountKey!=null&&t.searchParams.set("t",String(e.remountKey)),`${t.pathname}${t.search}`}function Vo({url:e,design:n,viewport:t="desktop",scheme:a,mode:s,remountKey:o=0,onViewportChange:r}){const c=t==="mobile",d=Yo({design:n,viewport:t,scheme:a,mode:s,remountKey:o});return i.jsxs(w,{style:{border:"1px solid var(--mantine-color-default-border)",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",background:"var(--mantine-color-body)",display:"flex",flexDirection:"column",width:"100%",maxWidth:c?390:1280,margin:"0 auto"},children:[i.jsxs(w,{style:{background:"var(--mantine-color-default-hover)",borderBottom:"1px solid var(--mantine-color-default-border)",padding:"10px 14px 10px",flexShrink:0},children:[i.jsxs(K,{gap:8,mb:10,justify:"space-between",children:[i.jsxs(K,{gap:8,children:[i.jsx(w,{style:{width:12,height:12,borderRadius:"50%",background:"#ff5f57",border:"1px solid rgba(0,0,0,0.12)"}}),i.jsx(w,{style:{width:12,height:12,borderRadius:"50%",background:"#febc2e",border:"1px solid rgba(0,0,0,0.12)"}}),i.jsx(w,{style:{width:12,height:12,borderRadius:"50%",background:"#28c840",border:"1px solid rgba(0,0,0,0.12)"}})]}),i.jsx(ne,{label:c?"Switch to desktop":"Switch to mobile",withArrow:!0,children:i.jsx(te,{variant:"subtle",color:"gray",size:"sm","aria-label":c?"Switch to desktop":"Switch to mobile",onClick:()=>r==null?void 0:r(c?"desktop":"mobile"),children:c?i.jsx(Mo,{size:14}):i.jsx(Po,{size:14})})})]}),i.jsxs(K,{gap:6,align:"center",children:[i.jsx(te,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Back",children:i.jsx(So,{size:14})}),i.jsx(te,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Forward",children:i.jsx(An,{size:14})}),i.jsx(te,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Reload",children:i.jsx(Le,{size:14})}),i.jsxs(w,{style:{flex:1,background:"var(--mantine-color-default)",borderRadius:6,padding:"4px 10px",border:"1px solid var(--mantine-color-default-border)",display:"flex",alignItems:"center",gap:6},children:[i.jsx($n,{size:11,color:"var(--mantine-color-green-6)",style:{flexShrink:0}}),i.jsx(B,{size:"xs",c:"dimmed",ff:"mono",truncate:!0,children:e})]})]})]}),i.jsx("iframe",{title:"Design preview",src:d,style:{width:"100%",height:c?700:600,border:0,display:"block",background:"var(--mantine-color-body)"}},d)]})}function Fe(e,n){const[t,a]=f.useState(()=>new URLSearchParams(window.location.search).get(e)??n),s=f.useCallback(o=>{const r=new URLSearchParams(window.location.search);o?r.set(e,o):r.delete(e),window.history.replaceState(null,"",`?${r.toString()}`),a(o)},[e]);return[t,s]}function Ze(e,n){return n.trim().split(".").reduce((t,a)=>{if(t!=null&&typeof t=="object")return t[a]},e)}function yt(e,n,t){const a=`{{#${t} `,s=`{{/${t}}}`;let o=1,r=n;for(;r<e.length;){const c=e.indexOf(a,r),d=e.indexOf(s,r);if(d===-1)throw new Error(`Unclosed {{#${t}}}`);if(c!==-1&&c<d)o++,r=c+a.length;else{if(o--,o===0)return{inner:e.slice(n,d),after:d+s.length};r=d+s.length}}throw new Error(`Unclosed {{#${t}}}`)}function Ho(e,n){return st(e,n)}function st(e,n){const t=[];let a=0;for(;a<e.length;){const s=e.indexOf("{{",a);if(s===-1){t.push(e.slice(a));break}s>a&&t.push(e.slice(a,s));const o=e.indexOf("}}",s+2);if(o===-1){t.push(e.slice(s));break}const r=e.slice(s+2,o).trim();if(r.startsWith("#each ")){const c=r.slice(6).trim(),{inner:d,after:p}=yt(e,o+2,"each"),g=Ze(n,c);if(Array.isArray(g))for(const v of g){const b=v!=null&&typeof v=="object"?{...n,...v}:n;t.push(st(d,b))}a=p}else if(r.startsWith("#if ")){const c=r.slice(4).trim(),{inner:d,after:p}=yt(e,o+2,"if");Ze(n,c)&&t.push(st(d,n)),a=p}else if(r.startsWith("/"))a=o+2;else{const c=Ze(n,r);t.push(c!=null?String(c):""),a=o+2}}return t.join("")}const Uo=`/* Shared base styles for every PDF template. Flat / minimal: monochrome,
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
`,pe="../pdf-templates/",Jt=Object.assign({"../pdf-templates/delivery-note.html":()=>X(()=>import("./delivery-note-sS540Im8.js"),[]).then(e=>e.default),"../pdf-templates/invoice.html":()=>X(()=>import("./invoice-StFHx3KR.js"),[]).then(e=>e.default),"../pdf-templates/order-acceptance.html":()=>X(()=>import("./order-acceptance-BbS0QBIR.js"),[]).then(e=>e.default),"../pdf-templates/quote.html":()=>X(()=>import("./quote-D04Kgwym.js"),[]).then(e=>e.default),"../pdf-templates/sales-order.html":()=>X(()=>import("./sales-order-Pfi3KWgJ.js"),[]).then(e=>e.default),"../pdf-templates/shipping-order.html":()=>X(()=>import("./shipping-order-CCos47B1.js"),[]).then(e=>e.default),"../pdf-templates/work-order.html":()=>X(()=>import("./work-order-fQdaFa_A.js"),[]).then(e=>e.default)}),Kt=Object.assign({"../pdf-templates/data/delivery-note.json":()=>X(()=>import("./delivery-note-mJ0mI4A8.js"),[]).then(e=>e.default),"../pdf-templates/data/invoice.json":()=>X(()=>import("./invoice-Cg5_V8mw.js"),[]).then(e=>e.default),"../pdf-templates/data/order-acceptance.json":()=>X(()=>import("./order-acceptance-0HF1S_ea.js"),[]).then(e=>e.default),"../pdf-templates/data/quote.json":()=>X(()=>import("./quote-BaHbwZiH.js"),[]).then(e=>e.default),"../pdf-templates/data/sales-order.json":()=>X(()=>import("./sales-order-G83QBgvp.js"),[]).then(e=>e.default),"../pdf-templates/data/shipping-order.json":()=>X(()=>import("./shipping-order-DsBIT-FR.js"),[]).then(e=>e.default),"../pdf-templates/data/work-order.json":()=>X(()=>import("./work-order-C9KROCEx.js"),[]).then(e=>e.default)}),ke=Object.keys(Jt).sort((e,n)=>Ae(e,pe,"html").localeCompare(Ae(n,pe,"html"))),wt=Nt(ke,pe,"html");function St(e){const n=e.replace(pe,"").replace(/\.html$/,""),t=`${pe}data/${n}.json`;return t in Kt?t:null}const jt=794,Et=1123,Go=`@font-face {
  font-family: 'Noto Sans JP';
  src: url('${window.location.origin}/ckk-tool-v3/design-preview/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}`;function Bo(e){const n=`<style>
${Go}
</style>`,t=`<style>
${Uo}
</style>`,a="<style>body { padding: 10mm !important; }</style>",s=/<link[^>]*href=["']base\.css["'][^>]*\/?>/i,o=s.test(e)?e.replace(s,t):e.includes("<head>")?e.replace("<head>",`<head>
${t}`):t+e,r=`${n}
${a}`;return o.includes("</head>")?o.replace("</head>",`${r}
</head>`):r+o}function Wo(){const[e,n]=Fe("template",ke[0]??""),t=ke.includes(e)?e:ke[0]??null,a=m=>n(m??""),[s,o]=f.useState(null),[r,c]=f.useState("{}"),[d,p]=f.useState("{}"),[g,v]=f.useState(!1),[b,R]=f.useState(!1),[x,j]=f.useState(!1),[S,h]=f.useState(0);f.useEffect(()=>{if(!t){o(null),p("{}"),c("{}");return}v(!0),o(null);const m=St(t);Promise.all([Jt[t](),m?Kt[m]():Promise.resolve(null)]).then(([M,P])=>{o(M);const F=P||"{}";c(F),p(F),v(!1)})},[t,S]);const{processedHtml:l,jsonError:u}=f.useMemo(()=>{if(!s)return{processedHtml:null,jsonError:null};try{const m=JSON.parse(d);return{processedHtml:Ho(s,m),jsonError:null}}catch(m){return{processedHtml:s,jsonError:String(m)}}},[s,d]);async function y(){var m;if(!(!t||b)){R(!0);try{const M=t.slice(pe.length),P=await fetch(`/api/pdf?template=${encodeURIComponent(M)}`,{method:"POST"});if(!P.ok)throw new Error(`PDF generation returned ${P.status}`);const F=await P.blob(),O=P.headers.get("content-disposition"),I=((m=O==null?void 0:O.match(/filename="?([^"]+)"?/))==null?void 0:m[1])??`${_??"template"}.pdf`,A=URL.createObjectURL(F),L=document.createElement("a");L.href=A,L.download=I,document.body.appendChild(L),L.click(),document.body.removeChild(L),URL.revokeObjectURL(A)}catch(M){console.error("PDF generation failed:",M)}finally{R(!1)}}}const _=t?Ae(t,pe,"html"):null,E=St(t??"")!==null;return i.jsxs(w,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(w,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsx(zt,{h:"100%",p:"xs",children:wt.length===0?i.jsx(B,{size:"sm",c:"dimmed",p:"xs",children:"No .html files in pdf-templates/ yet."}):i.jsx(Wt,{nodes:wt,selected:t,onSelect:a})})}),i.jsxs(w,{style:{flex:1,display:"flex",flexDirection:"column",minHeight:0},children:[t&&i.jsx(w,{px:"md",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)",flexShrink:0},children:i.jsxs(K,{justify:"space-between",children:[i.jsx(B,{size:"sm",c:"dimmed",ff:"monospace",children:_}),i.jsxs(K,{gap:"xs",children:[i.jsx(te,{variant:"default",title:"Reload template",onClick:()=>h(m=>m+1),children:i.jsx(Le,{size:16})}),E&&i.jsx(ne,{label:x?"Hide data editor":"Edit JSON data",children:i.jsx(te,{variant:x?"filled":"default",onClick:()=>j(m=>!m),children:x?i.jsx(Eo,{size:16}):i.jsx(_o,{size:16})})}),i.jsx(Sn,{size:"xs",leftSection:i.jsx(Ln,{size:14}),onClick:y,disabled:!l,loading:b,children:"Save PDF"})]})]})}),i.jsxs(w,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(w,{style:{flex:1,overflow:"auto",background:"var(--mantine-color-gray-2)",padding:32},children:t?g?i.jsx(et,{style:{minHeight:"100%"},children:i.jsxs(tt,{align:"center",gap:"xs",children:[i.jsx(Mt,{size:"sm"}),i.jsx(B,{size:"sm",c:"dimmed",children:"Loading…"})]})}):l?i.jsx(w,{style:{width:jt,minHeight:Et,background:"white",boxShadow:"0 4px 32px rgba(0,0,0,0.18)",margin:"0 auto",overflow:"hidden"},children:i.jsx("iframe",{srcDoc:Bo(l),title:_??"PDF Template",style:{width:jt,height:Et,border:"none",display:"block"}},`${t}-${S}-${d}`)}):null:i.jsx(et,{style:{minHeight:"100%"},children:i.jsx(B,{c:"dimmed",children:ke.length===0?"Drop an .html file into design-preview/pdf-templates/ to get started.":"Select a template from the tree on the left."})})}),x&&i.jsxs(w,{w:380,style:{flexShrink:0,borderLeft:"1px solid var(--mantine-color-default-border)",display:"flex",flexDirection:"column",background:"var(--mantine-color-body)"},children:[i.jsx(w,{px:"sm",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",flexShrink:0},children:i.jsxs(K,{justify:"space-between",children:[i.jsxs(K,{gap:"xs",children:[i.jsx(B,{size:"xs",fw:600,children:"JSON Data"}),u&&i.jsx(ne,{label:u,multiline:!0,w:260,withArrow:!0,children:i.jsx(jn,{color:"red",size:"xs",style:{cursor:"help"},children:"Parse error"})})]}),i.jsx(ne,{label:"Reset to default",children:i.jsx(te,{size:"xs",variant:"subtle",onClick:()=>p(r),disabled:d===r,children:i.jsx(Le,{size:12})})})]})}),i.jsx("textarea",{value:d,onChange:m=>p(m.target.value),spellCheck:!1,style:{flex:1,resize:"none",border:"none",outline:"none",padding:"10px 12px",fontFamily:'ui-monospace, "Cascadia Code", "Fira Code", monospace',fontSize:"11px",lineHeight:1.6,background:"var(--mantine-color-body)",color:"var(--mantine-color-text)"}})]})]})]})]})}const kt=Nt(je);function qo(e){return`https://ckk.local/${e.replace("../designs/","").replace(/\.tsx$/,"").split("/").map(a=>a.replace(/([A-Z])/g,(s,o,r)=>r===0?o.toLowerCase():`-${o.toLowerCase()}`)).join("/")}`}function Jo(){const[e,n]=Fe("mode","ui"),t=e==="pdf"?"pdf":"ui",[a,s]=Fe("design",je[0]??""),o=je.includes(a)?a:je[0]??null,r=h=>s(h??""),[c,d]=Fe("viewport","desktop"),p=c==="mobile"?"mobile":"desktop",[g,v]=f.useState(0),{toggleColorScheme:b}=Nn(),x=zn("light",{getInitialValueInEffect:!1})==="dark"?"dark":"light",j=x==="dark",S=o&&En(o)?"component":"page";return i.jsxs(tt,{gap:0,h:"100vh",children:[i.jsx(w,{p:"sm",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsxs(K,{justify:"space-between",children:[i.jsxs(K,{gap:"sm",children:[i.jsx(kn,{order:5,style:{flexShrink:0},children:"Design Preview"}),t==="ui"&&o&&i.jsx(B,{size:"sm",c:"dimmed",ff:"monospace",children:Ae(o)})]}),i.jsxs(K,{gap:"xs",children:[t==="ui"&&i.jsx(te,{variant:"default",title:"Re-render",onClick:()=>v(h=>h+1),children:i.jsx(Le,{size:16})}),i.jsx(te,{variant:"default",title:j?"ライトモード":"ダークモード",onClick:()=>b(),"aria-label":"カラーモード切替",children:j?i.jsx(Xo,{size:16}):i.jsx(Ao,{size:16})}),i.jsx(Fn,{size:"xs",value:t,onChange:h=>n(h),data:[{label:"UI Designs",value:"ui"},{label:"PDF Templates",value:"pdf"}]})]})]})}),t==="pdf"?i.jsx(Wo,{}):i.jsxs(w,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(w,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsx(zt,{h:"100%",p:"xs",children:kt.length===0?i.jsx(B,{size:"sm",c:"dimmed",p:"xs",children:"No .tsx files in designs/ yet."}):i.jsx(Wt,{nodes:kt,selected:o,onSelect:r})})}),i.jsx(w,{style:{flex:1,overflow:"auto",background:j?"var(--mantine-color-dark-8)":"var(--mantine-color-gray-2)",padding:24},children:o?i.jsx(Vo,{url:qo(o),design:o,viewport:p,scheme:x,mode:S,remountKey:g,onViewportChange:d}):i.jsx(et,{style:{minHeight:"100%"},children:i.jsx(tt,{align:"center",gap:"xs",children:i.jsx(B,{c:"dimmed",children:je.length===0?"Drop a .tsx file into design-preview/designs/ to get started.":"Select a design file from the tree on the left."})})})})]})]})}const Qt=document.createElement("style");Qt.textContent="@font-face { font-family: 'Noto Sans JP'; src: url('/ckk-tool-v3/design-preview/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }";document.head.appendChild(Qt);_n.createRoot(document.getElementById("root")).render(i.jsx(J.StrictMode,{children:i.jsx(Rn,{theme:Cn,colorSchemeManager:Mn,children:i.jsxs(Pn,{settings:{locale:"ja"},children:[i.jsx(Q,{}),i.jsx(Jo,{})]})})}));
