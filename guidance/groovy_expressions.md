UNIVERSAL PATTERN — ALL RULE TYPES USE TRUE = PASS:
- Validation rules: TRUE = row passes, FALSE = row fails
- Recon rules: TRUE = data matches correctly, FALSE = mismatch
- Checksum rules: TRUE = values match, FALSE = values differ

COLUMN REFERENCE SYNTAX:
- Source column: S.[columnName]
- Target column: T.[columnName] (recon/checksum only)
- Square brackets required around column names
- Case-sensitive — must match exact column name from database

COMMON EXPRESSIONS:
- Positive number: S.[amount] > 0
- Non-empty string: S.[name] != null && S.[name].trim() != ""
- Date ordering: S.[start_date] <= S.[end_date]
- Allowed values: S.[status] in ["Active", "Pending", "Closed"]
- Regex pattern: S.[email] ==~ /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/
- Length range: S.[code].length() >= 2 && S.[code].length() <= 10
- Conditional: S.[discount] > 0 ? S.[discount_reason] != null : true
- Null-safe comparison: (S.[col] == null && T.[col] == null) || (S.[col] != null && S.[col] == T.[col])

VALUE MAPPING (Recon):
- (S.[Gender] == "M" && T.[Gender] == "Male") || (S.[Gender] == "F" && T.[Gender] == "Female") || (S.[Gender] == T.[Gender])
- Write as positive match conditions — do NOT negate with !()

GROOVY GOTCHAS:
- Use == for equality (not ===)
- String comparison: S.[col] == "value" (not .equals())
- Null check first: S.[col] != null && S.[col].trim() != "" (trim() on null throws NPE)
- in operator works for list membership: S.[col] in ["A", "B", "C"]
- ==~ for regex matching
