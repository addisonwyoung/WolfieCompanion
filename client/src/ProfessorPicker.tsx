import { useState } from 'react'
import type { CourseProfessor, ProfessorCatalogState } from './courseProfessors'

function courseParts(code: string) {
  const match = code.trim().toUpperCase().match(/^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$/)
  return match ? { course_code: match[1], course_number: match[2] } : null
}
const normalizedName = (value: string) => value.trim().toLocaleLowerCase()
const otherOption = 'Other (needs verification)'

export default function ProfessorPicker({ id, code, firstName, lastName, catalog, onChange }: {
  id: string
  code: string
  firstName: string
  lastName: string
  catalog: ProfessorCatalogState
  onChange: (firstName: string, lastName: string) => void
}) {
  const [query, setQuery] = useState('')
  const [otherMode, setOtherMode] = useState(false)
  const [open, setOpen] = useState(false)
  const parts = courseParts(code)
  const options = parts ? catalog.professors.filter(professor => professor.course_code === parts.course_code && professor.course_number === parts.course_number) : []
  const selected = options.find(option => normalizedName(option.professor_first_name) === normalizedName(firstName) && normalizedName(option.professor_last_name) === normalizedName(lastName))
  const optionValue = (option: CourseProfessor) => `${normalizedName(option.professor_last_name)}|${normalizedName(option.professor_first_name)}`
  const matches = options.filter(option => `${option.professor_first_name} ${option.professor_last_name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const listId = `${id}-professor-options`
  const selectedName = selected ? `${selected.professor_first_name} ${selected.professor_last_name}` : ''
  const hasUnlistedValue = Boolean(firstName || lastName) && !selected
  const showingOther = otherMode || hasUnlistedValue

  function chooseOther() {
    setOtherMode(true)
    setQuery('')
    setOpen(false)
    if (selected) onChange('', '')
  }

  function chooseProfessor(professor: CourseProfessor) {
    onChange(professor.professor_first_name, professor.professor_last_name)
    setQuery('')
    setOtherMode(false)
    setOpen(false)
  }

  return <div className="professor-picker">
    <label htmlFor={`${id}-professor`}>Professor
      <input id={`${id}-professor`} type="text" autoComplete="off" disabled={catalog.status !== 'success'}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        placeholder={showingOther ? otherOption : options.length ? 'Search listed professors' : 'Select Other'}
        value={showingOther ? otherOption : selectedName || query}
        onFocus={() => { if (!showingOther) setOpen(true) }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={event => {
          const value = event.target.value
          setOtherMode(false)
          setQuery(value)
          setOpen(true)
          if (firstName || lastName) onChange('', '')
        }} />
    </label>
    {open && !showingOther && <ul id={listId} className="professor-option-list" role="listbox" aria-label="Professor options">
      {matches.map(option => <li key={optionValue(option)} role="option" aria-selected={false}>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => chooseProfessor(option)}>
          {option.professor_first_name} {option.professor_last_name}
        </button>
      </li>)}
      {matches.length === 0 && <li className="professor-no-match">No listed professor matches.</li>}
      <li role="option" aria-selected={false}>
        <button type="button" className="professor-other-option" onMouseDown={event => event.preventDefault()} onClick={chooseOther}>{otherOption}</button>
      </li>
    </ul>}
    {showingOther && <div className="professor-other-fields">
      <label htmlFor={`${id}-professor-first`}>Professor first name<input id={`${id}-professor-first`} value={firstName} maxLength={80} onChange={event => onChange(event.target.value, lastName)} /></label>
      <label htmlFor={`${id}-professor-last`}>Professor last name<input id={`${id}-professor-last`} value={lastName} maxLength={80} onChange={event => onChange(firstName, event.target.value)} /></label>
    </div>}
  </div>
}
