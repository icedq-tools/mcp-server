<p align="center">
  <img src="https://cdn-ildhhnd.nitrocdn.com/lLTTsRqXojmKENiGvwrypcTvmrbIWtKJ/assets/images/source/rev-bd4cb96/icedq.com/wp-content/uploads/2025/01/icedq-logo.svg" alt="iceDQ Logo" width="80" />
</p>

<h1 align="center">iceDQ MCP Server v2.0.0 Beta</h1>

<p align="center">
  <strong>Connect your AI assistant to iceDQ Data Quality Platform</strong>
</p>

<p align="center">
  <a href="https://icedq.com">Website</a> &nbsp;&bull;&nbsp;
  <a href="https://docs.icedq.com/guides/mcp-server/intro">Documentation</a> &nbsp;&bull;&nbsp;
  <a href="mailto:getsupport@icedq.com">Support</a> &nbsp;&bull;&nbsp;
  <a href="https://icedq.com/privacy-policy">Privacy Policy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0--beta-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/status-beta-orange.svg" alt="Status" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node" />
</p>

> **Beta release.** This is a pre-release build of v2.0.0 for early testing. Everything below is functional and
> stable enough for real use, but interfaces may still change slightly before the general-availability release.
> Found an issue or have feedback? Reach us at [getsupport@icedq.com](mailto:getsupport@icedq.com).

---

## How It Works?

The iceDQ MCP Server connects **Claude Desktop**, **VS Code**, and **Cursor** to your **iceDQ Data Quality Platform**
instance, letting you manage data quality using natural language. Ask your AI assistant to explore your data, profile
tables, and create **Validation**, **Duplicate**, **Checksum**, **Pushdown**, and **Reconciliation** rules — then
execute, monitor, and analyze results, all through conversation.

**49 tools** covering the full data quality lifecycle:

| Capability                 | What you can do                                                                                  |
|----------------------------|--------------------------------------------------------------------------------------------------|
| **Data Exploration**       | Browse workspaces, connections, databases, schemas, tables, columns, and files                   |
| **Multi-Source Connectors**| Query databases, flat files (CSV, Excel, Parquet, JSON, XML, MongoDB), and REST APIs as rule sources |
| **Data Profiling**         | Fetch real sample data and analyze quality metrics (nulls, patterns, types)                      |
| **AI Suggestions**         | Get intelligent check recommendations based on your data profile                                 |
| **Validation Rules**       | Create row-level rules with NotNull, Format, ValidValues, Length, Date, and Custom Groovy checks |
| **Duplicate Detection**    | Identify duplicates on business keys, composite keys, or conditional criteria                    |
| **Pushdown Rules**         | SQL-driven aggregate validation (GROUP BY, JOINs, referential integrity)                         |
| **Checksum Rules**         | Cross-source comparison (row counts, sums) between two different connections                     |
| **Reconciliation**         | Row-level cross-source matching with AI-powered join key and column mapping                      |
| **Custom Functions**       | Create and manage reusable Java/Groovy functions for use across validation checks                |
| **Workflows**              | Chain multiple rules into sequential execution workflows                                         |
| **Schedules**              | Automate rule execution with one-time, daily, or weekly schedules                                |
| **Data Warehouse Queries** | Run structured, schema-validated queries against iceDQ's execution history datasets              |
| **Execution & Monitoring** | Run rules on demand, track status, and view exception reports                                    |
| **Organization**           | Manage folders, move rules in batch, create reusable parameters                                  |

---

## System Requirements

| Requirement          | Details                                                           |
|----------------------|-------------------------------------------------------------------|
| **Operating System** | Windows 10+, macOS 10.15+, or Linux *(see note below)*            |
| **AI Client**        | One of: Claude Desktop, VS Code, or Cursor (latest version)       |
| **Node.js**          | 18.0.0+ *(required for npx-based setup; the Claude Desktop extension bundles its own runtime)* |
| **iceDQ**            | v7.5.0+ with a valid user account                                 |

> **Linux users:** Install via the npx method (works in VS Code and Cursor). The packaged Claude Desktop extension (`.mcpb`) is currently macOS and Windows only because Claude Desktop itself does not ship a Linux build.

---

## Quick Start

### Step 1 — Get Your iceDQ Credentials

You need six values from your iceDQ instance before you can configure the MCP server:

