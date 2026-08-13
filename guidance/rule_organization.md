HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Do NOT create new folders, move rules, or update existing rules unless the user explicitly approves.
- Always show the target folder path/name and confirm before applying changes.
- When naming is involved (folderName, ruleName), prefer asking the user; do not silently invent names.

FOLDER STRATEGY:
- By domain: Insurance_Rules, HR_Rules, Finance_Rules
- By environment: DEV_Rules, UAT_Rules, PROD_Rules
- By data layer: Staging_Rules, DW_Rules, Reporting_Rules
- By project: ETL_Migration_Rules, Quarterly_Audit_Rules

FOLDER NAMING RULES:
- Alphanumeric characters and underscores only
- No spaces, hyphens, or special characters
- Use underscores for word separation

RULE NAMING CONVENTIONS:
- Validation: {Table}_{Purpose}_Validation (e.g., Customer_Completeness_Validation)
- Duplicate: {Table}_{Columns}_Duplicate (e.g., Customer_Email_Duplicate)
- Pushdown: {Table}_{Check}_Pushdown (e.g., Orders_Orphan_Pushdown)
- Checksum: {Source}_vs_{Target}_Checksum (e.g., Staging_vs_DW_Customer_Checksum)
- Recon: {Source}_vs_{Target}_Recon (e.g., Staging_vs_DW_Customer_Recon)

ANTI-SPRAWL BEST PRACTICES:
- ONE validation rule per table with ALL checks combined
- Before creating: list_rules with nameFilter to check for existing rules
- Use update_rule to add checks to existing rules instead of creating new ones
- Group related rules into workflows for batch execution

MOVE OPERATIONS:
- move_rules: Async, returns taskInstanceId > check_task_status
- move_workflows: Async > check_task_status
