import { useState } from 'react'
import { sampleProfile, students } from './sampleData'
import type { CourseId } from './sampleData'
import Profile from './Profile'
import CourseBrowser from './CourseBrowser'
import './App.css'

function App() {
  const [profile, setProfile] = useState(sampleProfile)
  const [selectedId, setSelectedId] = useState<CourseId>('cse-416')
  return <>
    <header className="site-header"><div className="header-inner"><a href="#main" className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Wolfie <strong>Companion</strong></span></a><span className="demo-badge"><span aria-hidden="true">●</span> Sample-data prototype</span></div></header>
    <main id="main">
      <div className="welcome"><p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p><h1>Find your people.</h1><p>Shared courses. Common interests. Connections start here.</p></div>
      <div className="dashboard"><Profile profile={profile} onSave={setProfile} /><CourseBrowser selectedId={selectedId} onSelect={setSelectedId} students={students} currentUserId={profile.id} /></div>
    </main>
    <footer><span>Wolfie Companion</span><span>A small step toward a more connected campus.</span></footer>
  </>
}
export default App