- iceDQ Base URL
- Realm (default `iam.icedq`)
- Client ID and Client Secret (created in iceDQ → Administration → Security → Client Credentials)
- Your iceDQ username and password
- Organization ID (read from any rule's metadata)

For step-by-step instructions with screenshots, see the [Credentials Guide](docs/guides/mcp-server/CREDENTIALS.md).

### Step 2 — Install via npm

The iceDQ MCP Server is published on npm as **[`@icedq/mcp-server`](https://www.npmjs.com/package/@icedq/mcp-server)**. Most AI clients can launch it automatically with `npx` — no manual download or build step required.

Add the following to your AI client's MCP configuration:

```json
{
  "mcpServers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "iam.icedq",
        "ICEDQ_CLIENT_ID": "<your-client-id>",
        "ICEDQ_CLIENT_SECRET": "<your-client-secret>",
        "AUTH_TYPE": "username_password",
        "ICEDQ_USERNAME": "<your-username>",
        "ICEDQ_PASSWORD": "<your-password>",
        "ICEDQ_ORG_ID": "<your-org-id>",
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

#### Configuration Reference

| Variable              | Required                   | Description                                                          |
|-----------------------|----------------------------|----------------------------------------------------------------------|
| `ICEDQ_BASE_URL`      | Yes                        | Base URL of your iceDQ instance (e.g. `https://app.icedq.net`)       |
| `ICEDQ_REALM`         | Yes                        | Authentication realm (default `iam.icedq`)                           |
| `ICEDQ_CLIENT_ID`     | Yes                        | OAuth client ID for API authentication                               |
| `AUTH_TYPE`           | Yes                        | `username_password`, `access_token`, or `device_flow`                |
| `ICEDQ_ORG_ID`        | Yes                        | Your iceDQ organization ID                                           |
| `ICEDQ_CLIENT_SECRET` | For `username_password`    | OAuth client secret                                                  |
| `ICEDQ_USERNAME`      | For `username_password`    | Your iceDQ username                                                  |
| `ICEDQ_PASSWORD`      | For `username_password`    | Your iceDQ password                                                  |
| `TOKENS_PATH`         | For `access_token`         | Path to a token JSON file with `accessToken` and `refreshToken`      |
| `REMEMBER_ME`         | Optional, for `device_flow`| Defaults to remembering the cached session. Set to `false` to wipe stored tokens and force a fresh browser login |
| `DEBUG`               | Optional                   | Set to `true` for verbose logging                                    |
| `NODE_OPTIONS`        | Optional                   | Set to `--use-system-ca` so Node trusts your OS certificate store (needed if your iceDQ instance uses a corporate/self-signed CA) |

> **Claude Desktop users** can install the packaged extension instead of editing JSON — follow the setup guide below.

#### Alternative: Device Flow Authentication (no password required)

Instead of supplying a username and password, you can authenticate via **Device Flow** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) — the server opens a browser login page for you, and tokens are cached securely in your OS keychain (Windows Credential Manager, macOS Keychain, or Linux libsecret) so you only log in once. This is the recommended option for SSO/MFA-enabled accounts or shared machines where you don't want credentials stored in the MCP config.

```json
{
  "mcpServers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "iam.icedq",
        "ICEDQ_CLIENT_ID": "<your-client-id>",
        "AUTH_TYPE": "device_flow",
        "ICEDQ_ORG_ID": "<your-org-id>",
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

On first run, the server prints a verification URL and code to the console and opens your browser automatically. Once you log in, tokens are cached (OS keychain, falling back to a token file) and silently refreshed on subsequent runs — no need to re-authenticate. Set `REMEMBER_ME=false` to skip the cache and force a fresh login every time. See the [Device Flow internals guide](docs/deployment/device-flow-auth.md) for details.

#### Alternative: Access Token Authentication (pre-issued tokens)

If you already have an OAuth access/refresh token pair (e.g. issued by your own automation or a prior login), point the server at a token JSON file instead of supplying credentials directly:

```json
{
  "mcpServers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "iam.icedq",
        "ICEDQ_CLIENT_ID": "<your-client-id>",
        "AUTH_TYPE": "access_token",
        "TOKENS_PATH": "/path/to/tokens.json",
        "ICEDQ_ORG_ID": "<your-org-id>",
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

`TOKENS_PATH` must point to a JSON file shaped like:

```json
{
  "accessToken": "<JWT access token>",
  "refreshToken": "<JWT refresh token>"
}
```

The server reads this file on startup, uses the access token until it expires, and automatically refreshes it (rewriting the file) using the refresh token — no browser or password prompt involved. This is the recommended option for headless automation, CI, or server-to-server integrations where interactive login isn't possible.

### Setup Guides

Choose your AI client for a step-by-step walkthrough:

| Client                       | Guide                                                                                                       |
|------------------------------|-------------------------------------------------------------------------------------------------------------|
| **Claude Desktop**           | [Installation in Claude Desktop](https://docs.icedq.com/guides/mcp-server/icedq-mcp-installation-in-claude) |
| **VS Code + Copilot Chat**   | [VS Code Setup](https://docs.icedq.com/guides/mcp-server/icedq-mcp-vs-cursor-setup#configure-vs-code)       |
| **VS Code + Claude Code**    | [Claude Code Setup](https://docs.icedq.com/guides/mcp-server/icedq-mcp-claude-code-setup)                   |
| **Cursor**                   | [Cursor Setup](https://docs.icedq.com/guides/mcp-server/icedq-mcp-vs-cursor-setup#configure-cursor)         |

For authentication configuration, see
the [Authentication Guide](https://docs.icedq.com/guides/mcp-server/icedq-mcp-authentication).


---

## Usage Examples

### 1. Explore Your Data

**Prompt:** List my iceDQ workspaces and show the connections

**Response:**
> Found 2 workspaces:
> - Production_DQ (Active)
> - Development_DQ (Active)
>
> Production_DQ has 3 connections:
> - SQL_Server_Production (SqlServer) - ACTIVE
> - Snowflake_Warehouse (Snowflake) - ACTIVE
> - Azure_DataLake (AzureBlob) - ACTIVE

### 2. Profile Data Quality

**Prompt:** Fetch sample data from the Customers table and suggest quality checks

**Response:**
> Fetched 10 rows from dbo.Customers. Profiling results:
>
> Email: 33% null, valid email pattern in 60% of values
> FirstName: 1 empty value detected
> Status: 2 distinct values: Active, Inactive
> CreatedDate: Date pattern yyyy-MM-dd detected
>
> Suggested checks:
> 1. Email - NotNull (33% nulls detected)
> 2. Email - Format: Email pattern
> 3. FirstName - NotNull (empty values found)
> 4. Status - ValidValues: Active, Inactive
> 5. CreatedDate - Date format: yyyy-MM-dd

### 3. Create a Validation Rule

**Prompt:** Create a validation rule called Customer_Quality_Checks with those suggested checks

**Response:**
> Rule created successfully!
> Rule ID: rule-12345678-abcd-ef01-2345-678901234567
> Name: Customer_Quality_Checks
> Checks: 5 checks configured
> Status: Draft (ready to publish in iceDQ UI)

### 4. Detect Duplicates

**Prompt:** Check for duplicate emails in the Customers table

**Response:**
> Duplicate detection rule created!
> Rule ID: rule-aabbccdd-1122-3344-5566-778899001122
> Name: Customer_Email_Duplicates
> Columns: Email
> Status: Published (ready to execute)

### 5. Compare Data Across Sources

**Prompt:** Compare row counts between SQL Server Orders table and Snowflake FACT_ORDERS

**Response:**
> Checksum rule created!
> Rule ID: rule-eeff0011-2233-4455-6677-889900aabbcc
> Name: Orders_vs_FACT_ORDERS_Checksum
> Source: SQL_Server_Production / dbo.Orders
> Target: Snowflake_Warehouse / DATAOPS_DW.FACT_ORDERS
> Check: SOURCE_COUNT - TARGET_COUNT == 0

### 6. Execute and Monitor

**Prompt:** Execute the Customer_Quality_Checks rule and show results

**Response:**
> Execution completed!
> Status: Success
> Source rows: 1,000
> Exceptions: 5 rows failed validation
> Exit code: 5
>
> Breakdown:
> - Email_NotNull: 3 failures
> - Email_Format: 1 failure
> - FirstName_NotNull: 1 failure

### 7. Analyze Rule Execution History

**Prompt:** Analyze all rules executed last month and give me a summary of passed, failed, and errored rules

**Response:**
> Execution Summary — Last 30 Days
>
> Total rules executed: 24
>
> Passed: 17 rules
> - Customer_Quality_Checks — 0 exceptions
> - Orders_NotNull_Check — 0 exceptions
> - Product_Format_Validation — 0 exceptions
> - ... 14 more
>
> Failed: 5 rules (exceptions found)
> - Email_Duplicate_Check — 312 exceptions
> - Orders_vs_FACT_ORDERS_Checksum — count mismatch detected
> - Address_Format_Check — 87 exceptions
> - ... 2 more
>
> Errored: 2 rules (execution did not complete)
> - Inventory_Recon_Rule — connection timeout
> - Sales_Pushdown_Check — query syntax error

---

## Complete Tool Reference

### Discovery & Exploration (12 tools)
| Tool                     | Description                                                              |
|--------------------------|---------------------------------------------------------------------------|
| List Workspaces          | List all workspaces in your iceDQ instance                              |
| List Connections         | List data source connections in a workspace                             |
| Test Connection          | Test connectivity for a data source connection                          |
| List Folders             | List folders for organizing rules, workflows, schedules, and parameters |
| List Rules               | Search and filter rules by folder, name, state, or type                 |
| List Workflows           | List all workflows in a workspace                                       |
| List Schedules           | List all schedules in a workspace                                       |
| List Files             | List files available in a flat-file connection (Azure Blob, S3, local)    |
| Get Database Metadata    | Get connection details and database capabilities                        |
| List Connection Metadata | Navigate databases, schemas, tables, or columns for a connection        |
| Get Rule                 | Get full rule configuration, checks, and metadata                       |
| Get Guidance             | Get step-by-step workflow guidance before starting a multi-step task    |

### Data Analysis & Profiling (5 tools)

| Tool                    | Description                                                                          |
|-------------------------|---------------------------------------------------------------------------------------|
| Fetch DB Sample Data    | Execute SQL and fetch real sample rows from a database table                         |
| Fetch File Sample Data  | Preview rows from a flat-file, Parquet, Excel, JSON, XML, or MongoDB connection and register its schema |
| Fetch API Sample Data   | Call a REST API endpoint and fetch sample rows/columns to drive API rule creation    |
| Profile Data            | Analyze sample data for nulls, patterns, types, uniqueness                          |
| Suggest Quality Checks  | AI-powered check recommendations from profiled data                                 |

### Rule Creation (6 tools)

| Tool                   | Description                                        |
|------------------------|----------------------------------------------------|
| Create Validation Rule | Row-level validation with 6 check types            |
| Create Duplicate Rule  | Duplicate detection on single or composite columns |
| Create Pushdown Rule   | SQL-driven aggregate and cross-table validation    |
| Create Checksum Rule   | Cross-source numeric comparison (COUNT, SUM, AVG)  |
| Analyze Recon Mapping  | AI-powered join key and column mapping suggestions |
| Create Recon Rule      | Row-level cross-source reconciliation              |

### Custom Functions (3 tools)

| Tool                   | Description                                                    |
|------------------------|-----------------------------------------------------------------|
| Manage Custom Function | Create or update a reusable Java/Groovy function for use in checks |
| List Custom Functions  | List all custom functions available in a workspace             |
| Get Custom Function    | Retrieve the full definition of a custom function by ID or name |

### Rule Management (3 tools)

| Tool           | Description                                   |
|----------------|-----------------------------------------------|
| Update Rule    | Add/remove checks, change source table or SQL |
| Move Rules     | Move rules between folders (batch supported)  |
| Move Workflows | Move workflows between folders                |

### Execution & Monitoring (9 tools)

| Tool                          | Description                                                                            |
|-------------------------------|----------------------------------------------------------------------------------------|
| Execute Rule                  | Execute a rule or workflow on demand                                                   |
| Execute Schedule              | Trigger a schedule on demand                                                           |
| Check Task Status             | Monitor async operations (moves, etc.)                                                 |
| Check Workflow Run Status     | Track rule/workflow execution progress                                                 |
| Get Workflow Run Result       | Get detailed results with per-check exit codes                                         |
| Get Checks Exception Report   | View row-level failure details                                                         |
| Get Exception Report URL      | Get the iceDQ UI URL to view the full exception report for a rule or workflow instance |
| Get Rule Workflow Run History | View execution history for a rule or workflow                                          |
| Get Scheduler Runs History    | View execution history for a schedule                                                  |

### Organization (8 tools)

| Tool                              | Description                                        |
|-----------------------------------|----------------------------------------------------|
| Create Folder                     | Create folders to organize rules                   |
| Create Workflow                   | Chain rules into sequential workflows              |
| Add Rules to Workflow             | Add rules to an existing workflow                  |
| Remove Rules from Workflow        | Remove rules from a workflow                       |
| Create Schedule                   | Schedule automated rule execution                  |
| Modify Schedule                   | Update schedule timing and configuration           |
| Add Rules & Workflows to Schedule | Add rules/workflows to a schedule                  |
| Get Guidance                      | Get step-by-step workflow guidance for iceDQ tasks |

### Parameters (5 tools)

| Tool                         | Description                          |
|------------------------------|--------------------------------------|
| List Parameters              | List all parameters in a workspace   |
| Get Parameter                | Retrieve the full configuration of a parameter by ID |
| Create Parameter             | Create reusable configuration values |
| Update Parameter             | Update parameter key-value pairs     |
| Parse CSV & Create Parameter | Import parameters from a CSV file    |

### Data Warehouse Queries (3 tools)

| Tool                                | Description                                   |
|-------------------------------------|-----------------------------------------------|
| Data Warehouse Query Schema         | Get data warehouse query schema               |
| Data Warehouse Query Executor       | Execute structured data warehouse queries     |
| Validate & Explain Structured Query | Validate and preview a query before execution |

---

## Troubleshooting

| Issue                                   | Solution                                                                          |
|-----------------------------------------|-----------------------------------------------------------------------------------|
| **Organization ID required**            | Add your Organization ID in configuration (e.g. `org-icedq`)              |
| **SSL certificate verification failed** | Uncheck "Verify SSL" in settings (for self-signed certificates only)              |
| **No workspaces returned**              | Verify credentials, check base URL, ensure user has workspace access              |
| **Sample data not returning**           | Check connection is ACTIVE, verify table name (case-sensitive), check permissions |
| **Authentication failures**             | Verify client ID, client secret, username, and password are correct               |

### Enable Debug Mode

For detailed troubleshooting, enable verbose logging:

- **Claude Desktop (extension):** Settings → Extensions → iceDQ → Configure → **Debug Mode: ON**
- **npx / manual configuration:** add `"DEBUG": "true"` to the `env` block of your MCP configuration

Claude Desktop extension log locations:

- **Windows:** `%APPDATA%\Claude\Logs\extensions\`
- **macOS:** `~/Library/Logs/Claude/extensions/`

---

## Security & Privacy

### How Your Data is Protected

- **Credentials** are provided through your AI client's configuration and sent only to your iceDQ instance — the Claude Desktop extension stores them in your operating system keychain
- **All communication** uses HTTPS with OAuth 2.0 authentication
- **Data flows directly** between your AI client and your iceDQ instance -- no third parties
- **No telemetry** or tracking of any kind
- **No data persistence** by the MCP server beyond the active session
- **SSL verification** is enabled by default

### Privacy Policy

**Data collection:** None. The MCP server collects no usage data, telemetry, or analytics.

**Usage & storage:** All data flows directly between your AI client and your iceDQ instance. The MCP server holds credentials and API tokens in memory only for the duration of the active session. In `access_token` mode, tokens are persisted to the file path you supply (`TOKENS_PATH`) on your local machine — no data is written anywhere else.

**Third-party sharing:** None. No data is transmitted to Anthropic, iceDQ, or any third party beyond your own iceDQ instance.

**Data retention:** The MCP server retains nothing after the session ends. Token files (if used) remain on your local machine under your full control and can be deleted at any time.

**Contact:** [getsupport@icedq.com](mailto:getsupport@icedq.com)

For full details, see: [https://icedq.com/privacy-policy](https://icedq.com/privacy-policy)

---

## Support

Need help? We're here for you.

| Channel           | Contact                                          |
|-------------------|--------------------------------------------------|
| **Email**         | [getsupport@icedq.com](mailto:getsupport@icedq.com)    |
| **Documentation** | [docs.icedq.com](https://docs.icedq.com)         |
| **Website**       | [icedq.com](https://icedq.com)                   |

---

<p align="center">
  <strong>iceDQ Data Quality Platform</strong><br/>
  <em>End-to-end data reliability, powered by AI</em><br/><br/>
  <a href="https://icedq.com">icedq.com</a>
</p>
