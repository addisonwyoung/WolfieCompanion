import { offsetLabel, reminderOffsets } from './academicReminders'
import type { ReminderOffset } from './academicReminders'
export default function ReminderChoices({value,onChange,timed=true,disabled=false,label='Reminder times'}:{value:ReminderOffset[];onChange:(next:ReminderOffset[])=>void;timed?:boolean;disabled?:boolean;label?:string}){
 return <fieldset className="reminder-choices" disabled={disabled}><legend>{label}</legend>{reminderOffsets.map(key=><label key={key}><input type="checkbox" checked={value.includes(key)&&!(key==='three_hours'&&!timed)} disabled={key==='three_hours'&&!timed} onChange={event=>onChange(event.target.checked?[...value,key]:value.filter(k=>k!==key))}/>{offsetLabel(key,timed)}</label>)}{!value.length&&<small>Off — no reminders selected.</small>}{!timed&&<small>Add a due time to enable three-hour reminders. Day-based reminders use 9 AM America/New_York.</small>}</fieldset>
}
