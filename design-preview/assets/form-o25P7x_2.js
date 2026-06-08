function u(t){return n=>{const r=t.safeParse(n);if(r.success)return{};const s={};for(const o of r.error.issues){const e=o.path.join(".");e&&!s[e]&&(s[e]=o.message)}return s}}export{u as z};
