import { useEffect, useState } from 'react';
export default function LoginGate({ children }) {
  const [u,setU]=useState(()=>{try{return JSON.parse(localStorage.getItem('svp_user')||'null')}catch{return null}});
  const [name,setName]=useState(''); const [email,setEmail]=useState('');
  useEffect(()=>{ if(u && !u.name) setU(null); },[u]);
  if(u) return children;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(5,12,28,0.5)',display:'grid',placeItems:'center',zIndex:9999}}>
      <div style={{background:'#fff',padding:20,borderRadius:14,border:'1px solid #e6e9ef',minWidth:320}}>
        <h3 style={{margin:'0 0 10px',color:'#0b1f44'}}>Create account</h3>
        <div style={{display:'grid',gap:8}}>
          <input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <button className="primary" onClick={()=>{ if(!name||!email) return; localStorage.setItem('svp_user',JSON.stringify({name,email,created:Date.now()})); setU({name,email}); }}>Continue</button>
        </div>
      </div>
    </div>
  );
}
