# WorkOS Tasks, Server-Authoritative Timers & Projects

## 1. Task Lifecycle & Server-Authoritative Timers

WorkOS uses server-side timestamps to compute task durations accurately, preventing client-side timer manipulation.

```
                    ┌─────────────────────────┐
                    │      Task Created       │
                    │      (Status: TODO)     │
                    └────────────┬────────────┘
                                 │
                   Start Timer   ▼
                    ┌─────────────────────────┐
             ┌─────►│       IN_PROGRESS       │◄─────┐
             │      │  (Active Timer Session) │      │
             │      └────────────┬────────────┘      │
Resume Timer │                   │                   │ Resume Timer
             │      Pause Timer  ▼                   │
             │      ┌─────────────────────────┐      │
             └──────┤         PAUSED          ├──────┘
                    │ (Timer Paused in DB)    │
                    └────────────┬────────────┘
                                 │
                     Stop Timer  ▼
                    ┌─────────────────────────┐
                    │   Finalize Duration     │
                    │   Accumulate Seconds    │
                    └────────────┬────────────┘
                                 │
                   Mark Complete ▼
                    ┌─────────────────────────┐
                    │        COMPLETED        │
                    └─────────────────────────┘
```

---

## 2. Server-Authoritative Duration Formula

Timer calculation excludes paused duration to ensure exact worked time:

$$\text{Session Duration} = (\text{endedAt} - \text{startedAt}) - \sum \text{pausedDurations}$$

### Example Scenario
- **10:00 AM**: Start Timer (`startedAt = 10:00:00`)
- **10:30 AM**: Pause Timer (`pausedAt = 10:30:00`)
- **12:30 PM**: Resume Timer (`resumedAt = 12:30:00`, `pausedDuration += 120` min)
- **12:50 PM**: Stop Timer (`endedAt = 12:50:00`)
- **Total Elapsed**: $12:50 - 10:00 = 170$ minutes ($2\text{h } 50\text{m}$)
- **Total Paused**: $120$ minutes ($2\text{h } 00\text{m}$)
- **Actual Worked Time**: $170 - 120 = \mathbf{50\text{ minutes}}$ (Accurate!)

---

## 3. Projects & Team Collaboration

- **Project Hierarchy**:
  ```
  Project (e.g., "Website Redesign")
    ├── Manager (Project Lead)
    ├── Team Members (Developers, Designers, QA)
    └── Tasks / Bugs
         ├── Task 1: "Implement Auth Flow" (Assigned to Developer)
         ├── Task 2: "Design Landing Page" (Assigned to Designer)
         └── Bug 1: "Fix Mobile Responsive Menu" (Assigned to Developer)
  ```
- **Team Permissions**:
  - Project members can view project tasks and log worked time.
  - QA / Testers can create bug tasks under the project and assign them to specific developers or designers.
  - Project leaders / Admins can review aggregated hours worked across all project tasks.
- **Deactivated Employee Filter**: When assigning team members to a project, inactive or terminated employees are automatically excluded from selector dropdowns.
