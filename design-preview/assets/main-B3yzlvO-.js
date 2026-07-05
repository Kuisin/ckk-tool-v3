import{aC as f,aL as $e,aB as le,as as nt,$ as Le,a$ as Fe,aW as It,aY as Xe,b1 as ot,aq as o,a as v,b4 as it,L as st,e as At,V as rt,ai as $t,ad as Lt,a_ as Ft,R as V,q as Se,O as Xt,s as We,a6 as Yt,aD as Vt,U as Be,v as L,G as U,a2 as je,J as at,_ as O,S as lt,b as Ut,C as Pe,u as Te,B as Ht,X as ue,al as Wt,x as Bt,r as Gt,l as qt,aF as Jt,ay as Kt,g as Qt}from"./design-modules-DfBLnkkZ.js";import{a as Zt,u as en,h as tn,n as ce}from"./notifications.store-B6ib3hmG.js";import{g as Oe,T as me}from"./Tooltip-Da_C_nnG.js";import{a as nn,u as on}from"./use-computed-color-scheme-DwJu2lfV.js";import{A as B}from"./ActionIcon-WkheJnco.js";import{S as sn}from"./SegmentedControl-BaSjWiaH.js";import{S as rn}from"./Switch-M-8P5Yn-.js";import{I as an}from"./IconChevronRight-DTfS-4kl.js";import{c as H}from"./createReactComponent-37BJI_gr.js";import{I as ln}from"./IconArrowRight-pK2jnHfP.js";import{I as Ee}from"./IconRefresh-CBZBZ8Zu.js";import{I as cn}from"./IconLock-DihsjvMJ.js";import{I as dn}from"./IconDownload-ObKmor9n.js";import"./get-env-B-6RN2XZ.js";import"./InlineInput-B6djqE_3.js";const un=e=>(e+1)%1e6;function fn(){const[,e]=f.useReducer(un,0);return e}function pn(e){if(!e||typeof e=="string")return 0;const s=e/36;return Math.round((4+15*s**.25+s/5)*10)}function Re(e){return e.current?e.current.scrollHeight:"auto"}function hn({transitionDuration:e,transitionTimingFunction:s="ease",onTransitionEnd:n,onTransitionStart:a,expanded:i,keepMounted:t}){const r={height:0,overflow:"hidden",...t?{}:{display:"none"}},c=f.useEffectEvent(()=>a==null?void 0:a()),u=f.useRef(null),[p,g]=f.useState(i?{}:r),[w,m]=f.useState(i?"entered":"exited"),k=h=>{le.flushSync(()=>g(h))},x=h=>{k(l=>({...l,...h}))},C=h=>{const l=e??pn(h);return{transition:`height ${l}ms ${s}, opacity ${l}ms ${s}`}};$e(()=>{e!==0&&c(),i?window.requestAnimationFrame(()=>{le.flushSync(()=>m("entering")),x({willChange:"height",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const h=Re(u);x({...C(h),height:h})})}):window.requestAnimationFrame(()=>{le.flushSync(()=>m("exiting"));const h=Re(u);x({...C(h),willChange:"height",height:h}),window.requestAnimationFrame(()=>x({height:0,overflow:"hidden"}))})},[i]);const _=h=>{if(!(h.target!==u.current||h.propertyName!=="height"))if(i){const l=Re(u);l===p.height?k({}):x({height:l}),m("entered"),n==null||n()}else p.height===0&&(k(r),m("exited"),n==null||n())};return{state:w,getCollapseProps:h=>({"aria-hidden":!i,inert:!i,ref:nt(u,h==null?void 0:h.ref),onTransitionEnd:_,style:{boxSizing:"border-box",...h==null?void 0:h.style,...p}})}}function mn(e){if(!e||typeof e=="string")return 0;const s=e/36;return Math.round((4+15*s**.25+s/5)*10)}function Me(e){return e.current?e.current.scrollWidth:"auto"}function gn({transitionDuration:e,transitionTimingFunction:s="ease",onTransitionEnd:n,onTransitionStart:a,expanded:i,keepMounted:t}){const r={width:0,overflow:"hidden",...t?{}:{display:"none"}},c=f.useEffectEvent(()=>a==null?void 0:a()),u=f.useRef(null),[p,g]=f.useState(i?{}:r),[w,m]=f.useState(i?"entered":"exited"),k=h=>{le.flushSync(()=>g(h))},x=h=>{k(l=>({...l,...h}))},C=h=>{const l=e??mn(h);return{transition:`width ${l}ms ${s}, opacity ${l}ms ${s}`}};$e(()=>{e!==0&&c(),i?window.requestAnimationFrame(()=>{le.flushSync(()=>m("entering")),x({willChange:"width",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const h=Me(u);x({...C(h),width:h})})}):window.requestAnimationFrame(()=>{le.flushSync(()=>m("exiting"));const h=Me(u);x({...C(h),willChange:"width",width:h}),window.requestAnimationFrame(()=>x({width:0,overflow:"hidden"}))})},[i]);const _=h=>{if(!(h.target!==u.current||h.propertyName!=="width"))if(i){const l=Me(u);l===p.width?k({}):x({width:l}),m("entered"),n==null||n()}else p.width===0&&(k(r),m("exited"),n==null||n())};return{state:w,getCollapseProps:h=>({"aria-hidden":!i,inert:!i,ref:nt(u,h==null?void 0:h.ref),onTransitionEnd:_,style:{boxSizing:"border-box",...h==null?void 0:h.style,...p}})}}const bn=100;function se(e){return e>0?1:e<0?-1:0}function Ge(e){const s=e??0;return typeof s=="number"?[s,s]:s}function xn(){return{isActive:!1,pointerId:-1,startXY:[0,0],prevXY:[0,0],startTimestamp:0,prevTimestamp:0,thresholdMet:!1,firstFired:!1,lockedAxis:null,canceled:!1,lastVelocity:[0,0]}}function vn(e,s={}){const[n,a]=f.useState(!1),i=f.useRef(e);i.current=e;const t=f.useRef(s);t.current=s;const r=f.useRef(xn()),c=f.useRef(null);return{ref:f.useCallback(u=>{if(!u)return;const p=new AbortController,g=l=>{const d=t.current,S=r.current;if(d.axis==="x")return[l[0],0];if(d.axis==="y")return[0,l[1]];if(d.axis==="lock"){if(S.lockedAxis===null){const j=d.axisThreshold??1;(Math.abs(l[0])>j||Math.abs(l[1])>j)&&(S.lockedAxis=Math.abs(l[0])>=Math.abs(l[1])?"x":"y")}if(S.lockedAxis==="x")return[l[0],0];if(S.lockedAxis==="y")return[0,l[1]]}return l},w=()=>{var d;const l=r.current;l.isActive=!1,l.pointerId=-1,l.thresholdMet=!1,l.firstFired=!1,l.lockedAxis=null,l.canceled=!1,a(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="",(d=c.current)==null||d.abort(),c.current=null},m=()=>{r.current.isActive&&(r.current.canceled=!0,w())},k=()=>{a(!0),document.body.style.userSelect="none",document.body.style.webkitUserSelect="none"},x=l=>{var b;if(t.current.enabled===!1||l.button!==0||r.current.isActive)return;const d=r.current;d.isActive=!0,d.pointerId=l.pointerId,d.startXY=[l.clientX,l.clientY],d.prevXY=[l.clientX,l.clientY],d.startTimestamp=l.timeStamp,d.prevTimestamp=l.timeStamp,d.thresholdMet=!1,d.firstFired=!1,d.lockedAxis=null,d.canceled=!1,d.lastVelocity=[0,0];const[S,j]=Ge(t.current.threshold);S===0&&j===0&&(d.thresholdMet=!0,d.firstFired=!0,k(),i.current({xy:[l.clientX,l.clientY],initial:[l.clientX,l.clientY],movement:[0,0],delta:[0,0],distance:[0,0],direction:[0,0],velocity:[0,0],elapsedTime:0,first:!0,last:!1,active:!0,tap:!1,canceled:!1,cancel:m,event:l})),(b=c.current)==null||b.abort(),c.current=new AbortController;const E=c.current.signal;document.addEventListener("pointermove",C,{signal:E}),document.addEventListener("pointerup",_,{signal:E}),document.addEventListener("pointercancel",h,{signal:E})},C=l=>{const d=r.current;if(!d.isActive||l.pointerId!==d.pointerId)return;const S=[l.clientX-d.startXY[0],l.clientY-d.startXY[1]];if(!d.thresholdMet){const[N,D]=Ge(t.current.threshold);if(Math.abs(S[0])<N&&Math.abs(S[1])<D){d.prevXY=[l.clientX,l.clientY],d.prevTimestamp=l.timeStamp;return}d.thresholdMet=!0,k()}const j=g(S),E=g([l.clientX-d.prevXY[0],l.clientY-d.prevXY[1]]),b=l.timeStamp-d.prevTimestamp,R=b>0?[Math.abs(E[0])/b,Math.abs(E[1])/b]:d.lastVelocity;d.lastVelocity=R;const M=!d.firstFired;d.firstFired=!0,d.prevXY=[l.clientX,l.clientY],d.prevTimestamp=l.timeStamp,i.current({xy:[l.clientX,l.clientY],initial:[...d.startXY],movement:j,delta:E,distance:[Math.abs(j[0]),Math.abs(j[1])],direction:[se(E[0]),se(E[1])],velocity:R,elapsedTime:l.timeStamp-d.startTimestamp,first:M,last:!1,active:!0,tap:!1,canceled:!1,cancel:m,event:l})},_=l=>{const d=r.current;if(!d.isActive||l.pointerId!==d.pointerId)return;const S=t.current;if(!d.thresholdMet){if(S.filterTaps){const D=g([l.clientX-d.startXY[0],l.clientY-d.startXY[1]]),F=[Math.abs(D[0]),Math.abs(D[1])],X=Math.max(F[0],F[1])<(S.tapThreshold??3);i.current({xy:[l.clientX,l.clientY],initial:[...d.startXY],movement:D,delta:D,distance:F,direction:[se(D[0]),se(D[1])],velocity:[0,0],elapsedTime:l.timeStamp-d.startTimestamp,first:!0,last:!0,active:!1,tap:X,canceled:!1,cancel:m,event:l})}w();return}const j=g([l.clientX-d.startXY[0],l.clientY-d.startXY[1]]),E=[Math.abs(j[0]),Math.abs(j[1])],b=g([l.clientX-d.prevXY[0],l.clientY-d.prevXY[1]]),R=l.timeStamp-d.prevTimestamp>bn?[0,0]:d.lastVelocity,M=Math.max(E[0],E[1]),N=S.filterTaps===!0&&M<(S.tapThreshold??3);i.current({xy:[l.clientX,l.clientY],initial:[...d.startXY],movement:j,delta:b,distance:E,direction:[se(b[0]),se(b[1])],velocity:R,elapsedTime:l.timeStamp-d.startTimestamp,first:!d.firstFired,last:!0,active:!1,tap:N,canceled:!1,cancel:m,event:l}),w()},h=l=>{const d=r.current;if(!d.isActive||l.pointerId!==d.pointerId)return;const S=g([l.clientX-d.startXY[0],l.clientY-d.startXY[1]]);i.current({xy:[l.clientX,l.clientY],initial:[...d.startXY],movement:S,delta:[0,0],distance:[Math.abs(S[0]),Math.abs(S[1])],direction:[0,0],velocity:[0,0],elapsedTime:l.timeStamp-d.startTimestamp,first:!d.firstFired,last:!0,active:!1,tap:!1,canceled:!0,cancel:m,event:l}),w()};return u.addEventListener("pointerdown",x,{signal:p.signal}),()=>{var l;p.abort(),(l=c.current)==null||l.abort(),c.current=null,r.current.isActive&&(r.current.isActive=!1,a(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="")}},[]),active:n}}const yn={transitionDuration:200,transitionTimingFunction:"ease",animateOpacity:!0,orientation:"vertical"},ct=Le(e=>{const{children:s,expanded:n,transitionDuration:a,transitionTimingFunction:i,style:t,onTransitionEnd:r,onTransitionStart:c,animateOpacity:u,keepMounted:p,ref:g,orientation:w,...m}=Fe("Collapse",yn,e),k=It(),x=Xe(),C=ot(),_=x.respectReducedMotion&&C?0:a,h=(w==="horizontal"?gn:hn)({expanded:n,transitionDuration:_,transitionTimingFunction:i,onTransitionEnd:r,onTransitionStart:c,keepMounted:!1});if(_===0)return p===!0&&k!=="test"?o.jsx(f.Activity,{mode:n?"visible":"hidden",children:o.jsx(v,{...m,children:s})}):n?o.jsx(v,{...m,children:s}):null;const l=h.state==="exited";let d;return p===!1?d=l?null:s:p===!0?d=o.jsx(f.Activity,{mode:l?"hidden":"visible",children:s}):d=s,o.jsx(v,{...m,...h.getCollapseProps({style:{opacity:n||!u?1:0,transition:u?`opacity ${_}ms ${i}`:"none",...Oe(t,x)},ref:g}),children:d})});ct.displayName="@mantine/core/Collapse";var dt={root:"m_a513464",icon:"m_a4ceffb",loader:"m_b0920b15",body:"m_a49ed24",title:"m_3feedf16",description:"m_3d733a3a",closeButton:"m_919a4d88"};const wn={withCloseButton:!0},ut=rt((e,{radius:s,color:n})=>({root:{"--notification-radius":s===void 0?void 0:Lt(s),"--notification-color":n?$t(n,e):void 0}})),_e=Le(e=>{const s=Fe("Notification",wn,e),{className:n,color:a,radius:i,loading:t,withCloseButton:r,withBorder:c,title:u,icon:p,children:g,onClose:w,closeButtonProps:m,classNames:k,style:x,styles:C,unstyled:_,vars:h,mod:l,loaderProps:d,role:S,attributes:j,...E}=s,b=it({name:"Notification",classes:dt,props:s,className:n,style:x,classNames:k,styles:C,unstyled:_,attributes:j,vars:h,varsResolver:ut});return o.jsxs(v,{...b("root"),mod:[{"data-with-icon":!!p||t,"data-with-border":c},l],role:S||"alert",...E,children:[p&&!t&&o.jsx("div",{...b("icon"),children:p}),t&&o.jsx(st,{size:28,color:a,...b("loader"),...d}),o.jsxs("div",{...b("body"),children:[u&&o.jsx("div",{...b("title"),children:u}),o.jsx(v,{...b("description"),mod:{"data-with-title":!!u},children:g})]}),r&&o.jsx(At,{iconSize:16,color:"gray",...m,unstyled:_,onClick:R=>{var M;(M=m==null?void 0:m.onClick)==null||M.call(m,R),w==null||w()},...b("closeButton")})]})});_e.classes=dt;_e.varsResolver=ut;_e.displayName="@mantine/core/Notification";const ft=["bottom-center","bottom-left","bottom-right","top-center","top-left","top-right"];function Sn(e,s){return e.reduce((n,a)=>(n[a.position||s].push(a),n),ft.reduce((n,a)=>(n[a]=[],n),{}))}const qe={left:"translateX(-100%)",right:"translateX(100%)","top-center":"translateY(-100%)","bottom-center":"translateY(100%)"},jn={left:"translateX(0)",right:"translateX(0)","top-center":"translateY(0)","bottom-center":"translateY(0)"};function En({state:e,maxHeight:s,position:n,transitionDuration:a}){const[i,t]=n.split("-"),r=t==="center"?`${i}-center`:t,c={opacity:0,maxHeight:s,transform:qe[r],transitionDuration:`${a}ms, ${a}ms, ${a}ms`,transitionTimingFunction:"cubic-bezier(.51,.3,0,1.21), cubic-bezier(.51,.3,0,1.21), linear",transitionProperty:"opacity, transform, max-height"},u={opacity:1,transform:jn[r]},p={opacity:0,maxHeight:0,transform:qe[r]};return{...c,...{entering:u,entered:u,exiting:p,exited:p}[e]}}function kn(e,s){return typeof s=="number"?s:s===!1||e===!1?!1:e}const _n=120;function pt({data:e,onHide:s,autoClose:n,transitionDuration:a,allowDragDismiss:i,allowScrollDismiss:t,paused:r,onHoverStart:c,onHoverEnd:u,ref:p,style:g,...w}){const[m,k]=f.useState(0),[x,C]=f.useState(!1),[_,h]=f.useState(1),[l,d]=f.useState(!1),S=Xe(),{autoClose:j,message:E,allowClose:b,position:R,style:M,withCloseButton:N,onOpen:D,...F}=e,X=kn(n,e.autoClose),I=f.useRef(-1),ge=f.useRef(-1),be=f.useRef(-1),q=f.useRef(null),z=f.useRef(!1),xe=f.useRef(0),Y=b===!1,P=()=>window.clearTimeout(I.current),K=()=>window.clearTimeout(ge.current),Q=()=>window.clearTimeout(be.current),T=y=>{xe.current=y,k(y)},de=()=>{s(e.id),P(),K(),Q()},A=()=>{x||ve||r||z.current||typeof X!="number"||(I.current=window.setTimeout(de,X))},Ve=y=>{var $;return y*(((($=q.current)==null?void 0:$.offsetWidth)??440)+40)},Ue=(y,$)=>{var we;const Z=((we=q.current)==null?void 0:we.offsetWidth)??440;return Math.abs(y)>Z*.35||$>.5},jt=()=>{Q(),d(!1),T(0)},He=y=>{h(y),C(!0),d(!1),T(Ve(y)),P(),K(),Q(),ge.current=window.setTimeout(de,a)},Et=()=>{Q(),be.current=window.setTimeout(()=>{d(!1),T(0),A()},_n)},{ref:kt,active:ve}=vn(y=>{if(!x)if(y.first&&P(),y.last){if(y.tap||y.canceled){T(0),A();return}const $=y.movement[0],Z=$===0?y.direction[0]===-1?-1:1:$>0?1:-1;Ue($,y.velocity[0])?He(Z):(T(0),A())}else T(y.movement[0])},{axis:"x",threshold:5,filterTaps:!0,enabled:i&&!Y&&!x}),_t=Ft(p,q,kt),Ct=Oe(g,S),Rt=Oe(M,S),ie={...Ct,...Rt},Mt=typeof ie.opacity=="number"?ie.opacity:1,Dt=x?0:1-Math.min(Math.abs(m)/200,1)*.6,Pt=ie.transitionDuration??`${a}ms, ${a}ms, ${a}ms`,Tt={...ie,"--notifications-state-transform":typeof ie.transform=="string"?ie.transform:"translateX(0)","--notifications-state-opacity":String(Mt),"--notifications-swipe-offset":`${m}px`,"--notifications-swipe-opacity":String(Dt),transform:"var(--notifications-state-transform) translate3d(var(--notifications-swipe-offset), 0, 0)",opacity:"calc(var(--notifications-state-opacity) * var(--notifications-swipe-opacity))",transitionDuration:ve||l?"0ms, 0ms, 0ms":Pt,cursor:"default",touchAction:"pan-y"},Ot=()=>{z.current=!0,P(),c==null||c()},Nt=()=>{z.current=!1,l||(jt(),A()),u==null||u()},ye=f.useEffectEvent(y=>{if(x||ve)return;const $=y.currentTarget===document;if(!$&&!z.current)return;const{deltaX:Z,deltaY:we}=y;if(Math.abs(Z)<=Math.abs(we)||Z===0||!t||Y)return;$||(y.preventDefault(),y.stopPropagation()),P(),d(!0);const Ce=xe.current-Z,zt=Ce>0?1:-1;if(Ue(Ce,0)){He(zt);return}T(Ce),Et()});return f.useEffect(()=>{if(l)return document.addEventListener("wheel",ye,{passive:!1}),()=>document.removeEventListener("wheel",ye,{passive:!1})},[l]),f.useEffect(()=>{const y=()=>{x&&T(Ve(_))};return window.addEventListener("resize",y),()=>window.removeEventListener("resize",y)},[_,x]),f.useEffect(()=>{const y=q.current;if(y)return y.addEventListener("wheel",ye,{passive:!1}),()=>y.removeEventListener("wheel",ye,{passive:!1})},[]),f.useEffect(()=>()=>{K(),Q()},[]),f.useEffect(()=>{var y;(y=e.onOpen)==null||y.call(e,e)},[]),f.useEffect(()=>(A(),P),[X,ve,x]),f.useEffect(()=>(r?P():A(),P),[r]),o.jsx(_e,{ref:_t,...w,style:Tt,...F,withCloseButton:Y?!1:N,onClose:de,onMouseEnter:Ot,onMouseLeave:Nt,children:E})}pt.displayName="@mantine/notifications/NotificationContainer";var ht={root:"m_b37d9ac7",notification:"m_5ed0edd0"};function Ne(){return Ne=Object.assign?Object.assign.bind():function(e){for(var s=1;s<arguments.length;s++){var n=arguments[s];for(var a in n)({}).hasOwnProperty.call(n,a)&&(e[a]=n[a])}return e},Ne.apply(null,arguments)}function mt(e,s){if(e==null)return{};var n={};for(var a in e)if({}.hasOwnProperty.call(e,a)){if(s.indexOf(a)!==-1)continue;n[a]=e[a]}return n}function ze(e,s){return ze=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(n,a){return n.__proto__=a,n},ze(e,s)}function gt(e,s){e.prototype=Object.create(s.prototype),e.prototype.constructor=e,ze(e,s)}const Je={disabled:!1},ke=V.createContext(null);var Cn=function(s){return s.scrollTop},fe="unmounted",ee="exited",te="entering",ae="entered",Ie="exiting",G=(function(e){gt(s,e);function s(a,i){var t;t=e.call(this,a,i)||this;var r=i,c=r&&!r.isMounting?a.enter:a.appear,u;return t.appearStatus=null,a.in?c?(u=ee,t.appearStatus=te):u=ae:a.unmountOnExit||a.mountOnEnter?u=fe:u=ee,t.state={status:u},t.nextCallback=null,t}s.getDerivedStateFromProps=function(i,t){var r=i.in;return r&&t.status===fe?{status:ee}:null};var n=s.prototype;return n.componentDidMount=function(){this.updateStatus(!0,this.appearStatus)},n.componentDidUpdate=function(i){var t=null;if(i!==this.props){var r=this.state.status;this.props.in?r!==te&&r!==ae&&(t=te):(r===te||r===ae)&&(t=Ie)}this.updateStatus(!1,t)},n.componentWillUnmount=function(){this.cancelNextCallback()},n.getTimeouts=function(){var i=this.props.timeout,t,r,c;return t=r=c=i,i!=null&&typeof i!="number"&&(t=i.exit,r=i.enter,c=i.appear!==void 0?i.appear:r),{exit:t,enter:r,appear:c}},n.updateStatus=function(i,t){if(i===void 0&&(i=!1),t!==null)if(this.cancelNextCallback(),t===te){if(this.props.unmountOnExit||this.props.mountOnEnter){var r=this.props.nodeRef?this.props.nodeRef.current:Se.findDOMNode(this);r&&Cn(r)}this.performEnter(i)}else this.performExit();else this.props.unmountOnExit&&this.state.status===ee&&this.setState({status:fe})},n.performEnter=function(i){var t=this,r=this.props.enter,c=this.context?this.context.isMounting:i,u=this.props.nodeRef?[c]:[Se.findDOMNode(this),c],p=u[0],g=u[1],w=this.getTimeouts(),m=c?w.appear:w.enter;if(!i&&!r||Je.disabled){this.safeSetState({status:ae},function(){t.props.onEntered(p)});return}this.props.onEnter(p,g),this.safeSetState({status:te},function(){t.props.onEntering(p,g),t.onTransitionEnd(m,function(){t.safeSetState({status:ae},function(){t.props.onEntered(p,g)})})})},n.performExit=function(){var i=this,t=this.props.exit,r=this.getTimeouts(),c=this.props.nodeRef?void 0:Se.findDOMNode(this);if(!t||Je.disabled){this.safeSetState({status:ee},function(){i.props.onExited(c)});return}this.props.onExit(c),this.safeSetState({status:Ie},function(){i.props.onExiting(c),i.onTransitionEnd(r.exit,function(){i.safeSetState({status:ee},function(){i.props.onExited(c)})})})},n.cancelNextCallback=function(){this.nextCallback!==null&&(this.nextCallback.cancel(),this.nextCallback=null)},n.safeSetState=function(i,t){t=this.setNextCallback(t),this.setState(i,t)},n.setNextCallback=function(i){var t=this,r=!0;return this.nextCallback=function(c){r&&(r=!1,t.nextCallback=null,i(c))},this.nextCallback.cancel=function(){r=!1},this.nextCallback},n.onTransitionEnd=function(i,t){this.setNextCallback(t);var r=this.props.nodeRef?this.props.nodeRef.current:Se.findDOMNode(this),c=i==null&&!this.props.addEndListener;if(!r||c){setTimeout(this.nextCallback,0);return}if(this.props.addEndListener){var u=this.props.nodeRef?[this.nextCallback]:[r,this.nextCallback],p=u[0],g=u[1];this.props.addEndListener(p,g)}i!=null&&setTimeout(this.nextCallback,i)},n.render=function(){var i=this.state.status;if(i===fe)return null;var t=this.props,r=t.children;t.in,t.mountOnEnter,t.unmountOnExit,t.appear,t.enter,t.exit,t.timeout,t.addEndListener,t.onEnter,t.onEntering,t.onEntered,t.onExit,t.onExiting,t.onExited,t.nodeRef;var c=mt(t,["children","in","mountOnEnter","unmountOnExit","appear","enter","exit","timeout","addEndListener","onEnter","onEntering","onEntered","onExit","onExiting","onExited","nodeRef"]);return V.createElement(ke.Provider,{value:null},typeof r=="function"?r(i,c):V.cloneElement(V.Children.only(r),c))},s})(V.Component);G.contextType=ke;G.propTypes={};function re(){}G.defaultProps={in:!1,mountOnEnter:!1,unmountOnExit:!1,appear:!1,enter:!0,exit:!0,onEnter:re,onEntering:re,onEntered:re,onExit:re,onExiting:re,onExited:re};G.UNMOUNTED=fe;G.EXITED=ee;G.ENTERING=te;G.ENTERED=ae;G.EXITING=Ie;function Rn(e){if(e===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}function Ye(e,s){var n=function(t){return s&&f.isValidElement(t)?s(t):t},a=Object.create(null);return e&&f.Children.map(e,function(i){return i}).forEach(function(i){a[i.key]=n(i)}),a}function Mn(e,s){e=e||{},s=s||{};function n(g){return g in s?s[g]:e[g]}var a=Object.create(null),i=[];for(var t in e)t in s?i.length&&(a[t]=i,i=[]):i.push(t);var r,c={};for(var u in s){if(a[u])for(r=0;r<a[u].length;r++){var p=a[u][r];c[a[u][r]]=n(p)}c[u]=n(u)}for(r=0;r<i.length;r++)c[i[r]]=n(i[r]);return c}function ne(e,s,n){return n[s]!=null?n[s]:e.props[s]}function Dn(e,s){return Ye(e.children,function(n){return f.cloneElement(n,{onExited:s.bind(null,n),in:!0,appear:ne(n,"appear",e),enter:ne(n,"enter",e),exit:ne(n,"exit",e)})})}function Pn(e,s,n){var a=Ye(e.children),i=Mn(s,a);return Object.keys(i).forEach(function(t){var r=i[t];if(f.isValidElement(r)){var c=t in s,u=t in a,p=s[t],g=f.isValidElement(p)&&!p.props.in;u&&(!c||g)?i[t]=f.cloneElement(r,{onExited:n.bind(null,r),in:!0,exit:ne(r,"exit",e),enter:ne(r,"enter",e)}):!u&&c&&!g?i[t]=f.cloneElement(r,{in:!1}):u&&c&&f.isValidElement(p)&&(i[t]=f.cloneElement(r,{onExited:n.bind(null,r),in:p.props.in,exit:ne(r,"exit",e),enter:ne(r,"enter",e)}))}}),i}var Tn=Object.values||function(e){return Object.keys(e).map(function(s){return e[s]})},On={component:"div",childFactory:function(s){return s}},J=(function(e){gt(s,e);function s(a,i){var t;t=e.call(this,a,i)||this;var r=t.handleExited.bind(Rn(t));return t.state={contextValue:{isMounting:!0},handleExited:r,firstRender:!0},t}var n=s.prototype;return n.componentDidMount=function(){this.mounted=!0,this.setState({contextValue:{isMounting:!1}})},n.componentWillUnmount=function(){this.mounted=!1},s.getDerivedStateFromProps=function(i,t){var r=t.children,c=t.handleExited,u=t.firstRender;return{children:u?Dn(i,c):Pn(i,r,c),firstRender:!1}},n.handleExited=function(i,t){var r=Ye(this.props.children);i.key in r||(i.props.onExited&&i.props.onExited(t),this.mounted&&this.setState(function(c){var u=Ne({},c.children);return delete u[i.key],{children:u}}))},n.render=function(){var i=this.props,t=i.component,r=i.childFactory,c=mt(i,["component","childFactory"]),u=this.state.contextValue,p=Tn(this.state.children).map(r);return delete c.appear,delete c.enter,delete c.exit,t===null?V.createElement(ke.Provider,{value:u},p):V.createElement(ke.Provider,{value:u},V.createElement(t,c,p))},s})(V.Component);J.propTypes={};J.defaultProps=On;const Nn=G,zn={position:"bottom-right",autoClose:4e3,transitionDuration:250,allowDragDismiss:!0,allowScrollDismiss:!0,containerWidth:440,notificationMaxHeight:200,limit:5,zIndex:Yt("overlay"),store:Zt,withinPortal:!0,pauseResetOnHover:"all"},bt=rt((e,{zIndex:s,containerWidth:n})=>({root:{"--notifications-z-index":s==null?void 0:s.toString(),"--notifications-container-width":Vt(n)}})),W=Le(e=>{const s=Fe("Notifications",zn,e),{classNames:n,className:a,style:i,styles:t,unstyled:r,vars:c,attributes:u,position:p,autoClose:g,transitionDuration:w,allowDragDismiss:m,allowScrollDismiss:k,containerWidth:x,notificationMaxHeight:C,limit:_,zIndex:h,store:l,portalProps:d,withinPortal:S,pauseResetOnHover:j,...E}=s,b=Xe(),R=en(l),M=fn(),N=ot(),D=f.useRef({}),F=f.useRef(0),[X,I]=f.useState(0),ge=f.useCallback(()=>I(P=>P+1),[]),be=f.useCallback(()=>I(P=>Math.max(0,P-1)),[]),q=b.respectReducedMotion&&N?1:w,z=it({name:"Notifications",classes:ht,props:s,className:a,style:i,classNames:n,styles:t,unstyled:r,attributes:u,vars:c,varsResolver:bt});f.useEffect(()=>{l==null||l.updateState(P=>({...P,limit:_||5,defaultPosition:p}))},[_,p]),$e(()=>{R.notifications.length>F.current&&setTimeout(()=>M(),0),F.current=R.notifications.length},[R.notifications]);const xe=Sn(R.notifications,p),Y=ft.reduce((P,K)=>(P[K]=xe[K].map(({style:Q,...T})=>o.jsx(Nn,{timeout:q,onEnter:()=>D.current[T.id].offsetHeight,nodeRef:{current:D.current[T.id]},children:de=>o.jsx(pt,{ref:A=>{A&&(D.current[T.id]=A)},data:T,onHide:A=>tn(A,l),autoClose:g,transitionDuration:q,allowDragDismiss:m,allowScrollDismiss:k,paused:j==="all"?X>0:!1,onHoverStart:ge,onHoverEnd:be,...z("notification",{style:{...En({state:de,position:K,transitionDuration:q,maxHeight:C}),...Q}})})},T.id)),P),{});return o.jsxs(Xt,{withinPortal:S,...d,children:[o.jsx(v,{...z("root"),"data-position":"top-center",...E,children:o.jsx(J,{children:Y["top-center"]})}),o.jsx(v,{...z("root"),"data-position":"top-left",...E,children:o.jsx(J,{children:Y["top-left"]})}),o.jsx(v,{...z("root",{className:We.classNames.fullWidth}),"data-position":"top-right",...E,children:o.jsx(J,{children:Y["top-right"]})}),o.jsx(v,{...z("root",{className:We.classNames.fullWidth}),"data-position":"bottom-right",...E,children:o.jsx(J,{children:Y["bottom-right"]})}),o.jsx(v,{...z("root"),"data-position":"bottom-left",...E,children:o.jsx(J,{children:Y["bottom-left"]})}),o.jsx(v,{...z("root"),"data-position":"bottom-center",...E,children:o.jsx(J,{children:Y["bottom-center"]})})]})});W.classes=ht;W.varsResolver=bt;W.displayName="@mantine/notifications/Notifications";W.show=ce.show;W.hide=ce.hide;W.update=ce.update;W.clean=ce.clean;W.cleanQueue=ce.cleanQueue;W.updateState=ce.updateState;/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const In=[["path",{d:"M5 12l14 0",key:"svg-0"}],["path",{d:"M5 12l6 6",key:"svg-1"}],["path",{d:"M5 12l6 -6",key:"svg-2"}]],An=H("outline","arrow-left","ArrowLeft",In);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const $n=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-2.5 2.5",key:"svg-1"}],["path",{d:"M14 4l-1.201 4.805m-.802 3.207l-2 7.988",key:"svg-2"}],["path",{d:"M3 3l18 18",key:"svg-3"}]],Ln=H("outline","code-off","CodeOff",$n);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fn=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-4 4",key:"svg-1"}],["path",{d:"M14 4l-4 16",key:"svg-2"}]],Xn=H("outline","code","Code",Fn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Yn=[["path",{d:"M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10",key:"svg-0"}],["path",{d:"M7 20h10",key:"svg-1"}],["path",{d:"M9 16v4",key:"svg-2"}],["path",{d:"M15 16v4",key:"svg-3"}]],Vn=H("outline","device-desktop","DeviceDesktop",Yn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Un=[["path",{d:"M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14",key:"svg-0"}],["path",{d:"M11 4h2",key:"svg-1"}],["path",{d:"M12 17v.01",key:"svg-2"}]],Hn=H("outline","device-mobile","DeviceMobile",Un);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Wn=[["path",{d:"M14 3v4a1 1 0 0 0 1 1h4",key:"svg-0"}],["path",{d:"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",key:"svg-1"}]],Bn=H("outline","file","File",Wn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Gn=[["path",{d:"M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2",key:"svg-0"}]],qn=H("outline","folder-open","FolderOpen",Gn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Jn=[["path",{d:"M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2",key:"svg-0"}]],Kn=H("outline","folder","Folder",Jn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Qn=[["path",{d:"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008",key:"svg-0"}]],Zn=H("outline","moon","Moon",Qn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const eo=[["path",{d:"M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",key:"svg-0"}],["path",{d:"M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7",key:"svg-1"}]],to=H("outline","sun","Sun",eo);function xt({nodes:e,selected:s,onSelect:n}){return o.jsx(v,{component:"nav","aria-label":"Design files",children:e.map(a=>o.jsx(vt,{node:a,selected:s,onSelect:n,depth:0},a.modulePath??a.name))})}function vt({node:e,selected:s,onSelect:n,depth:a}){var u;const i=!!((u=e.children)!=null&&u.length),[t,r]=f.useState(!0);if(i)return o.jsxs(v,{children:[o.jsx(Be,{onClick:()=>r(p=>!p),w:"100%",py:4,pl:a*12+4,pr:8,style:{borderRadius:"var(--mantine-radius-sm)"},children:o.jsxs(v,{component:"span",style:{display:"flex",alignItems:"center",gap:4,minWidth:0},children:[o.jsx(an,{size:14,style:{flexShrink:0,transition:"transform 150ms ease",transform:t?"rotate(90deg)":void 0}}),t?o.jsx(qn,{size:16,style:{flexShrink:0}}):o.jsx(Kn,{size:16,style:{flexShrink:0}}),o.jsx(L,{size:"sm",fw:500,truncate:!0,children:e.name})]})}),o.jsx(ct,{expanded:t,children:e.children.map(p=>o.jsx(vt,{node:p,selected:s,onSelect:n,depth:a+1},p.modulePath??p.name))})]});const c=e.modulePath===s;return o.jsx(Be,{onClick:()=>e.modulePath&&n(e.modulePath),w:"100%",py:4,pl:a*12+24,pr:8,style:{borderRadius:"var(--mantine-radius-sm)",background:c?"var(--mantine-color-blue-light)":void 0},children:o.jsxs(v,{component:"span",style:{display:"flex",alignItems:"center",gap:6,minWidth:0},children:[o.jsx(Bn,{size:15,style:{flexShrink:0,opacity:.7}}),o.jsx(L,{size:"sm",truncate:!0,c:c?"blue":void 0,fw:c?500:void 0,children:e.name})]})})}function no(e){const s="/ckk-tool-v3/design-preview/",n=new URL(`${s}frame.html`,window.location.origin);return n.searchParams.set("design",e.design),n.searchParams.set("viewport",e.viewport),n.searchParams.set("scheme",e.scheme),n.searchParams.set("mode",e.mode),e.remountKey!=null&&n.searchParams.set("t",String(e.remountKey)),`${n.pathname}${n.search}`}function oo({url:e,design:s,viewport:n="desktop",scheme:a,mode:i,remountKey:t=0,onViewportChange:r}){const c=n==="mobile",u=no({design:s,viewport:n,scheme:a,mode:i,remountKey:t});return o.jsxs(v,{style:{border:"1px solid var(--mantine-color-default-border)",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",background:"var(--mantine-color-body)",display:"flex",flexDirection:"column",width:"100%",maxWidth:c?390:1280,margin:"0 auto"},children:[o.jsxs(v,{style:{background:"var(--mantine-color-default-hover)",borderBottom:"1px solid var(--mantine-color-default-border)",padding:"10px 14px 10px",flexShrink:0},children:[o.jsxs(U,{gap:8,mb:10,justify:"space-between",children:[o.jsxs(U,{gap:8,children:[o.jsx(v,{style:{width:12,height:12,borderRadius:"50%",background:"#ff5f57",border:"1px solid rgba(0,0,0,0.12)"}}),o.jsx(v,{style:{width:12,height:12,borderRadius:"50%",background:"#febc2e",border:"1px solid rgba(0,0,0,0.12)"}}),o.jsx(v,{style:{width:12,height:12,borderRadius:"50%",background:"#28c840",border:"1px solid rgba(0,0,0,0.12)"}})]}),o.jsx(me,{label:c?"Switch to desktop":"Switch to mobile",withArrow:!0,children:o.jsx(B,{variant:"subtle",color:"gray",size:"sm","aria-label":c?"Switch to desktop":"Switch to mobile",onClick:()=>r==null?void 0:r(c?"desktop":"mobile"),children:c?o.jsx(Vn,{size:14}):o.jsx(Hn,{size:14})})})]}),o.jsxs(U,{gap:6,align:"center",children:[o.jsx(B,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Back",children:o.jsx(An,{size:14})}),o.jsx(B,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Forward",children:o.jsx(ln,{size:14})}),o.jsx(B,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Reload",children:o.jsx(Ee,{size:14})}),o.jsxs(v,{style:{flex:1,background:"var(--mantine-color-default)",borderRadius:6,padding:"4px 10px",border:"1px solid var(--mantine-color-default-border)",display:"flex",alignItems:"center",gap:6},children:[o.jsx(cn,{size:11,color:"var(--mantine-color-green-6)",style:{flexShrink:0}}),o.jsx(L,{size:"xs",c:"dimmed",ff:"mono",truncate:!0,children:e})]})]})]}),o.jsx("iframe",{title:"Design preview",src:u,style:{width:"100%",height:c?700:600,border:0,display:"block",background:"var(--mantine-color-body)"}},u)]})}function pe(e,s){const[n,a]=f.useState(()=>new URLSearchParams(window.location.search).get(e)??s),i=f.useCallback(t=>{const r=new URLSearchParams(window.location.search);t?r.set(e,t):r.delete(e),window.history.replaceState(null,"",`?${r.toString()}`),a(t)},[e]);return[n,i]}function De(e,s){return s.trim().split(".").reduce((n,a)=>{if(n!=null&&typeof n=="object")return n[a]},e)}function Ke(e,s,n){const a=`{{#${n} `,i=`{{/${n}}}`;let t=1,r=s;for(;r<e.length;){const c=e.indexOf(a,r),u=e.indexOf(i,r);if(u===-1)throw new Error(`Unclosed {{#${n}}}`);if(c!==-1&&c<u)t++,r=c+a.length;else{if(t--,t===0)return{inner:e.slice(s,u),after:u+i.length};r=u+i.length}}throw new Error(`Unclosed {{#${n}}}`)}function io(e,s){return Ae(e,s)}function Ae(e,s){const n=[];let a=0;for(;a<e.length;){const i=e.indexOf("{{",a);if(i===-1){n.push(e.slice(a));break}i>a&&n.push(e.slice(a,i));const t=e.indexOf("}}",i+2);if(t===-1){n.push(e.slice(i));break}const r=e.slice(i+2,t).trim();if(r.startsWith("#each ")){const c=r.slice(6).trim(),{inner:u,after:p}=Ke(e,t+2,"each"),g=De(s,c);if(Array.isArray(g))for(const w of g){const m=w!=null&&typeof w=="object"?{...s,...w}:s;n.push(Ae(u,m))}a=p}else if(r.startsWith("#if ")){const c=r.slice(4).trim(),{inner:u,after:p}=Ke(e,t+2,"if");De(s,c)&&n.push(Ae(u,s)),a=p}else if(r.startsWith("/"))a=t+2;else{const c=De(s,r);n.push(c!=null?String(c):""),a=t+2}}return n.join("")}const so=`/* Shared base styles for every PDF template. Flat / minimal: monochrome,
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
`,oe="../pdf-templates/",yt=Object.assign({"../pdf-templates/delivery-note.html":()=>O(()=>import("./delivery-note-sS540Im8.js"),[]).then(e=>e.default),"../pdf-templates/invoice.html":()=>O(()=>import("./invoice-StFHx3KR.js"),[]).then(e=>e.default),"../pdf-templates/order-acceptance.html":()=>O(()=>import("./order-acceptance-BbS0QBIR.js"),[]).then(e=>e.default),"../pdf-templates/quote.html":()=>O(()=>import("./quote-D04Kgwym.js"),[]).then(e=>e.default),"../pdf-templates/sales-order.html":()=>O(()=>import("./sales-order-Pfi3KWgJ.js"),[]).then(e=>e.default),"../pdf-templates/shipping-order.html":()=>O(()=>import("./shipping-order-CCos47B1.js"),[]).then(e=>e.default),"../pdf-templates/work-order.html":()=>O(()=>import("./work-order-fQdaFa_A.js"),[]).then(e=>e.default)}),wt=Object.assign({"../pdf-templates/data/delivery-note.json":()=>O(()=>import("./delivery-note-mJ0mI4A8.js"),[]).then(e=>e.default),"../pdf-templates/data/invoice.json":()=>O(()=>import("./invoice-Cg5_V8mw.js"),[]).then(e=>e.default),"../pdf-templates/data/order-acceptance.json":()=>O(()=>import("./order-acceptance-0HF1S_ea.js"),[]).then(e=>e.default),"../pdf-templates/data/quote.json":()=>O(()=>import("./quote-BaHbwZiH.js"),[]).then(e=>e.default),"../pdf-templates/data/sales-order.json":()=>O(()=>import("./sales-order-G83QBgvp.js"),[]).then(e=>e.default),"../pdf-templates/data/shipping-order.json":()=>O(()=>import("./shipping-order-DsBIT-FR.js"),[]).then(e=>e.default),"../pdf-templates/data/work-order.json":()=>O(()=>import("./work-order-C9KROCEx.js"),[]).then(e=>e.default)}),he=Object.keys(yt).sort((e,s)=>je(e,oe,"html").localeCompare(je(s,oe,"html"))),Qe=at(he,{prefix:oe,ext:"html"});function Ze(e){const s=e.replace(oe,"").replace(/\.html$/,""),n=`${oe}data/${s}.json`;return n in wt?n:null}const et=794,tt=1123,ro=`@font-face {
  font-family: 'Noto Sans JP';
  src: url('${window.location.origin}/ckk-tool-v3/design-preview/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}`;function ao(e){const s=`<style>
${ro}
</style>`,n=`<style>
${so}
</style>`,a="<style>body { padding: 10mm !important; }</style>",i=/<link[^>]*href=["']base\.css["'][^>]*\/?>/i,t=i.test(e)?e.replace(i,n):e.includes("<head>")?e.replace("<head>",`<head>
${n}`):n+e,r=`${s}
${a}`;return t.includes("</head>")?t.replace("</head>",`${r}
</head>`):r+t}function lo(){const[e,s]=pe("template",he[0]??""),n=he.includes(e)?e:he[0]??null,a=b=>s(b??""),[i,t]=f.useState(null),[r,c]=f.useState("{}"),[u,p]=f.useState("{}"),[g,w]=f.useState(!1),[m,k]=f.useState(!1),[x,C]=f.useState(!1),[_,h]=f.useState(0);f.useEffect(()=>{if(!n){t(null),p("{}"),c("{}");return}w(!0),t(null);const b=Ze(n);Promise.all([yt[n](),b?wt[b]():Promise.resolve(null)]).then(([R,M])=>{t(R);const N=M||"{}";c(N),p(N),w(!1)})},[n,_]);const{processedHtml:l,jsonError:d}=f.useMemo(()=>{if(!i)return{processedHtml:null,jsonError:null};try{const b=JSON.parse(u);return{processedHtml:io(i,b),jsonError:null}}catch(b){return{processedHtml:i,jsonError:String(b)}}},[i,u]);async function S(){var b;if(!(!n||m)){k(!0);try{const R=n.slice(oe.length),M=await fetch(`/api/pdf?template=${encodeURIComponent(R)}`,{method:"POST"});if(!M.ok)throw new Error(`PDF generation returned ${M.status}`);const N=await M.blob(),D=M.headers.get("content-disposition"),F=((b=D==null?void 0:D.match(/filename="?([^"]+)"?/))==null?void 0:b[1])??`${j??"template"}.pdf`,X=URL.createObjectURL(N),I=document.createElement("a");I.href=X,I.download=F,document.body.appendChild(I),I.click(),document.body.removeChild(I),URL.revokeObjectURL(X)}catch(R){console.error("PDF generation failed:",R)}finally{k(!1)}}}const j=n?je(n,oe,"html"):null,E=Ze(n??"")!==null;return o.jsxs(v,{style:{flex:1,display:"flex",minHeight:0},children:[o.jsx(v,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:o.jsx(lt,{h:"100%",p:"xs",children:Qe.length===0?o.jsx(L,{size:"sm",c:"dimmed",p:"xs",children:"No .html files in pdf-templates/ yet."}):o.jsx(xt,{nodes:Qe,selected:n,onSelect:a})})}),o.jsxs(v,{style:{flex:1,display:"flex",flexDirection:"column",minHeight:0},children:[n&&o.jsx(v,{px:"md",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)",flexShrink:0},children:o.jsxs(U,{justify:"space-between",children:[o.jsx(L,{size:"sm",c:"dimmed",ff:"monospace",children:j}),o.jsxs(U,{gap:"xs",children:[o.jsx(B,{variant:"default",title:"Reload template",onClick:()=>h(b=>b+1),children:o.jsx(Ee,{size:16})}),E&&o.jsx(me,{label:x?"Hide data editor":"Edit JSON data",children:o.jsx(B,{variant:x?"filled":"default",onClick:()=>C(b=>!b),children:x?o.jsx(Ln,{size:16}):o.jsx(Xn,{size:16})})}),o.jsx(Ut,{size:"xs",leftSection:o.jsx(dn,{size:14}),onClick:S,disabled:!l,loading:m,children:"Save PDF"})]})]})}),o.jsxs(v,{style:{flex:1,display:"flex",minHeight:0},children:[o.jsx(v,{style:{flex:1,overflow:"auto",background:"var(--mantine-color-gray-2)",padding:32},children:n?g?o.jsx(Pe,{style:{minHeight:"100%"},children:o.jsxs(Te,{align:"center",gap:"xs",children:[o.jsx(st,{size:"sm"}),o.jsx(L,{size:"sm",c:"dimmed",children:"Loading…"})]})}):l?o.jsx(v,{style:{width:et,minHeight:tt,background:"white",boxShadow:"0 4px 32px rgba(0,0,0,0.18)",margin:"0 auto",overflow:"hidden"},children:o.jsx("iframe",{srcDoc:ao(l),title:j??"PDF Template",style:{width:et,height:tt,border:"none",display:"block"}},`${n}-${_}-${u}`)}):null:o.jsx(Pe,{style:{minHeight:"100%"},children:o.jsx(L,{c:"dimmed",children:he.length===0?"Drop an .html file into design-preview/pdf-templates/ to get started.":"Select a template from the tree on the left."})})}),x&&o.jsxs(v,{w:380,style:{flexShrink:0,borderLeft:"1px solid var(--mantine-color-default-border)",display:"flex",flexDirection:"column",background:"var(--mantine-color-body)"},children:[o.jsx(v,{px:"sm",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",flexShrink:0},children:o.jsxs(U,{justify:"space-between",children:[o.jsxs(U,{gap:"xs",children:[o.jsx(L,{size:"xs",fw:600,children:"JSON Data"}),d&&o.jsx(me,{label:d,multiline:!0,w:260,withArrow:!0,children:o.jsx(Ht,{color:"red",size:"xs",style:{cursor:"help"},children:"Parse error"})})]}),o.jsx(me,{label:"Reset to default",children:o.jsx(B,{size:"xs",variant:"subtle",onClick:()=>p(r),disabled:u===r,children:o.jsx(Ee,{size:12})})})]})}),o.jsx("textarea",{value:u,onChange:b=>p(b.target.value),spellCheck:!1,style:{flex:1,resize:"none",border:"none",outline:"none",padding:"10px 12px",fontFamily:'ui-monospace, "Cascadia Code", "Fira Code", monospace',fontSize:"11px",lineHeight:1.6,background:"var(--mantine-color-body)",color:"var(--mantine-color-text)"}})]})]})]})]})}function co(e){return`https://ckk.local/${e.replace("../designs/","").replace(/\.tsx$/,"").split("/").map(a=>a.replace(/([A-Z])/g,(i,t,r)=>r===0?t.toLowerCase():`-${t.toLowerCase()}`)).join("/")}`}function uo(){const[e,s]=pe("mode","ui"),n=e==="pdf"?"pdf":"ui",[a,i]=pe("design",ue[0]??""),t=ue.includes(a)?a:ue[0]??null,r=j=>i(j??""),[c,u]=pe("viewport","desktop"),p=c==="mobile"?"mobile":"desktop",[g,w]=pe("hidden","0"),m=g==="1",k=f.useMemo(()=>at(ue,{includeUnderscore:m}),[m]),[x,C]=f.useState(0),{toggleColorScheme:_}=nn(),l=on("light",{getInitialValueInEffect:!1})==="dark"?"dark":"light",d=l==="dark",S=t&&Wt(t)?"component":"page";return o.jsxs(Te,{gap:0,h:"100vh",children:[o.jsx(v,{p:"sm",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:o.jsxs(U,{justify:"space-between",children:[o.jsxs(U,{gap:"sm",children:[o.jsx(Bt,{order:5,style:{flexShrink:0},children:"Design Preview"}),n==="ui"&&t&&o.jsx(L,{size:"sm",c:"dimmed",ff:"monospace",children:je(t)})]}),o.jsxs(U,{gap:"xs",children:[n==="ui"&&o.jsx(me,{label:"`_` で始まる隠しファイル（_modals 等）を表示",withinPortal:!0,children:o.jsx(rn,{size:"xs",label:"_ files",checked:m,onChange:j=>w(j.currentTarget.checked?"1":"0")})}),n==="ui"&&o.jsx(B,{variant:"default",title:"Re-render",onClick:()=>C(j=>j+1),children:o.jsx(Ee,{size:16})}),o.jsx(B,{variant:"default",title:d?"ライトモード":"ダークモード",onClick:()=>_(),"aria-label":"カラーモード切替",children:d?o.jsx(to,{size:16}):o.jsx(Zn,{size:16})}),o.jsx(sn,{size:"xs",value:n,onChange:j=>s(j),data:[{label:"UI Designs",value:"ui"},{label:"PDF Templates",value:"pdf"}]})]})]})}),n==="pdf"?o.jsx(lo,{}):o.jsxs(v,{style:{flex:1,display:"flex",minHeight:0},children:[o.jsx(v,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:o.jsx(lt,{h:"100%",p:"xs",children:k.length===0?o.jsx(L,{size:"sm",c:"dimmed",p:"xs",children:"No .tsx files in designs/ yet."}):o.jsx(xt,{nodes:k,selected:t,onSelect:r})})}),o.jsx(v,{style:{flex:1,overflow:"auto",background:d?"var(--mantine-color-dark-8)":"var(--mantine-color-gray-2)",padding:24},children:t?o.jsx(oo,{url:co(t),design:t,viewport:p,scheme:l,mode:S,remountKey:x,onViewportChange:u}):o.jsx(Pe,{style:{minHeight:"100%"},children:o.jsx(Te,{align:"center",gap:"xs",children:o.jsx(L,{c:"dimmed",children:ue.length===0?"Drop a .tsx file into design-preview/designs/ to get started.":"Select a design file from the tree on the left."})})})})]})]})}const St=document.createElement("style");St.textContent="@font-face { font-family: 'Noto Sans JP'; src: url('/ckk-tool-v3/design-preview/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }";document.head.appendChild(St);Gt.createRoot(document.getElementById("root")).render(o.jsx(V.StrictMode,{children:o.jsx(qt,{theme:Kt,colorSchemeManager:Jt,children:o.jsxs(Qt,{settings:{locale:"ja"},children:[o.jsx(W,{}),o.jsx(uo,{})]})})}));
