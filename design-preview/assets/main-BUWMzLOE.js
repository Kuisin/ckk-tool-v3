import{ax as f,aG as $e,aw as le,ao as ot,Y as Le,aW as Fe,aR as It,aT as Xe,aY as it,am as i,a as v,a$ as st,L as rt,d as $t,K as at,af as Lt,aa as Ft,aV as Xt,R as U,o as ye,O as Yt,q as We,a4 as Vt,ay as Ut,U as Be,t as L,G as H,a0 as je,E as lt,_ as O,S as ct,b as Ht,C as Te,s as Pe,B as Wt,V as ue,ai as Bt,v as Gt,p as qt,k as Jt,aA as Kt,at as Qt,f as Zt}from"./design-modules-B4pm98ET.js";import{a as en,u as tn,h as nn,n as ce}from"./notifications.store-Ditc494x.js";import{g as Oe,T as we}from"./Tooltip-D9XMnPbh.js";import{a as on,u as sn}from"./use-computed-color-scheme-CP_WLi6D.js";import{A as B}from"./ActionIcon-B_K3Jcu3.js";import{S as rn}from"./SegmentedControl-DxrE_ebY.js";import{I as an}from"./IconChevronRight-CDl7RRHW.js";import{c as F}from"./createReactComponent-CRBp4vQY.js";import{I as ln}from"./IconArrowRight-DDwEj0Qj.js";import{I as cn}from"./IconLock-CJX4GgxB.js";import{I as dn}from"./IconDownload-kgkB_E7D.js";import"./get-env-B-6RN2XZ.js";const un=e=>(e+1)%1e6;function fn(){const[,e]=f.useReducer(un,0);return e}function pn(e){if(!e||typeof e=="string")return 0;const s=e/36;return Math.round((4+15*s**.25+s/5)*10)}function Re(e){return e.current?e.current.scrollHeight:"auto"}function hn({transitionDuration:e,transitionTimingFunction:s="ease",onTransitionEnd:n,onTransitionStart:a,expanded:o,keepMounted:t}){const r={height:0,overflow:"hidden",...t?{}:{display:"none"}},c=f.useEffectEvent(()=>a==null?void 0:a()),d=f.useRef(null),[p,m]=f.useState(o?{}:r),[w,g]=f.useState(o?"entered":"exited"),k=h=>{le.flushSync(()=>m(h))},x=h=>{k(l=>({...l,...h}))},_=h=>{const l=e??pn(h);return{transition:`height ${l}ms ${s}, opacity ${l}ms ${s}`}};$e(()=>{e!==0&&c(),o?window.requestAnimationFrame(()=>{le.flushSync(()=>g("entering")),x({willChange:"height",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const h=Re(d);x({..._(h),height:h})})}):window.requestAnimationFrame(()=>{le.flushSync(()=>g("exiting"));const h=Re(d);x({..._(h),willChange:"height",height:h}),window.requestAnimationFrame(()=>x({height:0,overflow:"hidden"}))})},[o]);const E=h=>{if(!(h.target!==d.current||h.propertyName!=="height"))if(o){const l=Re(d);l===p.height?k({}):x({height:l}),g("entered"),n==null||n()}else p.height===0&&(k(r),g("exited"),n==null||n())};return{state:w,getCollapseProps:h=>({"aria-hidden":!o,inert:!o,ref:ot(d,h==null?void 0:h.ref),onTransitionEnd:E,style:{boxSizing:"border-box",...h==null?void 0:h.style,...p}})}}function mn(e){if(!e||typeof e=="string")return 0;const s=e/36;return Math.round((4+15*s**.25+s/5)*10)}function Me(e){return e.current?e.current.scrollWidth:"auto"}function gn({transitionDuration:e,transitionTimingFunction:s="ease",onTransitionEnd:n,onTransitionStart:a,expanded:o,keepMounted:t}){const r={width:0,overflow:"hidden",...t?{}:{display:"none"}},c=f.useEffectEvent(()=>a==null?void 0:a()),d=f.useRef(null),[p,m]=f.useState(o?{}:r),[w,g]=f.useState(o?"entered":"exited"),k=h=>{le.flushSync(()=>m(h))},x=h=>{k(l=>({...l,...h}))},_=h=>{const l=e??mn(h);return{transition:`width ${l}ms ${s}, opacity ${l}ms ${s}`}};$e(()=>{e!==0&&c(),o?window.requestAnimationFrame(()=>{le.flushSync(()=>g("entering")),x({willChange:"width",display:"block",overflow:"hidden"}),window.requestAnimationFrame(()=>{const h=Me(d);x({..._(h),width:h})})}):window.requestAnimationFrame(()=>{le.flushSync(()=>g("exiting"));const h=Me(d);x({..._(h),willChange:"width",width:h}),window.requestAnimationFrame(()=>x({width:0,overflow:"hidden"}))})},[o]);const E=h=>{if(!(h.target!==d.current||h.propertyName!=="width"))if(o){const l=Me(d);l===p.width?k({}):x({width:l}),g("entered"),n==null||n()}else p.width===0&&(k(r),g("exited"),n==null||n())};return{state:w,getCollapseProps:h=>({"aria-hidden":!o,inert:!o,ref:ot(d,h==null?void 0:h.ref),onTransitionEnd:E,style:{boxSizing:"border-box",...h==null?void 0:h.style,...p}})}}const bn=100;function se(e){return e>0?1:e<0?-1:0}function Ge(e){const s=e??0;return typeof s=="number"?[s,s]:s}function xn(){return{isActive:!1,pointerId:-1,startXY:[0,0],prevXY:[0,0],startTimestamp:0,prevTimestamp:0,thresholdMet:!1,firstFired:!1,lockedAxis:null,canceled:!1,lastVelocity:[0,0]}}function vn(e,s={}){const[n,a]=f.useState(!1),o=f.useRef(e);o.current=e;const t=f.useRef(s);t.current=s;const r=f.useRef(xn()),c=f.useRef(null);return{ref:f.useCallback(d=>{if(!d)return;const p=new AbortController,m=l=>{const u=t.current,S=r.current;if(u.axis==="x")return[l[0],0];if(u.axis==="y")return[0,l[1]];if(u.axis==="lock"){if(S.lockedAxis===null){const C=u.axisThreshold??1;(Math.abs(l[0])>C||Math.abs(l[1])>C)&&(S.lockedAxis=Math.abs(l[0])>=Math.abs(l[1])?"x":"y")}if(S.lockedAxis==="x")return[l[0],0];if(S.lockedAxis==="y")return[0,l[1]]}return l},w=()=>{var u;const l=r.current;l.isActive=!1,l.pointerId=-1,l.thresholdMet=!1,l.firstFired=!1,l.lockedAxis=null,l.canceled=!1,a(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="",(u=c.current)==null||u.abort(),c.current=null},g=()=>{r.current.isActive&&(r.current.canceled=!0,w())},k=()=>{a(!0),document.body.style.userSelect="none",document.body.style.webkitUserSelect="none"},x=l=>{var b;if(t.current.enabled===!1||l.button!==0||r.current.isActive)return;const u=r.current;u.isActive=!0,u.pointerId=l.pointerId,u.startXY=[l.clientX,l.clientY],u.prevXY=[l.clientX,l.clientY],u.startTimestamp=l.timeStamp,u.prevTimestamp=l.timeStamp,u.thresholdMet=!1,u.firstFired=!1,u.lockedAxis=null,u.canceled=!1,u.lastVelocity=[0,0];const[S,C]=Ge(t.current.threshold);S===0&&C===0&&(u.thresholdMet=!0,u.firstFired=!0,k(),o.current({xy:[l.clientX,l.clientY],initial:[l.clientX,l.clientY],movement:[0,0],delta:[0,0],distance:[0,0],direction:[0,0],velocity:[0,0],elapsedTime:0,first:!0,last:!1,active:!0,tap:!1,canceled:!1,cancel:g,event:l})),(b=c.current)==null||b.abort(),c.current=new AbortController;const j=c.current.signal;document.addEventListener("pointermove",_,{signal:j}),document.addEventListener("pointerup",E,{signal:j}),document.addEventListener("pointercancel",h,{signal:j})},_=l=>{const u=r.current;if(!u.isActive||l.pointerId!==u.pointerId)return;const S=[l.clientX-u.startXY[0],l.clientY-u.startXY[1]];if(!u.thresholdMet){const[N,D]=Ge(t.current.threshold);if(Math.abs(S[0])<N&&Math.abs(S[1])<D){u.prevXY=[l.clientX,l.clientY],u.prevTimestamp=l.timeStamp;return}u.thresholdMet=!0,k()}const C=m(S),j=m([l.clientX-u.prevXY[0],l.clientY-u.prevXY[1]]),b=l.timeStamp-u.prevTimestamp,R=b>0?[Math.abs(j[0])/b,Math.abs(j[1])/b]:u.lastVelocity;u.lastVelocity=R;const M=!u.firstFired;u.firstFired=!0,u.prevXY=[l.clientX,l.clientY],u.prevTimestamp=l.timeStamp,o.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:C,delta:j,distance:[Math.abs(C[0]),Math.abs(C[1])],direction:[se(j[0]),se(j[1])],velocity:R,elapsedTime:l.timeStamp-u.startTimestamp,first:M,last:!1,active:!0,tap:!1,canceled:!1,cancel:g,event:l})},E=l=>{const u=r.current;if(!u.isActive||l.pointerId!==u.pointerId)return;const S=t.current;if(!u.thresholdMet){if(S.filterTaps){const D=m([l.clientX-u.startXY[0],l.clientY-u.startXY[1]]),X=[Math.abs(D[0]),Math.abs(D[1])],Y=Math.max(X[0],X[1])<(S.tapThreshold??3);o.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:D,delta:D,distance:X,direction:[se(D[0]),se(D[1])],velocity:[0,0],elapsedTime:l.timeStamp-u.startTimestamp,first:!0,last:!0,active:!1,tap:Y,canceled:!1,cancel:g,event:l})}w();return}const C=m([l.clientX-u.startXY[0],l.clientY-u.startXY[1]]),j=[Math.abs(C[0]),Math.abs(C[1])],b=m([l.clientX-u.prevXY[0],l.clientY-u.prevXY[1]]),R=l.timeStamp-u.prevTimestamp>bn?[0,0]:u.lastVelocity,M=Math.max(j[0],j[1]),N=S.filterTaps===!0&&M<(S.tapThreshold??3);o.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:C,delta:b,distance:j,direction:[se(b[0]),se(b[1])],velocity:R,elapsedTime:l.timeStamp-u.startTimestamp,first:!u.firstFired,last:!0,active:!1,tap:N,canceled:!1,cancel:g,event:l}),w()},h=l=>{const u=r.current;if(!u.isActive||l.pointerId!==u.pointerId)return;const S=m([l.clientX-u.startXY[0],l.clientY-u.startXY[1]]);o.current({xy:[l.clientX,l.clientY],initial:[...u.startXY],movement:S,delta:[0,0],distance:[Math.abs(S[0]),Math.abs(S[1])],direction:[0,0],velocity:[0,0],elapsedTime:l.timeStamp-u.startTimestamp,first:!u.firstFired,last:!0,active:!1,tap:!1,canceled:!0,cancel:g,event:l}),w()};return d.addEventListener("pointerdown",x,{signal:p.signal}),()=>{var l;p.abort(),(l=c.current)==null||l.abort(),c.current=null,r.current.isActive&&(r.current.isActive=!1,a(!1),document.body.style.userSelect="",document.body.style.webkitUserSelect="")}},[]),active:n}}const yn={transitionDuration:200,transitionTimingFunction:"ease",animateOpacity:!0,orientation:"vertical"},dt=Le(e=>{const{children:s,expanded:n,transitionDuration:a,transitionTimingFunction:o,style:t,onTransitionEnd:r,onTransitionStart:c,animateOpacity:d,keepMounted:p,ref:m,orientation:w,...g}=Fe("Collapse",yn,e),k=It(),x=Xe(),_=it(),E=x.respectReducedMotion&&_?0:a,h=(w==="horizontal"?gn:hn)({expanded:n,transitionDuration:E,transitionTimingFunction:o,onTransitionEnd:r,onTransitionStart:c,keepMounted:!1});if(E===0)return p===!0&&k!=="test"?i.jsx(f.Activity,{mode:n?"visible":"hidden",children:i.jsx(v,{...g,children:s})}):n?i.jsx(v,{...g,children:s}):null;const l=h.state==="exited";let u;return p===!1?u=l?null:s:p===!0?u=i.jsx(f.Activity,{mode:l?"hidden":"visible",children:s}):u=s,i.jsx(v,{...g,...h.getCollapseProps({style:{opacity:n||!d?1:0,transition:d?`opacity ${E}ms ${o}`:"none",...Oe(t,x)},ref:m}),children:u})});dt.displayName="@mantine/core/Collapse";var ut={root:"m_a513464",icon:"m_a4ceffb",loader:"m_b0920b15",body:"m_a49ed24",title:"m_3feedf16",description:"m_3d733a3a",closeButton:"m_919a4d88"};const wn={withCloseButton:!0},ft=at((e,{radius:s,color:n})=>({root:{"--notification-radius":s===void 0?void 0:Ft(s),"--notification-color":n?Lt(n,e):void 0}})),_e=Le(e=>{const s=Fe("Notification",wn,e),{className:n,color:a,radius:o,loading:t,withCloseButton:r,withBorder:c,title:d,icon:p,children:m,onClose:w,closeButtonProps:g,classNames:k,style:x,styles:_,unstyled:E,vars:h,mod:l,loaderProps:u,role:S,attributes:C,...j}=s,b=st({name:"Notification",classes:ut,props:s,className:n,style:x,classNames:k,styles:_,unstyled:E,attributes:C,vars:h,varsResolver:ft});return i.jsxs(v,{...b("root"),mod:[{"data-with-icon":!!p||t,"data-with-border":c},l],role:S||"alert",...j,children:[p&&!t&&i.jsx("div",{...b("icon"),children:p}),t&&i.jsx(rt,{size:28,color:a,...b("loader"),...u}),i.jsxs("div",{...b("body"),children:[d&&i.jsx("div",{...b("title"),children:d}),i.jsx(v,{...b("description"),mod:{"data-with-title":!!d},children:m})]}),r&&i.jsx($t,{iconSize:16,color:"gray",...g,unstyled:E,onClick:R=>{var M;(M=g==null?void 0:g.onClick)==null||M.call(g,R),w==null||w()},...b("closeButton")})]})});_e.classes=ut;_e.varsResolver=ft;_e.displayName="@mantine/core/Notification";const pt=["bottom-center","bottom-left","bottom-right","top-center","top-left","top-right"];function Sn(e,s){return e.reduce((n,a)=>(n[a.position||s].push(a),n),pt.reduce((n,a)=>(n[a]=[],n),{}))}const qe={left:"translateX(-100%)",right:"translateX(100%)","top-center":"translateY(-100%)","bottom-center":"translateY(100%)"},jn={left:"translateX(0)",right:"translateX(0)","top-center":"translateY(0)","bottom-center":"translateY(0)"};function En({state:e,maxHeight:s,position:n,transitionDuration:a}){const[o,t]=n.split("-"),r=t==="center"?`${o}-center`:t,c={opacity:0,maxHeight:s,transform:qe[r],transitionDuration:`${a}ms, ${a}ms, ${a}ms`,transitionTimingFunction:"cubic-bezier(.51,.3,0,1.21), cubic-bezier(.51,.3,0,1.21), linear",transitionProperty:"opacity, transform, max-height"},d={opacity:1,transform:jn[r]},p={opacity:0,maxHeight:0,transform:qe[r]};return{...c,...{entering:d,entered:d,exiting:p,exited:p}[e]}}function kn(e,s){return typeof s=="number"?s:s===!1||e===!1?!1:e}const _n=120;function ht({data:e,onHide:s,autoClose:n,transitionDuration:a,allowDragDismiss:o,allowScrollDismiss:t,paused:r,onHoverStart:c,onHoverEnd:d,ref:p,style:m,...w}){const[g,k]=f.useState(0),[x,_]=f.useState(!1),[E,h]=f.useState(1),[l,u]=f.useState(!1),S=Xe(),{autoClose:C,message:j,allowClose:b,position:R,style:M,withCloseButton:N,onOpen:D,...X}=e,Y=kn(n,e.autoClose),A=f.useRef(-1),he=f.useRef(-1),me=f.useRef(-1),q=f.useRef(null),z=f.useRef(!1),ge=f.useRef(0),V=b===!1,T=()=>window.clearTimeout(A.current),K=()=>window.clearTimeout(he.current),Q=()=>window.clearTimeout(me.current),P=y=>{ge.current=y,k(y)},de=()=>{s(e.id),T(),K(),Q()},I=()=>{x||be||r||z.current||typeof Y!="number"||(A.current=window.setTimeout(de,Y))},Ve=y=>{var $;return y*(((($=q.current)==null?void 0:$.offsetWidth)??440)+40)},Ue=(y,$)=>{var ve;const Z=((ve=q.current)==null?void 0:ve.offsetWidth)??440;return Math.abs(y)>Z*.35||$>.5},Et=()=>{Q(),u(!1),P(0)},He=y=>{h(y),_(!0),u(!1),P(Ve(y)),T(),K(),Q(),he.current=window.setTimeout(de,a)},kt=()=>{Q(),me.current=window.setTimeout(()=>{u(!1),P(0),I()},_n)},{ref:_t,active:be}=vn(y=>{if(!x)if(y.first&&T(),y.last){if(y.tap||y.canceled){P(0),I();return}const $=y.movement[0],Z=$===0?y.direction[0]===-1?-1:1:$>0?1:-1;Ue($,y.velocity[0])?He(Z):(P(0),I())}else P(y.movement[0])},{axis:"x",threshold:5,filterTaps:!0,enabled:o&&!V&&!x}),Ct=Xt(p,q,_t),Rt=Oe(m,S),Mt=Oe(M,S),ie={...Rt,...Mt},Dt=typeof ie.opacity=="number"?ie.opacity:1,Tt=x?0:1-Math.min(Math.abs(g)/200,1)*.6,Pt=ie.transitionDuration??`${a}ms, ${a}ms, ${a}ms`,Ot={...ie,"--notifications-state-transform":typeof ie.transform=="string"?ie.transform:"translateX(0)","--notifications-state-opacity":String(Dt),"--notifications-swipe-offset":`${g}px`,"--notifications-swipe-opacity":String(Tt),transform:"var(--notifications-state-transform) translate3d(var(--notifications-swipe-offset), 0, 0)",opacity:"calc(var(--notifications-state-opacity) * var(--notifications-swipe-opacity))",transitionDuration:be||l?"0ms, 0ms, 0ms":Pt,cursor:"default",touchAction:"pan-y"},Nt=()=>{z.current=!0,T(),c==null||c()},zt=()=>{z.current=!1,l||(Et(),I()),d==null||d()},xe=f.useEffectEvent(y=>{if(x||be)return;const $=y.currentTarget===document;if(!$&&!z.current)return;const{deltaX:Z,deltaY:ve}=y;if(Math.abs(Z)<=Math.abs(ve)||Z===0||!t||V)return;$||(y.preventDefault(),y.stopPropagation()),T(),u(!0);const Ce=ge.current-Z,At=Ce>0?1:-1;if(Ue(Ce,0)){He(At);return}P(Ce),kt()});return f.useEffect(()=>{if(l)return document.addEventListener("wheel",xe,{passive:!1}),()=>document.removeEventListener("wheel",xe,{passive:!1})},[l]),f.useEffect(()=>{const y=()=>{x&&P(Ve(E))};return window.addEventListener("resize",y),()=>window.removeEventListener("resize",y)},[E,x]),f.useEffect(()=>{const y=q.current;if(y)return y.addEventListener("wheel",xe,{passive:!1}),()=>y.removeEventListener("wheel",xe,{passive:!1})},[]),f.useEffect(()=>()=>{K(),Q()},[]),f.useEffect(()=>{var y;(y=e.onOpen)==null||y.call(e,e)},[]),f.useEffect(()=>(I(),T),[Y,be,x]),f.useEffect(()=>(r?T():I(),T),[r]),i.jsx(_e,{ref:Ct,...w,style:Ot,...X,withCloseButton:V?!1:N,onClose:de,onMouseEnter:Nt,onMouseLeave:zt,children:j})}ht.displayName="@mantine/notifications/NotificationContainer";var mt={root:"m_b37d9ac7",notification:"m_5ed0edd0"};function Ne(){return Ne=Object.assign?Object.assign.bind():function(e){for(var s=1;s<arguments.length;s++){var n=arguments[s];for(var a in n)({}).hasOwnProperty.call(n,a)&&(e[a]=n[a])}return e},Ne.apply(null,arguments)}function gt(e,s){if(e==null)return{};var n={};for(var a in e)if({}.hasOwnProperty.call(e,a)){if(s.indexOf(a)!==-1)continue;n[a]=e[a]}return n}function ze(e,s){return ze=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(n,a){return n.__proto__=a,n},ze(e,s)}function bt(e,s){e.prototype=Object.create(s.prototype),e.prototype.constructor=e,ze(e,s)}const Je={disabled:!1},Ee=U.createContext(null);var Cn=function(s){return s.scrollTop},fe="unmounted",ee="exited",te="entering",ae="entered",Ae="exiting",G=(function(e){bt(s,e);function s(a,o){var t;t=e.call(this,a,o)||this;var r=o,c=r&&!r.isMounting?a.enter:a.appear,d;return t.appearStatus=null,a.in?c?(d=ee,t.appearStatus=te):d=ae:a.unmountOnExit||a.mountOnEnter?d=fe:d=ee,t.state={status:d},t.nextCallback=null,t}s.getDerivedStateFromProps=function(o,t){var r=o.in;return r&&t.status===fe?{status:ee}:null};var n=s.prototype;return n.componentDidMount=function(){this.updateStatus(!0,this.appearStatus)},n.componentDidUpdate=function(o){var t=null;if(o!==this.props){var r=this.state.status;this.props.in?r!==te&&r!==ae&&(t=te):(r===te||r===ae)&&(t=Ae)}this.updateStatus(!1,t)},n.componentWillUnmount=function(){this.cancelNextCallback()},n.getTimeouts=function(){var o=this.props.timeout,t,r,c;return t=r=c=o,o!=null&&typeof o!="number"&&(t=o.exit,r=o.enter,c=o.appear!==void 0?o.appear:r),{exit:t,enter:r,appear:c}},n.updateStatus=function(o,t){if(o===void 0&&(o=!1),t!==null)if(this.cancelNextCallback(),t===te){if(this.props.unmountOnExit||this.props.mountOnEnter){var r=this.props.nodeRef?this.props.nodeRef.current:ye.findDOMNode(this);r&&Cn(r)}this.performEnter(o)}else this.performExit();else this.props.unmountOnExit&&this.state.status===ee&&this.setState({status:fe})},n.performEnter=function(o){var t=this,r=this.props.enter,c=this.context?this.context.isMounting:o,d=this.props.nodeRef?[c]:[ye.findDOMNode(this),c],p=d[0],m=d[1],w=this.getTimeouts(),g=c?w.appear:w.enter;if(!o&&!r||Je.disabled){this.safeSetState({status:ae},function(){t.props.onEntered(p)});return}this.props.onEnter(p,m),this.safeSetState({status:te},function(){t.props.onEntering(p,m),t.onTransitionEnd(g,function(){t.safeSetState({status:ae},function(){t.props.onEntered(p,m)})})})},n.performExit=function(){var o=this,t=this.props.exit,r=this.getTimeouts(),c=this.props.nodeRef?void 0:ye.findDOMNode(this);if(!t||Je.disabled){this.safeSetState({status:ee},function(){o.props.onExited(c)});return}this.props.onExit(c),this.safeSetState({status:Ae},function(){o.props.onExiting(c),o.onTransitionEnd(r.exit,function(){o.safeSetState({status:ee},function(){o.props.onExited(c)})})})},n.cancelNextCallback=function(){this.nextCallback!==null&&(this.nextCallback.cancel(),this.nextCallback=null)},n.safeSetState=function(o,t){t=this.setNextCallback(t),this.setState(o,t)},n.setNextCallback=function(o){var t=this,r=!0;return this.nextCallback=function(c){r&&(r=!1,t.nextCallback=null,o(c))},this.nextCallback.cancel=function(){r=!1},this.nextCallback},n.onTransitionEnd=function(o,t){this.setNextCallback(t);var r=this.props.nodeRef?this.props.nodeRef.current:ye.findDOMNode(this),c=o==null&&!this.props.addEndListener;if(!r||c){setTimeout(this.nextCallback,0);return}if(this.props.addEndListener){var d=this.props.nodeRef?[this.nextCallback]:[r,this.nextCallback],p=d[0],m=d[1];this.props.addEndListener(p,m)}o!=null&&setTimeout(this.nextCallback,o)},n.render=function(){var o=this.state.status;if(o===fe)return null;var t=this.props,r=t.children;t.in,t.mountOnEnter,t.unmountOnExit,t.appear,t.enter,t.exit,t.timeout,t.addEndListener,t.onEnter,t.onEntering,t.onEntered,t.onExit,t.onExiting,t.onExited,t.nodeRef;var c=gt(t,["children","in","mountOnEnter","unmountOnExit","appear","enter","exit","timeout","addEndListener","onEnter","onEntering","onEntered","onExit","onExiting","onExited","nodeRef"]);return U.createElement(Ee.Provider,{value:null},typeof r=="function"?r(o,c):U.cloneElement(U.Children.only(r),c))},s})(U.Component);G.contextType=Ee;G.propTypes={};function re(){}G.defaultProps={in:!1,mountOnEnter:!1,unmountOnExit:!1,appear:!1,enter:!0,exit:!0,onEnter:re,onEntering:re,onEntered:re,onExit:re,onExiting:re,onExited:re};G.UNMOUNTED=fe;G.EXITED=ee;G.ENTERING=te;G.ENTERED=ae;G.EXITING=Ae;function Rn(e){if(e===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}function Ye(e,s){var n=function(t){return s&&f.isValidElement(t)?s(t):t},a=Object.create(null);return e&&f.Children.map(e,function(o){return o}).forEach(function(o){a[o.key]=n(o)}),a}function Mn(e,s){e=e||{},s=s||{};function n(m){return m in s?s[m]:e[m]}var a=Object.create(null),o=[];for(var t in e)t in s?o.length&&(a[t]=o,o=[]):o.push(t);var r,c={};for(var d in s){if(a[d])for(r=0;r<a[d].length;r++){var p=a[d][r];c[a[d][r]]=n(p)}c[d]=n(d)}for(r=0;r<o.length;r++)c[o[r]]=n(o[r]);return c}function ne(e,s,n){return n[s]!=null?n[s]:e.props[s]}function Dn(e,s){return Ye(e.children,function(n){return f.cloneElement(n,{onExited:s.bind(null,n),in:!0,appear:ne(n,"appear",e),enter:ne(n,"enter",e),exit:ne(n,"exit",e)})})}function Tn(e,s,n){var a=Ye(e.children),o=Mn(s,a);return Object.keys(o).forEach(function(t){var r=o[t];if(f.isValidElement(r)){var c=t in s,d=t in a,p=s[t],m=f.isValidElement(p)&&!p.props.in;d&&(!c||m)?o[t]=f.cloneElement(r,{onExited:n.bind(null,r),in:!0,exit:ne(r,"exit",e),enter:ne(r,"enter",e)}):!d&&c&&!m?o[t]=f.cloneElement(r,{in:!1}):d&&c&&f.isValidElement(p)&&(o[t]=f.cloneElement(r,{onExited:n.bind(null,r),in:p.props.in,exit:ne(r,"exit",e),enter:ne(r,"enter",e)}))}}),o}var Pn=Object.values||function(e){return Object.keys(e).map(function(s){return e[s]})},On={component:"div",childFactory:function(s){return s}},J=(function(e){bt(s,e);function s(a,o){var t;t=e.call(this,a,o)||this;var r=t.handleExited.bind(Rn(t));return t.state={contextValue:{isMounting:!0},handleExited:r,firstRender:!0},t}var n=s.prototype;return n.componentDidMount=function(){this.mounted=!0,this.setState({contextValue:{isMounting:!1}})},n.componentWillUnmount=function(){this.mounted=!1},s.getDerivedStateFromProps=function(o,t){var r=t.children,c=t.handleExited,d=t.firstRender;return{children:d?Dn(o,c):Tn(o,r,c),firstRender:!1}},n.handleExited=function(o,t){var r=Ye(this.props.children);o.key in r||(o.props.onExited&&o.props.onExited(t),this.mounted&&this.setState(function(c){var d=Ne({},c.children);return delete d[o.key],{children:d}}))},n.render=function(){var o=this.props,t=o.component,r=o.childFactory,c=gt(o,["component","childFactory"]),d=this.state.contextValue,p=Pn(this.state.children).map(r);return delete c.appear,delete c.enter,delete c.exit,t===null?U.createElement(Ee.Provider,{value:d},p):U.createElement(Ee.Provider,{value:d},U.createElement(t,c,p))},s})(U.Component);J.propTypes={};J.defaultProps=On;const Nn=G,zn={position:"bottom-right",autoClose:4e3,transitionDuration:250,allowDragDismiss:!0,allowScrollDismiss:!0,containerWidth:440,notificationMaxHeight:200,limit:5,zIndex:Vt("overlay"),store:en,withinPortal:!0,pauseResetOnHover:"all"},xt=at((e,{zIndex:s,containerWidth:n})=>({root:{"--notifications-z-index":s==null?void 0:s.toString(),"--notifications-container-width":Ut(n)}})),W=Le(e=>{const s=Fe("Notifications",zn,e),{classNames:n,className:a,style:o,styles:t,unstyled:r,vars:c,attributes:d,position:p,autoClose:m,transitionDuration:w,allowDragDismiss:g,allowScrollDismiss:k,containerWidth:x,notificationMaxHeight:_,limit:E,zIndex:h,store:l,portalProps:u,withinPortal:S,pauseResetOnHover:C,...j}=s,b=Xe(),R=tn(l),M=fn(),N=it(),D=f.useRef({}),X=f.useRef(0),[Y,A]=f.useState(0),he=f.useCallback(()=>A(T=>T+1),[]),me=f.useCallback(()=>A(T=>Math.max(0,T-1)),[]),q=b.respectReducedMotion&&N?1:w,z=st({name:"Notifications",classes:mt,props:s,className:a,style:o,classNames:n,styles:t,unstyled:r,attributes:d,vars:c,varsResolver:xt});f.useEffect(()=>{l==null||l.updateState(T=>({...T,limit:E||5,defaultPosition:p}))},[E,p]),$e(()=>{R.notifications.length>X.current&&setTimeout(()=>M(),0),X.current=R.notifications.length},[R.notifications]);const ge=Sn(R.notifications,p),V=pt.reduce((T,K)=>(T[K]=ge[K].map(({style:Q,...P})=>i.jsx(Nn,{timeout:q,onEnter:()=>D.current[P.id].offsetHeight,nodeRef:{current:D.current[P.id]},children:de=>i.jsx(ht,{ref:I=>{I&&(D.current[P.id]=I)},data:P,onHide:I=>nn(I,l),autoClose:m,transitionDuration:q,allowDragDismiss:g,allowScrollDismiss:k,paused:C==="all"?Y>0:!1,onHoverStart:he,onHoverEnd:me,...z("notification",{style:{...En({state:de,position:K,transitionDuration:q,maxHeight:_}),...Q}})})},P.id)),T),{});return i.jsxs(Yt,{withinPortal:S,...u,children:[i.jsx(v,{...z("root"),"data-position":"top-center",...j,children:i.jsx(J,{children:V["top-center"]})}),i.jsx(v,{...z("root"),"data-position":"top-left",...j,children:i.jsx(J,{children:V["top-left"]})}),i.jsx(v,{...z("root",{className:We.classNames.fullWidth}),"data-position":"top-right",...j,children:i.jsx(J,{children:V["top-right"]})}),i.jsx(v,{...z("root",{className:We.classNames.fullWidth}),"data-position":"bottom-right",...j,children:i.jsx(J,{children:V["bottom-right"]})}),i.jsx(v,{...z("root"),"data-position":"bottom-left",...j,children:i.jsx(J,{children:V["bottom-left"]})}),i.jsx(v,{...z("root"),"data-position":"bottom-center",...j,children:i.jsx(J,{children:V["bottom-center"]})})]})});W.classes=mt;W.varsResolver=xt;W.displayName="@mantine/notifications/Notifications";W.show=ce.show;W.hide=ce.hide;W.update=ce.update;W.clean=ce.clean;W.cleanQueue=ce.cleanQueue;W.updateState=ce.updateState;/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const An=[["path",{d:"M5 12l14 0",key:"svg-0"}],["path",{d:"M5 12l6 6",key:"svg-1"}],["path",{d:"M5 12l6 -6",key:"svg-2"}]],In=F("outline","arrow-left","ArrowLeft",An);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const $n=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-2.5 2.5",key:"svg-1"}],["path",{d:"M14 4l-1.201 4.805m-.802 3.207l-2 7.988",key:"svg-2"}],["path",{d:"M3 3l18 18",key:"svg-3"}]],Ln=F("outline","code-off","CodeOff",$n);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fn=[["path",{d:"M7 8l-4 4l4 4",key:"svg-0"}],["path",{d:"M17 8l4 4l-4 4",key:"svg-1"}],["path",{d:"M14 4l-4 16",key:"svg-2"}]],Xn=F("outline","code","Code",Fn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Yn=[["path",{d:"M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10",key:"svg-0"}],["path",{d:"M7 20h10",key:"svg-1"}],["path",{d:"M9 16v4",key:"svg-2"}],["path",{d:"M15 16v4",key:"svg-3"}]],Vn=F("outline","device-desktop","DeviceDesktop",Yn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Un=[["path",{d:"M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14",key:"svg-0"}],["path",{d:"M11 4h2",key:"svg-1"}],["path",{d:"M12 17v.01",key:"svg-2"}]],Hn=F("outline","device-mobile","DeviceMobile",Un);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Wn=[["path",{d:"M14 3v4a1 1 0 0 0 1 1h4",key:"svg-0"}],["path",{d:"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",key:"svg-1"}]],Bn=F("outline","file","File",Wn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Gn=[["path",{d:"M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2",key:"svg-0"}]],qn=F("outline","folder-open","FolderOpen",Gn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Jn=[["path",{d:"M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2",key:"svg-0"}]],Kn=F("outline","folder","Folder",Jn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const Qn=[["path",{d:"M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008",key:"svg-0"}]],Zn=F("outline","moon","Moon",Qn);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const eo=[["path",{d:"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",key:"svg-0"}],["path",{d:"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",key:"svg-1"}]],ke=F("outline","refresh","Refresh",eo);/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const to=[["path",{d:"M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",key:"svg-0"}],["path",{d:"M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7",key:"svg-1"}]],no=F("outline","sun","Sun",to);function vt({nodes:e,selected:s,onSelect:n}){return i.jsx(v,{component:"nav","aria-label":"Design files",children:e.map(a=>i.jsx(yt,{node:a,selected:s,onSelect:n,depth:0},a.modulePath??a.name))})}function yt({node:e,selected:s,onSelect:n,depth:a}){var d;const o=!!((d=e.children)!=null&&d.length),[t,r]=f.useState(!0);if(o)return i.jsxs(v,{children:[i.jsx(Be,{onClick:()=>r(p=>!p),w:"100%",py:4,pl:a*12+4,pr:8,style:{borderRadius:"var(--mantine-radius-sm)"},children:i.jsxs(v,{component:"span",style:{display:"flex",alignItems:"center",gap:4,minWidth:0},children:[i.jsx(an,{size:14,style:{flexShrink:0,transition:"transform 150ms ease",transform:t?"rotate(90deg)":void 0}}),t?i.jsx(qn,{size:16,style:{flexShrink:0}}):i.jsx(Kn,{size:16,style:{flexShrink:0}}),i.jsx(L,{size:"sm",fw:500,truncate:!0,children:e.name})]})}),i.jsx(dt,{expanded:t,children:e.children.map(p=>i.jsx(yt,{node:p,selected:s,onSelect:n,depth:a+1},p.modulePath??p.name))})]});const c=e.modulePath===s;return i.jsx(Be,{onClick:()=>e.modulePath&&n(e.modulePath),w:"100%",py:4,pl:a*12+24,pr:8,style:{borderRadius:"var(--mantine-radius-sm)",background:c?"var(--mantine-color-blue-light)":void 0},children:i.jsxs(v,{component:"span",style:{display:"flex",alignItems:"center",gap:6,minWidth:0},children:[i.jsx(Bn,{size:15,style:{flexShrink:0,opacity:.7}}),i.jsx(L,{size:"sm",truncate:!0,c:c?"blue":void 0,fw:c?500:void 0,children:e.name})]})})}function oo(e){const s="/ckk-tool-v3/design-preview/",n=new URL(`${s}frame.html`,window.location.origin);return n.searchParams.set("design",e.design),n.searchParams.set("viewport",e.viewport),n.searchParams.set("scheme",e.scheme),n.searchParams.set("mode",e.mode),e.remountKey!=null&&n.searchParams.set("t",String(e.remountKey)),`${n.pathname}${n.search}`}function io({url:e,design:s,viewport:n="desktop",scheme:a,mode:o,remountKey:t=0,onViewportChange:r}){const c=n==="mobile",d=oo({design:s,viewport:n,scheme:a,mode:o,remountKey:t});return i.jsxs(v,{style:{border:"1px solid var(--mantine-color-default-border)",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",background:"var(--mantine-color-body)",display:"flex",flexDirection:"column",width:"100%",maxWidth:c?390:1280,margin:"0 auto"},children:[i.jsxs(v,{style:{background:"var(--mantine-color-default-hover)",borderBottom:"1px solid var(--mantine-color-default-border)",padding:"10px 14px 10px",flexShrink:0},children:[i.jsxs(H,{gap:8,mb:10,justify:"space-between",children:[i.jsxs(H,{gap:8,children:[i.jsx(v,{style:{width:12,height:12,borderRadius:"50%",background:"#ff5f57",border:"1px solid rgba(0,0,0,0.12)"}}),i.jsx(v,{style:{width:12,height:12,borderRadius:"50%",background:"#febc2e",border:"1px solid rgba(0,0,0,0.12)"}}),i.jsx(v,{style:{width:12,height:12,borderRadius:"50%",background:"#28c840",border:"1px solid rgba(0,0,0,0.12)"}})]}),i.jsx(we,{label:c?"Switch to desktop":"Switch to mobile",withArrow:!0,children:i.jsx(B,{variant:"subtle",color:"gray",size:"sm","aria-label":c?"Switch to desktop":"Switch to mobile",onClick:()=>r==null?void 0:r(c?"desktop":"mobile"),children:c?i.jsx(Vn,{size:14}):i.jsx(Hn,{size:14})})})]}),i.jsxs(H,{gap:6,align:"center",children:[i.jsx(B,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Back",children:i.jsx(In,{size:14})}),i.jsx(B,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Forward",children:i.jsx(ln,{size:14})}),i.jsx(B,{variant:"subtle",color:"gray",size:"sm",disabled:!0,"aria-label":"Reload",children:i.jsx(ke,{size:14})}),i.jsxs(v,{style:{flex:1,background:"var(--mantine-color-default)",borderRadius:6,padding:"4px 10px",border:"1px solid var(--mantine-color-default-border)",display:"flex",alignItems:"center",gap:6},children:[i.jsx(cn,{size:11,color:"var(--mantine-color-green-6)",style:{flexShrink:0}}),i.jsx(L,{size:"xs",c:"dimmed",ff:"mono",truncate:!0,children:e})]})]})]}),i.jsx("iframe",{title:"Design preview",src:d,style:{width:"100%",height:c?700:600,border:0,display:"block",background:"var(--mantine-color-body)"}},d)]})}function Se(e,s){const[n,a]=f.useState(()=>new URLSearchParams(window.location.search).get(e)??s),o=f.useCallback(t=>{const r=new URLSearchParams(window.location.search);t?r.set(e,t):r.delete(e),window.history.replaceState(null,"",`?${r.toString()}`),a(t)},[e]);return[n,o]}function De(e,s){return s.trim().split(".").reduce((n,a)=>{if(n!=null&&typeof n=="object")return n[a]},e)}function Ke(e,s,n){const a=`{{#${n} `,o=`{{/${n}}}`;let t=1,r=s;for(;r<e.length;){const c=e.indexOf(a,r),d=e.indexOf(o,r);if(d===-1)throw new Error(`Unclosed {{#${n}}}`);if(c!==-1&&c<d)t++,r=c+a.length;else{if(t--,t===0)return{inner:e.slice(s,d),after:d+o.length};r=d+o.length}}throw new Error(`Unclosed {{#${n}}}`)}function so(e,s){return Ie(e,s)}function Ie(e,s){const n=[];let a=0;for(;a<e.length;){const o=e.indexOf("{{",a);if(o===-1){n.push(e.slice(a));break}o>a&&n.push(e.slice(a,o));const t=e.indexOf("}}",o+2);if(t===-1){n.push(e.slice(o));break}const r=e.slice(o+2,t).trim();if(r.startsWith("#each ")){const c=r.slice(6).trim(),{inner:d,after:p}=Ke(e,t+2,"each"),m=De(s,c);if(Array.isArray(m))for(const w of m){const g=w!=null&&typeof w=="object"?{...s,...w}:s;n.push(Ie(d,g))}a=p}else if(r.startsWith("#if ")){const c=r.slice(4).trim(),{inner:d,after:p}=Ke(e,t+2,"if");De(s,c)&&n.push(Ie(d,s)),a=p}else if(r.startsWith("/"))a=t+2;else{const c=De(s,r);n.push(c!=null?String(c):""),a=t+2}}return n.join("")}const ro=`/* Shared base styles for every PDF template. Flat / minimal: monochrome,
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
`,oe="../pdf-templates/",wt=Object.assign({"../pdf-templates/delivery-note.html":()=>O(()=>import("./delivery-note-sS540Im8.js"),[]).then(e=>e.default),"../pdf-templates/invoice.html":()=>O(()=>import("./invoice-StFHx3KR.js"),[]).then(e=>e.default),"../pdf-templates/order-acceptance.html":()=>O(()=>import("./order-acceptance-BbS0QBIR.js"),[]).then(e=>e.default),"../pdf-templates/quote.html":()=>O(()=>import("./quote-D04Kgwym.js"),[]).then(e=>e.default),"../pdf-templates/sales-order.html":()=>O(()=>import("./sales-order-Pfi3KWgJ.js"),[]).then(e=>e.default),"../pdf-templates/shipping-order.html":()=>O(()=>import("./shipping-order-CCos47B1.js"),[]).then(e=>e.default),"../pdf-templates/work-order.html":()=>O(()=>import("./work-order-fQdaFa_A.js"),[]).then(e=>e.default)}),St=Object.assign({"../pdf-templates/data/delivery-note.json":()=>O(()=>import("./delivery-note-mJ0mI4A8.js"),[]).then(e=>e.default),"../pdf-templates/data/invoice.json":()=>O(()=>import("./invoice-Cg5_V8mw.js"),[]).then(e=>e.default),"../pdf-templates/data/order-acceptance.json":()=>O(()=>import("./order-acceptance-0HF1S_ea.js"),[]).then(e=>e.default),"../pdf-templates/data/quote.json":()=>O(()=>import("./quote-BaHbwZiH.js"),[]).then(e=>e.default),"../pdf-templates/data/sales-order.json":()=>O(()=>import("./sales-order-G83QBgvp.js"),[]).then(e=>e.default),"../pdf-templates/data/shipping-order.json":()=>O(()=>import("./shipping-order-DsBIT-FR.js"),[]).then(e=>e.default),"../pdf-templates/data/work-order.json":()=>O(()=>import("./work-order-C9KROCEx.js"),[]).then(e=>e.default)}),pe=Object.keys(wt).sort((e,s)=>je(e,oe,"html").localeCompare(je(s,oe,"html"))),Qe=lt(pe,oe,"html");function Ze(e){const s=e.replace(oe,"").replace(/\.html$/,""),n=`${oe}data/${s}.json`;return n in St?n:null}const et=794,tt=1123,ao=`@font-face {
  font-family: 'Noto Sans JP';
  src: url('${window.location.origin}/ckk-tool-v3/design-preview/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}`;function lo(e){const s=`<style>
${ao}
</style>`,n=`<style>
${ro}
</style>`,a="<style>body { padding: 10mm !important; }</style>",o=/<link[^>]*href=["']base\.css["'][^>]*\/?>/i,t=o.test(e)?e.replace(o,n):e.includes("<head>")?e.replace("<head>",`<head>
${n}`):n+e,r=`${s}
${a}`;return t.includes("</head>")?t.replace("</head>",`${r}
</head>`):r+t}function co(){const[e,s]=Se("template",pe[0]??""),n=pe.includes(e)?e:pe[0]??null,a=b=>s(b??""),[o,t]=f.useState(null),[r,c]=f.useState("{}"),[d,p]=f.useState("{}"),[m,w]=f.useState(!1),[g,k]=f.useState(!1),[x,_]=f.useState(!1),[E,h]=f.useState(0);f.useEffect(()=>{if(!n){t(null),p("{}"),c("{}");return}w(!0),t(null);const b=Ze(n);Promise.all([wt[n](),b?St[b]():Promise.resolve(null)]).then(([R,M])=>{t(R);const N=M||"{}";c(N),p(N),w(!1)})},[n,E]);const{processedHtml:l,jsonError:u}=f.useMemo(()=>{if(!o)return{processedHtml:null,jsonError:null};try{const b=JSON.parse(d);return{processedHtml:so(o,b),jsonError:null}}catch(b){return{processedHtml:o,jsonError:String(b)}}},[o,d]);async function S(){var b;if(!(!n||g)){k(!0);try{const R=n.slice(oe.length),M=await fetch(`/api/pdf?template=${encodeURIComponent(R)}`,{method:"POST"});if(!M.ok)throw new Error(`PDF generation returned ${M.status}`);const N=await M.blob(),D=M.headers.get("content-disposition"),X=((b=D==null?void 0:D.match(/filename="?([^"]+)"?/))==null?void 0:b[1])??`${C??"template"}.pdf`,Y=URL.createObjectURL(N),A=document.createElement("a");A.href=Y,A.download=X,document.body.appendChild(A),A.click(),document.body.removeChild(A),URL.revokeObjectURL(Y)}catch(R){console.error("PDF generation failed:",R)}finally{k(!1)}}}const C=n?je(n,oe,"html"):null,j=Ze(n??"")!==null;return i.jsxs(v,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(v,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsx(ct,{h:"100%",p:"xs",children:Qe.length===0?i.jsx(L,{size:"sm",c:"dimmed",p:"xs",children:"No .html files in pdf-templates/ yet."}):i.jsx(vt,{nodes:Qe,selected:n,onSelect:a})})}),i.jsxs(v,{style:{flex:1,display:"flex",flexDirection:"column",minHeight:0},children:[n&&i.jsx(v,{px:"md",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)",flexShrink:0},children:i.jsxs(H,{justify:"space-between",children:[i.jsx(L,{size:"sm",c:"dimmed",ff:"monospace",children:C}),i.jsxs(H,{gap:"xs",children:[i.jsx(B,{variant:"default",title:"Reload template",onClick:()=>h(b=>b+1),children:i.jsx(ke,{size:16})}),j&&i.jsx(we,{label:x?"Hide data editor":"Edit JSON data",children:i.jsx(B,{variant:x?"filled":"default",onClick:()=>_(b=>!b),children:x?i.jsx(Ln,{size:16}):i.jsx(Xn,{size:16})})}),i.jsx(Ht,{size:"xs",leftSection:i.jsx(dn,{size:14}),onClick:S,disabled:!l,loading:g,children:"Save PDF"})]})]})}),i.jsxs(v,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(v,{style:{flex:1,overflow:"auto",background:"var(--mantine-color-gray-2)",padding:32},children:n?m?i.jsx(Te,{style:{minHeight:"100%"},children:i.jsxs(Pe,{align:"center",gap:"xs",children:[i.jsx(rt,{size:"sm"}),i.jsx(L,{size:"sm",c:"dimmed",children:"Loading…"})]})}):l?i.jsx(v,{style:{width:et,minHeight:tt,background:"white",boxShadow:"0 4px 32px rgba(0,0,0,0.18)",margin:"0 auto",overflow:"hidden"},children:i.jsx("iframe",{srcDoc:lo(l),title:C??"PDF Template",style:{width:et,height:tt,border:"none",display:"block"}},`${n}-${E}-${d}`)}):null:i.jsx(Te,{style:{minHeight:"100%"},children:i.jsx(L,{c:"dimmed",children:pe.length===0?"Drop an .html file into design-preview/pdf-templates/ to get started.":"Select a template from the tree on the left."})})}),x&&i.jsxs(v,{w:380,style:{flexShrink:0,borderLeft:"1px solid var(--mantine-color-default-border)",display:"flex",flexDirection:"column",background:"var(--mantine-color-body)"},children:[i.jsx(v,{px:"sm",py:"xs",style:{borderBottom:"1px solid var(--mantine-color-default-border)",flexShrink:0},children:i.jsxs(H,{justify:"space-between",children:[i.jsxs(H,{gap:"xs",children:[i.jsx(L,{size:"xs",fw:600,children:"JSON Data"}),u&&i.jsx(we,{label:u,multiline:!0,w:260,withArrow:!0,children:i.jsx(Wt,{color:"red",size:"xs",style:{cursor:"help"},children:"Parse error"})})]}),i.jsx(we,{label:"Reset to default",children:i.jsx(B,{size:"xs",variant:"subtle",onClick:()=>p(r),disabled:d===r,children:i.jsx(ke,{size:12})})})]})}),i.jsx("textarea",{value:d,onChange:b=>p(b.target.value),spellCheck:!1,style:{flex:1,resize:"none",border:"none",outline:"none",padding:"10px 12px",fontFamily:'ui-monospace, "Cascadia Code", "Fira Code", monospace',fontSize:"11px",lineHeight:1.6,background:"var(--mantine-color-body)",color:"var(--mantine-color-text)"}})]})]})]})]})}const nt=lt(ue);function uo(e){return`https://ckk.local/${e.replace("../designs/","").replace(/\.tsx$/,"").split("/").map(a=>a.replace(/([A-Z])/g,(o,t,r)=>r===0?t.toLowerCase():`-${t.toLowerCase()}`)).join("/")}`}function fo(){const[e,s]=Se("mode","ui"),n=e==="pdf"?"pdf":"ui",[a,o]=Se("design",ue[0]??""),t=ue.includes(a)?a:ue[0]??null,r=h=>o(h??""),[c,d]=Se("viewport","desktop"),p=c==="mobile"?"mobile":"desktop",[m,w]=f.useState(0),{toggleColorScheme:g}=on(),x=sn("light",{getInitialValueInEffect:!1})==="dark"?"dark":"light",_=x==="dark",E=t&&Bt(t)?"component":"page";return i.jsxs(Pe,{gap:0,h:"100vh",children:[i.jsx(v,{p:"sm",style:{borderBottom:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsxs(H,{justify:"space-between",children:[i.jsxs(H,{gap:"sm",children:[i.jsx(Gt,{order:5,style:{flexShrink:0},children:"Design Preview"}),n==="ui"&&t&&i.jsx(L,{size:"sm",c:"dimmed",ff:"monospace",children:je(t)})]}),i.jsxs(H,{gap:"xs",children:[n==="ui"&&i.jsx(B,{variant:"default",title:"Re-render",onClick:()=>w(h=>h+1),children:i.jsx(ke,{size:16})}),i.jsx(B,{variant:"default",title:_?"ライトモード":"ダークモード",onClick:()=>g(),"aria-label":"カラーモード切替",children:_?i.jsx(no,{size:16}):i.jsx(Zn,{size:16})}),i.jsx(rn,{size:"xs",value:n,onChange:h=>s(h),data:[{label:"UI Designs",value:"ui"},{label:"PDF Templates",value:"pdf"}]})]})]})}),n==="pdf"?i.jsx(co,{}):i.jsxs(v,{style:{flex:1,display:"flex",minHeight:0},children:[i.jsx(v,{w:240,style:{flexShrink:0,borderRight:"1px solid var(--mantine-color-default-border)",background:"var(--mantine-color-body)"},children:i.jsx(ct,{h:"100%",p:"xs",children:nt.length===0?i.jsx(L,{size:"sm",c:"dimmed",p:"xs",children:"No .tsx files in designs/ yet."}):i.jsx(vt,{nodes:nt,selected:t,onSelect:r})})}),i.jsx(v,{style:{flex:1,overflow:"auto",background:_?"var(--mantine-color-dark-8)":"var(--mantine-color-gray-2)",padding:24},children:t?i.jsx(io,{url:uo(t),design:t,viewport:p,scheme:x,mode:E,remountKey:m,onViewportChange:d}):i.jsx(Te,{style:{minHeight:"100%"},children:i.jsx(Pe,{align:"center",gap:"xs",children:i.jsx(L,{c:"dimmed",children:ue.length===0?"Drop a .tsx file into design-preview/designs/ to get started.":"Select a design file from the tree on the left."})})})})]})]})}const jt=document.createElement("style");jt.textContent="@font-face { font-family: 'Noto Sans JP'; src: url('/ckk-tool-v3/design-preview/design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }";document.head.appendChild(jt);qt.createRoot(document.getElementById("root")).render(i.jsx(U.StrictMode,{children:i.jsx(Jt,{theme:Qt,colorSchemeManager:Kt,children:i.jsxs(Zt,{settings:{locale:"ja"},children:[i.jsx(W,{}),i.jsx(fo,{})]})})}));
