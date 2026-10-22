// Synthetic browser fixture: no Supabase credentials or network persistence.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Profile from '../src/Profile'
import CourseBrowser from '../src/CourseBrowser'
import PeerProfileDialog from '../src/PeerProfileDialog'
import type { StudentProfile } from '../src/account'
import type { PeerApi } from '../src/classmateProfile'
import '../src/index.css'
import '../src/App.css'
const base:StudentProfile={id:'peer',name:'Classmate Ada',major:'Computer Science',year:'Graduate',interests:['Music','Hiking'],residence_status:'commuter',avatar_path:null}
export function Fixture(){
 const [profile,setProfile]=useState<StudentProfile>(()=>JSON.parse(localStorage.getItem('profile-sharing-fixture')??'null')??base)
 const [open,setOpen]=useState(false)
 const api:PeerApi={detail:async()=>({student_id:profile.id,name:profile.name,major:profile.major,has_shared_avatar:false,...(profile.share_year?{year:profile.year}:{}),...(profile.share_interests?{interests:profile.interests}:{}),...(profile.share_residence_status?{residence_status:profile.residence_status}:{})}),picture:async()=>{throw Error('No picture')}}
 return <main><div className="dashboard"><Profile profile={profile} onSave={async next=>{setProfile(next);localStorage.setItem('profile-sharing-fixture',JSON.stringify(next))}}/><CourseBrowser enrolledCourses={[{id:'cse-310',code:'CSE 310'}]} selectedId="cse-310" onSelect={()=>setOpen(false)} onAddClasses={async()=>{}} onRetry={()=>{}} onViewProfile={()=>setOpen(true)} roster={{status:'success',classmates:[{student_id:profile.id,name:profile.name,major:profile.major}]}}/></div>{open&&<PeerProfileDialog api={api} course="CSE 310" student="peer" onClose={()=>setOpen(false)}/>}</main>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>)
