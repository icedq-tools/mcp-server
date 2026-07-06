<p align="center">
   <img src="https://cdn-ildhhnd.nitrocdn.com/lLTTsRqXojmKENiGvwrypcTvmrbIWtKJ/assets/images/source/rev-faae778/icedq.com/wp-content/uploads/2025/01/icedq-logo.svg" alt="iceDQ Logo" width="80" />
</p>

<h1 align="center">iceDQ MCP Server</h1>

<p align="center">
  <strong>Connect Claude Desktop to the iceDQ Data Quality Platform</strong>
</p>

<p align="center">
  <a href="https://icedq.com">Website</a> &nbsp;&bull;&nbsp;
  <a href="https://docs.icedq.com/guides/mcp-server/intro">Documentation</a> &nbsp;&bull;&nbsp;
  <a href="mailto:getsupport@icedq.com">Support</a> &nbsp;&bull;&nbsp;
  <a href="https://icedq.com/privacy-policy">Privacy Policy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.2-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform" />
</p>

---

## What Is This?

The iceDQ MCP Server lets you manage your entire data quality lifecycle through conversation in Claude Desktop. Ask
Claude to explore your data sources, create validation rules, run reconciliations, monitor executions, and analyze
results — no UI switching required.

**48 tools** covering the full data quality lifecycle:

| Capability                 | What you can do                                                                                  |
|----------------------------|--------------------------------------------------------------------------------------------------|
| **Data Exploration**       | Browse workspaces, connections, databases, schemas, tables, and columns                          |
| **Data Profiling**         | Fetch real sample data and analyze quality metrics (nulls, patterns, types)                      |
| **AI Suggestions**         | Get intelligent check recommendations based on your data profile                                 |
| **Validation Rules**       | Create row-level rules with NotNull, Format, ValidValues, Length, Date, and Custom Groovy checks |
| **Duplicate Detection**    | Identify duplicates on business keys, composite keys, or conditional criteria                    |
| **Pushdown Rules**         | SQL-driven aggregate validation (GROUP BY, JOINs, referential integrity)                         |
| **Checksum Rules**         | Cross-source comparison (row counts, sums) between two different connections                     |
| **Reconciliation**         | Row-level cross-source matching with AI-powered join key and column mapping                      |
| **Workflows**              | Chain multiple rules into sequential execution workflows                                         |
| **Schedules**              | Automate rule execution with one-time, daily, or weekly schedules                                |
| **Execution & Monitoring** | Run rules on demand, track status, and view exception reports                                    |
| **Organization**           | Manage folders, move rules in batch, create reusable parameters                                  |

---

## Installation in Claude Desktop

### Prerequisites

