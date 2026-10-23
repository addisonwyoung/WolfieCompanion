import { useId, useSyncExternalStore } from 'react'
import type { SavedCourse } from './account'
import type { AcademicItem } from './academicItems'
import { itemGroup } from './academicItems'
import { campusDate, itemsByDate, monthCells, monthSelection, readableDay, readableMonth, readableTime, shiftMonth } from './academicCalendarDates'

const phoneQuery = '(max-width: 640px)'
const subscribe = (notify: () => void) => {
  const query = window.matchMedia?.(phoneQuery)
  query?.addEventListener('change', notify)
  return () => query?.removeEventListener('change', notify)
}
const phoneSnapshot = () => window.matchMedia?.(phoneQuery).matches ?? false
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export default function AcademicCalendar({ items, courses, now, month, selectedDay, onSelect, onEdit, busy, hasItems, hasFilters, onClear }: {
  items: AcademicItem[]; courses: SavedCourse[]; now: Date; month: string; selectedDay: string
  onSelect: (day: string) => void; onEdit: (item: AcademicItem, trigger: HTMLElement) => void
  busy: boolean; hasItems: boolean; hasFilters: boolean; onClear: () => void
}) {
  const id = useId()
  const phone = useSyncExternalStore(subscribe, phoneSnapshot, () => false)
  const today = campusDate(now), days = itemsByDate(items, month), cells = monthCells(month)
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1)
  const count = [...days.values()].reduce((sum, list) => sum + list.length, 0)
  function entries(list: AcademicItem[]) {
    return <ul className="calendar-events">{list.map(item => {
      const course = courses.find(saved => saved.databaseId === item.user_course_id)?.code ?? 'Saved course'
      const status = item.completed_at ? 'Completed' : itemGroup(item, now) === 'Overdue' ? 'Overdue' : 'Pending'
      const time = item.due_time ? `${readableTime(item.due_time)} America/New_York` : ''
      return <li key={item.id}><button type="button" data-calendar-item={item.id} className={`calendar-event calendar-event-${status.toLowerCase()}`} disabled={busy}
        aria-label={`Edit ${item.title}, ${course}, ${item.type}, ${readableDay(item.due_date)}${time ? `, ${time}` : ''}, ${status}`}
        onClick={event => onEdit(item, event.currentTarget)}>
        <span className="calendar-event-title">{item.title}</span><span className="calendar-event-meta">{course} · {item.type}</span>
        {time && <span className="calendar-event-time">{time}</span>}<span className="calendar-event-status">{status}</span>
      </button></li>
    })}</ul>
  }
  return <section className="academic-calendar" aria-labelledby={`${id}-month`}>
    <div className="calendar-toolbar"><div><p className="eyebrow">YOUR DEADLINES</p><h2 id={`${id}-month`} data-calendar-heading tabIndex={-1} aria-live="polite">{readableMonth(month)}</h2></div>
      <div className="calendar-navigation"><button disabled={!previous || busy} aria-label="Previous month" onClick={() => previous && onSelect(monthSelection(previous, today))}>←</button><button disabled={busy} onClick={() => onSelect(today)}>Today</button><button disabled={!next || busy} aria-label="Next month" onClick={() => next && onSelect(monthSelection(next, today))}>→</button></div>
    </div>
    <table className={`calendar-month ${phone ? 'calendar-month-compact' : ''}`} aria-labelledby={`${id}-month`}><thead><tr>{weekdays.map(day => <th scope="col" key={day}><abbr title={day}>{day.slice(0, 3)}</abbr></th>)}</tr></thead>
      <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((day, index) => <td key={day ?? `blank-${index}`} className={day ? `${day === today ? 'calendar-today' : ''} ${day === selectedDay ? 'calendar-selected' : ''}` : 'calendar-padding'}>
        {day && <><button type="button" className="calendar-day" data-calendar-day={day} aria-label={`${readableDay(day)}, ${days.get(day)?.length ?? 0} items`} aria-pressed={day === selectedDay} aria-current={day === today ? 'date' : undefined} onClick={() => onSelect(day)}>
          <span>{Number(day.slice(-2))}</span>{phone && !!days.get(day)?.length && <span className="calendar-day-count" aria-hidden="true">{days.get(day)!.length}</span>}
        </button>{!phone && entries(days.get(day) ?? [])}</>}
      </td>)}</tr>)}</tbody>
    </table>
    {!count && <div className="calendar-empty"><p>{!hasItems ? 'Nothing planned yet. Add your first item.' : hasFilters ? 'No items match this month and filters.' : 'No items due this month.'}</p>{hasFilters && <button onClick={onClear}>Clear filters</button>}</div>}
    {phone && <section className="calendar-day-detail" aria-labelledby={`${id}-day`}><h3 id={`${id}-day`}>{readableDay(selectedDay)}</h3>{days.get(selectedDay)?.length ? entries(days.get(selectedDay)!) : <p className="muted">No items due on this date.</p>}</section>}
  </section>
}
