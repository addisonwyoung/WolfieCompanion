import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ScheduleImportPreview from '../src/ScheduleImportPreview'
import { useState } from 'react'
import CourseBrowser from '../src/CourseBrowser'
import { courses, students } from '../src/sampleData'
import type { Course } from '../src/sampleData'
function App() {
 const [list,setList]=useState<Course[]>(courses)
 const [selected,setSelected]=useState<string|null>('cse-416')
 return <CourseBrowser enrolledCourses={list} selectedId={selected} onSelect={setSelected} students={students} currentUserId="alex" onAddClasses={async rows=>{
 setList(previous=>{ const next=previous.map(c=>({...c,sections:[...(c.sections??[])]})); for(const row of rows){const code=row.code.toUpperCase().replace(/\s/g,'').replace(/([A-Z]+)([0-9]+)/,'$1 $2'); const id=code.toLowerCase().replace(' ','-'); let course=next.find(c=>c.id===id);if(!course){course={id,code,sections:[]};next.push(course)} if(row.section&&!course.sections?.includes(row.section))course.sections?.push(row.section)}return next});setSelected(rows[0].code.toLowerCase().replace(/\s/g,'').replace(/([a-z]+)([0-9]+)/,'$1-$2'));
 }} />
}
const response = (rows = [{code:'CSE 310',section:'01',warnings:[]}]) => ({ok:true,json:async()=>({rows,warnings:[]})})
beforeEach(()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response()))
  URL.createObjectURL=vi.fn(()=> 'blob:test')
  URL.revokeObjectURL=vi.fn()
})
function choose() {
  fireEvent.change(screen.getByLabelText('Schedule image'),{target:{files:[new File(['image'],'schedule.png',{type:'image/png'})]}})
  fireEvent.load(screen.getByAltText('Selected schedule screenshot'))
}
function start() {
  render(<ScheduleImportPreview />)
  fireEvent.click(screen.getByRole('button',{name:'Import schedule'}))
}
test('selection is local, explicit extraction, edits/add/remove never save or mutate dashboard',async()=>{
  render(<App />);fireEvent.click(screen.getByRole('button',{name:'Import schedule'}));choose()
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
  expect(await screen.findByLabelText('Course code 1')).toHaveValue('CSE 310')
  expect(screen.getByLabelText('Section 1')).toHaveValue('01')
  fireEvent.change(screen.getByLabelText('Section 1'),{target:{value:'03'}})
  fireEvent.click(screen.getByRole('button',{name:'Add class'}))
  expect(screen.getByLabelText('Course code 2')).toHaveValue('')
  fireEvent.click(screen.getByRole('button',{name:'Remove class 2'}))
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.getByText('4 courses')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Clear preview'}))
  expect(screen.queryByLabelText('Course code 1')).not.toBeInTheDocument()
  expect(URL.revokeObjectURL).toHaveBeenCalled()
})
test('invalid and undecodable inputs never send OCR',()=>{
  start()
  for(const file of [new File(['x'],'x.pdf',{type:'application/pdf'}),new File([],'empty.png',{type:'image/png'}),new File([new Uint8Array(10*1024*1024+1)],'big.png',{type:'image/png'})]) {
    fireEvent.change(screen.getByLabelText('Schedule image'),{target:{files:[file]}})
    expect(screen.getByRole('button',{name:'Extract classes'})).toBeDisabled()
  }
  choose();fireEvent.error(screen.getByAltText('Selected schedule screenshot'))
  expect(screen.getByRole('status')).toHaveTextContent('could not be opened')
  expect(fetch).not.toHaveBeenCalled()
})
test('replacement/layout/clear/close discard stale responses and prevent duplicates',async()=>{
  for(const action of ['replace','layout','clear','close']) {
    let resolve!: (value: ReturnType<typeof response>)=>void
    vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>{resolve=r}) as Promise<Response>)
    start();choose();fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
    expect(screen.getByRole('button',{name:'Reading schedule…'})).toBeDisabled()
    if(action==='replace') choose()
    if(action==='layout') fireEvent.change(screen.getByLabelText('Screenshot layout'),{target:{value:'weekly-calendar'}})
    if(action==='clear') fireEvent.click(screen.getByRole('button',{name:'Clear preview'}))
    if(action==='close') fireEvent.click(screen.getByRole('button',{name:'Close'}))
    resolve(response()); await new Promise(r=>setTimeout(r,0))
    expect(screen.queryByLabelText('Course code 1')).not.toBeInTheDocument()
    const {cleanup}=await import('@testing-library/react');cleanup()
  }
})
test('empty responses and safe failures allow explicit retry without automatic requests',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response([]) as Response)
  start();choose();fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('No classes'))
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({error:'Schedule preview is disabled.'})} as Response)
  fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('disabled'))
  expect(fetch).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
  expect(await screen.findByLabelText('Section 1')).toHaveValue('01')
})
test('late failure after clear cannot replace current status; unmount releases image URL',async()=>{
  let reject!: (error: Error)=>void
  vi.mocked(fetch).mockImplementationOnce(()=>new Promise((_r,j)=>{reject=j}))
  start();choose();fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
  fireEvent.click(screen.getByRole('button',{name:'Clear preview'}))
  reject(new Error('stale error'));await new Promise(r=>setTimeout(r,0))
  expect(screen.getByRole('status')).not.toHaveTextContent('stale error')
  choose();const {cleanup}=await import('@testing-library/react');cleanup()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})
test('reviewed imports update the course list once, retain sections and survive clearing',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response([
    {code:'COM 120',section:'30',warnings:[]},
    {code:'com120',section:'30',warnings:[]},
    {code:'CSE 310',section:'01',warnings:[]},
  ]) as Response)
  render(<App />);fireEvent.click(screen.getByRole('button',{name:'Import schedule'}));choose()
  fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
  const add=await screen.findByRole('button',{name:'Add to Your courses'})
  fireEvent.click(add);fireEvent.click(add)
  await waitFor(()=>expect(screen.getByText('5 courses')).toBeInTheDocument())
  expect(screen.getByText('Section 30')).toBeInTheDocument()
  expect(screen.getByText('Section 01')).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Classmates in COM 120'})).toBeInTheDocument()
  expect(screen.getByText('No classmates yet')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'Add class',exact:true}))
  expect(add).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Clear preview'}))
  await waitFor(()=>expect(screen.getByText('5 courses')).toBeInTheDocument())
  const {cleanup}=await import('@testing-library/react');cleanup();render(<App />)
  expect(screen.getByText('4 courses')).toBeInTheDocument()
})
test('confirmed save waits, prevents duplicates, and retains draft on failure for retry',async()=>{
 let reject!:(reason:Error)=>void
 const save=vi.fn().mockImplementationOnce(()=>new Promise<void>((_resolve,fail)=>{reject=fail})).mockResolvedValue(undefined)
 render(<ScheduleImportPreview onAddClasses={save}/>);fireEvent.click(screen.getByRole('button',{name:'Import schedule'}));choose();fireEvent.click(screen.getByRole('button',{name:'Extract classes'}))
 fireEvent.click(await screen.findByRole('button',{name:'Add to Your courses'}));expect(screen.getByRole('button',{name:'Saving classes…'})).toBeDisabled()
 expect(save).toHaveBeenCalledTimes(1);reject(new Error('Offline; retry'))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Offline'));expect(screen.getByLabelText('Course code 1')).toHaveValue('CSE 310')
 fireEvent.click(screen.getByRole('button',{name:'Add to Your courses'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Classes saved'))
 expect(save).toHaveBeenCalledTimes(2)
})
