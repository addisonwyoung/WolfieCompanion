import { useState } from 'react'
import { sampleProfile, students, courses } from './sampleData'
import type { CourseId, Course } from './sampleData'
import Profile from './Profile'
import CourseBrowser from './CourseBrowser'
import CrowdMeter from './CrowdMeter'
import CourseEvaluations from './CourseEvaluations'
import './App.css'

function App() {
  const [view, setView] = useState('dashboard')
  const [profile, setProfile] = useState(sampleProfile)
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>(courses)
  function addClasses(rows: { code: string; section: string }[]) {
    const imports = rows.map(row => {
      const match = row.code.trim().match(/^([A-Za-z]{2,4})\s*(\d{3})$/)!
      const code = `${match[1].toUpperCase()} ${match[2]}`
      return { id: code.toLowerCase().replace(' ', '-'), code, section: row.section.trim().toUpperCase() }
    })
    setEnrolledCourses(previous => {
      const next = previous.map(course => ({ ...course, sections: [...(course.sections ?? [])] }))
      for (const item of imports) {
        const existing = next.find(course => course.id === item.id)
        if (existing) existing.sections = [...new Set([...existing.sections, ...(item.section ? [item.section] : [])])]
        else next.push({ id: item.id, code: item.code, sections: item.section ? [item.section] : [] })
      }
      return next
    })
    setProfile(previous => ({ ...previous, courseIds: [...new Set([...previous.courseIds, ...imports.map(item => item.id)])] }))
    if (imports[0]) setSelectedId(imports[0].id)
  }
  const [selectedId, setSelectedId] = useState<CourseId>('cse-416')
  return <>
    <header className="site-header"><div className="header-inner"><a href="#main" className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Wolfie <strong>Companion</strong></span></a><span className="demo-badge"><span aria-hidden="true">●</span> Sample-data prototype</span></div></header>
    <main id="main">
      <nav className="app-nav" aria-label="Main navigation"><button aria-pressed={view === 'dashboard'} onClick={() => setView('dashboard')}>My dashboard</button><button aria-pressed={view === 'spaces'} onClick={() => setView('spaces')}>Study spaces</button><button aria-pressed={view === 'evaluations'} onClick={() => setView('evaluations')}>Course evaluations</button></nav>
      <div hidden={view !== 'dashboard'}>
      <div className="welcome"><p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p><h1>Find your people.</h1><p>Shared courses. Common interests. Connections start here.</p></div>
      <div className="dashboard"><Profile profile={profile} onSave={setProfile} /><CourseBrowser enrolledCourses={enrolledCourses} onAddClasses={addClasses} selectedId={selectedId} onSelect={setSelectedId} students={students} currentUserId={profile.id} /></div>
      </div>
      {view === 'spaces' && <CrowdMeter />}
      {view === 'evaluations' && <CourseEvaluations />}
    </main>
    <footer><span>Wolfie Companion</span><span>A small step toward a more connected campus.</span></footer>
  </>
}
export default App
