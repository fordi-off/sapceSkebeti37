const vm=require('vm'),fs=require('fs');
globalThis.window=undefined;
for(const f of ['util','planet'])vm.runInThisContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'));
const {Planet:P,orbit:O}=SS;
// circular orbit 200km, propagate half period
const r=P.R+2e5,v=Math.sqrt(P.mu/r);
const el=O.elements(r,0,0,v);
console.log('period',el.period,'ap',el.ap-P.R,'pe',el.pe-P.R);
let s=O.propagate(r,0,0,v,el.period/2);
console.log('half',s[0]/r,s[1]/r);
// elliptical
const el2=O.elements(r,0,0,v*1.2);
console.log('ell',el2.pe-P.R,el2.ap-P.R,el2.period);
s=O.propagate(r,0,0,v*1.2,el2.period*3.37);
const s2=O.propagate(r,0,0,v*1.2,el2.period*0.37);
console.log('mod diff',Math.hypot(s[0]-s2[0],s[1]-s2[1]));
// compare with numeric integration
let x=r,y=0,vx=0,vy=v*1.2,dt=0.05;
for(let t=0;t<el2.period*0.37;t+=dt){const rr=Math.hypot(x,y),a=-P.mu/(rr**3);vx+=a*x*dt/2;vy+=a*y*dt/2;x+=vx*dt;y+=vy*dt;const r2=Math.hypot(x,y),a2=-P.mu/(r2**3);vx+=a2*x*dt/2;vy+=a2*y*dt/2;}
console.log('numeric vs kepler',Math.hypot(x-s2[0],y-s2[1]));
// hyperbolic
const hv=Math.sqrt(2*P.mu/r)*1.3;
const eh=O.elements(r,0,0,hv);
console.log('hyp e',eh.e);
const h1=O.propagate(r,0,0,hv,5000);
x=r;y=0;vx=0;vy=hv;for(let t=0;t<5000;t+=0.05){const rr=Math.hypot(x,y),a=-P.mu/(rr**3);vx+=a*x*0.025;vy+=a*y*0.025;x+=vx*0.05;y+=vy*0.05;const r2=Math.hypot(x,y),a2=-P.mu/(r2**3);vx+=a2*x*0.025;vy+=a2*y*0.025;}
console.log('hyp diff',Math.hypot(x-h1[0],y-h1[1]));
console.log('atm',[0,5000,11000,50000,100000,150000].map(h=>{const a=SS.atmosphere(h);return h+':'+a.rho.toExponential(2)+'/'+a.P.toFixed(2)}));
console.log('timeToAp',el2.timeToAp,el2.timeToPe);
