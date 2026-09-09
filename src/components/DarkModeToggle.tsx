import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export default function DarkModeToggle(){
 const [dark,setDark]=useState(()=>localStorage.getItem('theme')==='dark');
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);localStorage.setItem('theme',dark?'dark':'light')},[dark]);
 return <button type="button" onClick={()=>setDark(v=>!v)} className="btn-secondary" title={dark?'الوضع النهاري':'الوضع الليلي'}>{dark?<Sun size={17}/>:<Moon size={17}/>}<span>{dark?'الوضع النهاري':'الوضع الليلي'}</span></button>
}
