PIPELINE BUILDING WORKFLOW:
1. Create rules (validation, duplicate, recon, etc.)
2. Organize into folder: create_folder > move_rules
3. Create workflow: create_workflow with rule IDs (Sequential execution only)
4. Create schedule: create_schedule with workflow/rule ID, template, start date, timezone
5. Optionally add more rules/workflows: add_rules_workflows_to_schedule

SCHEDULE TEMPLATES:
- Onetime: Single execution at specified date/time
- Daily: Repeats every day at specified hours/minutes, with reoccur interval
- Weekly: Repeats on specified day(s) of week at specified hours/minutes

SCHEDULE PARAMETERS:
- startDate: Format "MM/DD/YYYY HH:mm:ss UTC" (e.g., "04/10/2026 08:00:00 UTC")
- endDate: Required for Daily and Weekly templates
- timeZone: IANA timezone (e.g., "America/New_York", "UTC", "Asia/Kolkata")
- template: "Onetime", "Daily", "Weekly"
- hourArray: Array of hours as strings (e.g., ["8", "14", "20"])
- minuteArray: Array of minutes as strings (e.g., ["0", "30"])
- daysOfWeek: Array of day numbers as strings (0=Sunday through 6=Saturday)
- reoccur: For Daily template — 1=once per day, 2=every 2 hours, etc.

WORKFLOW MANAGEMENT:
- create_workflow: Creates with initial rules, template must be "Sequential"
- add_rules_to_workflow: Add more rules to existing workflow
- remove_rules_from_workflow: Remove rules from workflow
- move_workflows: Move to different folder (async)

NAMING CONVENTIONS:
- Folders: {Domain}_{Environment}_Rules (e.g., Insurance_Staging_Rules)
- Workflows: {Domain}_{Purpose}_Workflow (e.g., Insurance_Quality_Workflow)
- Schedules: {Domain}_{Frequency}_Schedule (e.g., Insurance_Daily_Schedule)