| Requirement          | Details                                                      |
|----------------------|--------------------------------------------------------------|
| **Claude Desktop**   | Latest version — [download here](https://claude.ai/download) |
| **Operating System** | Windows 10+ or macOS 10.15+                                  |
| **iceDQ**            | v7.5.0+ with a valid user account                            |

---

### Step 1 — Download the Extension

Download the latest `icedq-mcp-server.mcpb` file from the [Releases page](https://github.com/icedq/icedq-mcp/releases).

---

### Step 2 — Get Your iceDQ Credentials

You need the following values from your iceDQ instance before configuring the extension:

| Value               | Where to find it                                       |
|---------------------|--------------------------------------------------------|
| **Base URL**        | Your iceDQ instance URL (e.g. `https://app.icedq.net`) |
| **Realm**           | Authentication realm (default: `iam.icedq`)            |
| **Client ID**       | Administration → Security → Client Credentials         |
| **Client Secret**   | Administration → Security → Client Credentials         |
| **Username**        | Your iceDQ login email                                 |
| **Password**        | Your iceDQ login password                              |
| **Organization ID** | Visible in any rule's metadata (e.g. `org-iam.icedq`)  |



---

### Step 3 — Install the `.mcpb` Extension

#### Windows

1. Open **Claude Desktop**
2. Click the **menu icon** (top-left) → **Settings**
3. Go to the **Extensions** tab
4. Click **Install Extension**
5. Browse to and select `icedq-mcp-server.mcpb`
6. Click **Open** — Claude Desktop installs the extension

#### macOS

1. Open **Claude Desktop**
2. Click **Claude** in the menu bar → **Settings**
3. Go to the **Extensions** tab
4. Click **Install Extension**
5. Browse to and select `icedq-mcp-server.mcpb`
6. Click **Open** — Claude Desktop installs the extension

---

### Step 4 — Configure Your Credentials

After installation, Claude Desktop will prompt you to configure the extension:

1. In **Settings → Extensions**, find **iceDQ Data Quality Platform** and click **Configure**
2. Fill in the fields:

| Field               | Value                                            |
|---------------------|--------------------------------------------------|
| **iceDQ Base URL**  | Your instance URL (e.g. `https://app.icedq.net`) |
| **Realm Name**      | `iam.icedq` (or your custom realm)               |
| **Client ID**       | Your OAuth client ID                             |
| **Client Secret**   | Your OAuth client secret                         |
| **Username**        | Your iceDQ username                              |
| **Password**        | Your iceDQ password                              |
| **Organization ID** | Your org ID (e.g. `org-iam.icedq`)               |

3. Click **Save** and enable the extension by clicking Enable toggle.
---

### Step 5 — Verify the Installation

1. Start a new conversation in Claude Desktop
2. Type: `List my iceDQ workspaces`
3. Claude should respond with your workspace names and IDs

If it works — you're ready to go.

---

## Usage Examples

**Explore your data:**
> "List my iceDQ workspaces and show the connections in Production_DQ"

**Profile a table:**
> "Fetch sample data from the Customers table and suggest quality checks"

**Create a validation rule:**
> "Create a validation rule called Customer_Quality_Checks with those suggested checks"

**Run and monitor:**
> "Execute Customer_Quality_Checks and show me the results"

**Cross-source comparison:**
> "Compare row counts between SQL Server Orders and Snowflake FACT_ORDERS"

**Reconciliation:**
> "Reconcile the Customers table between Oracle and Snowflake using email as the join key"

---

## Troubleshooting

| Issue                       | Solution                                                   |
|-----------------------------|------------------------------------------------------------|
| **Extension not appearing** | Restart Claude Desktop after installation                  |
| **Authentication failed**   | Verify Client ID, Client Secret, username, and password    |
| **No workspaces returned**  | Check Base URL and ensure your user has workspace access   |
| **SSL certificate error**   | Set **Verify SSL** to `false` (for self-signed certs only) |
| **Tools not responding**    | Enable **Debug Mode** in extension settings and check logs |

### Debug Logs

Enable **Debug Mode** in Settings → Extensions → iceDQ → Configure.

Log file locations:

- **Windows:** `%APPDATA%\Claude\Logs\extensions\`
- **macOS:** `~/Library/Logs/Claude/extensions/`

---

## Security & Privacy

- Credentials are stored in your OS keychain — never on external servers
- All communication uses HTTPS with OAuth 2.0
- Data flows directly between Claude Desktop and your iceDQ instance — no third parties
- No telemetry or tracking of any kind
- No data persistence beyond the active session

Full details: [https://icedq.com/privacy-policy](https://icedq.com/privacy-policy)

---

## Support

| Channel           | Contact                                             |
|-------------------|-----------------------------------------------------|
| **Email**         | [getsupport@icedq.com](mailto:getsupport@icedq.com) |
| **Documentation** | [docs.icedq.com](https://docs.icedq.com)            |
| **Website**       | [icedq.com](https://icedq.com)                      |

---

<p align="center">
  <strong>iceDQ Data Quality Platform</strong><br/>
  <em>End-to-end data reliability, powered by AI</em><br/><br/>
  <a href="https://icedq.com">icedq.com</a>
</p>
