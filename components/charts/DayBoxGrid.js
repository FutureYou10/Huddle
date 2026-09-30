"use client";

// A calendar-run of small status boxes — used for the Workout Checklist and
// Food Discipline cards. `days` is [{date, status, title}] where status is
// one of: done | missed | rest | today | miss (food-off-target) | "" (future/open).
const STATUS_CLASS = {
  done: "wbox done",
  missed: "wbox missed",
  rest: "wbox rest",
  today: "wbox today",
  miss: "wbox food-miss",
  fooddone: "wbox food-done",
  "": "wbox",
};

export default function DayBoxGrid({ days }) {
  return (
    <div className="workout-grid">
      {days.map((d) => (
        <div key={d.date} className={STATUS_CLASS[d.status] ?? "wbox"} title={d.title} />
      ))}
    </div>
  );
}
