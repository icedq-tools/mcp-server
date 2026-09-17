<h1 align="center">iceDQ MCP Server</h1>

<p align="center">
  <strong>Connect your AI assistant to the iceDQ Data Reliability Platform, right inside VS Code</strong>
</p>

<p align="center">
  <a href="https://icedq.com">Website</a> &nbsp;&bull;&nbsp;
  <a href="https://docs.icedq.com/guides/mcp-server/intro">Documentation</a> &nbsp;&bull;&nbsp;
  <a href="mailto:getsupport@icedq.com">Support</a> &nbsp;&bull;&nbsp;
  <a href="https://icedq.com/privacy-policy">Privacy Policy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.2-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/VS_Code-1.101%2B-brightgreen.svg" alt="VS Code" />
</p>

---

## How It Works

The **iceDQ MCP for VS Code** extension registers the **iceDQ Data Reliability Platform** as an
MCP server inside VS Code, giving GitHub Copilot Chat direct access to your real iceDQ
environment during a conversation. Open Copilot Chat in **Agent mode** and simply describe what
you want in plain English — the assistant explores databases, files, and REST APIs, profiles data, and
creates **Validation**, **Duplicate**, **Checksum**, **Pushdown**, and **Reconciliation** rules
(including API Validation and API Recon) on your behalf, then executes, monitors, and reports on
them — all without leaving your editor.

| Capability                 | What you can do                                                                |
|-----------------------------|--------------------------------------------------------------------------------|
| **Data Exploration**        | Browse workspaces, connections, databases, schemas, tables, columns, files, and APIs |
| **Data Profiling**          | Fetch real sample data and analyze quality metrics (nulls, patterns, types)    |
| **AI Suggestions**          | Get intelligent check recommendations based on your data profile              |
| **Validation Rules**        | Row-level checks — NotNull, Format, ValidValues, Length, Date, Custom Groovy (DB, files, APIs) |
| **Duplicate Detection**     | Identify duplicates on business keys, composite keys, or conditional criteria  |
| **Pushdown Rules**          | SQL-driven aggregate validation (GROUP BY, JOINs, referential integrity)       |
| **Checksum Rules**          | Cross-source comparison (row counts, sums) between two different connections  |
| **Reconciliation**          | Row-level matching across databases, files, and APIs, with join-key mapping   |
| **Workflows**               | Chain multiple rules into sequential execution pipelines                      |
| **Schedules**               | Automate rule execution with one-time, daily, or weekly triggers              |
| **Custom Functions**        | Create and update Java/Groovy UDFs (Evaluator or Processor type)              |
| **Data Warehouse Queries**  | Structured queries against iceDQ execution-history datasets                   |
| **Execution & Monitoring**  | Run rules on demand, track status, and review exception reports               |
| **Organization**            | Manage folders, move rules in batch, create reusable parameters               |

This extension doesn't reimplement any of that — it bundles the same MCP server that powers the
`@icedq/mcp-server` npm package and the Claude Desktop extension, and simply tells VS Code how to
launch and configure it.

## Requirements

| Requirement   | Details                                                          |
|---------------|-------------------------------------------------------------------|
| **VS Code**   | 1.101 or later (for built-in MCP support)                        |
| **Node.js**   | None required — the server runs on VS Code's own bundled runtime |
| **iceDQ**     | iceDQ v7.5.0+ with a valid account and instance URL               |

## Getting Started

1. **Install** the extension from the VS Code Marketplace (search for "iceDQ").
2. Open Copilot Chat and switch to **Agent mode**, or press <kbd>Ctrl+Shift+P</kbd>
   (<kbd>Cmd+Shift+P</kbd> on macOS) to open the Command Palette, run **MCP: List Servers**, and
   start **iceDQ MCP Server**.
3. The first time it starts, you'll be asked to **choose how to authenticate** — see below — and
   then to fill in a short set of connection details. Everything is remembered after that.
4. Start asking your assistant to explore your data or create rules — no further setup needed.

## Setup: choosing how to authenticate

The first time the MCP server starts, a dropdown asks you to pick one of three authentication
methods:

| Method                | Best for                                                              |
|------------------------|------------------------------------------------------------------------|
| **Device Flow** (recommended) | Logging in through your browser — no password ever touches VS Code |
| **Username / Password** | Environments where browser login isn't available                     |
| **Access Token**        | Using an existing token issued by your own automation or a prior login |

Only after you pick one are you asked for the details that method actually needs, always in this
order — Base URL and Organization ID are required for every method:

| Field              | Device Flow | Username / Password | Access Token |
|---------------------|:-----------:|:--------------------:|:-------------:|
| Base URL            | ✅          | ✅                    | ✅            |
| Realm               | ✅          | ✅                    | ✅            |
| Client ID           | ✅          | ✅                    | ✅            |
| Client Secret       | —           | ✅ *(secure storage)* | —             |
| Username            | —           | ✅                    | —             |
| Password            | —           | ✅ *(secure storage)* | —             |
| Tokens File Path    | —           | —                     | ✅            |
| Organization ID     | ✅          | ✅                    | ✅            |

Each field is pre-filled with a sensible default where one exists, so accepting it is just
pressing Enter. Client Secret and Password are the only two never stored as plain settings — see
[Client Secret and Password](#client-secret-and-password) below.

You can change your authentication method at any time from the Command Palette
(`iceDQ: Set Authentication Type`), and every value you enter is a normal, visible setting you
can review or edit later — nothing is hidden or hardcoded.

## Settings

All configuration lives under **Settings → Extensions → iceDQ MCP** (search `icedq`):

| Setting                 | Description                                                        | Default                 |
|-------------------------|---------------------------------------------------------------------|--------------------------|
| `icedq.authType`        | `device_flow`, `username_password`, or `access_token`                 | `device_flow`            |
| `icedq.baseUrl`         | Base URL of your iceDQ instance                                       | _(empty)_                |
| `icedq.realm`           | Authentication realm                                                  | `icedq`                  |
| `icedq.orgId`           | Your iceDQ organization ID                                            | `org-icedq`              |
| `icedq.clientId`        | OAuth client ID                                                        | _(empty)_                |
| `icedq.rememberMe`      | Device Flow only: stay signed in across restarts                      | `true`                   |
| `icedq.username`        | Username, for Username/Password mode                                  | _(empty)_                |
| `icedq.tokensPath`      | Path to a token file, for Access Token mode                           | _(empty)_                |
| `icedq.verifySsl`       | Verify TLS certificates                                                | `true`                   |
| `icedq.debug`           | Verbose debug logging                                                  | `false`                  |
| `icedq.requestTimeout`  | API request timeout, in seconds                                       | `60`                     |
| `icedq.logLevel`        | Server log level (`error`/`warn`/`info`/`debug`)                       | `info`                   |

Every setting can be edited directly in Settings, or updated later through a matching Command
Palette entry (e.g. `iceDQ: Set Base URL`) — both write to the exact same place, so there's no
difference between "setting it" and "editing it" later.

### Client Secret and Password

For Username/Password mode, your Client Secret and Password are **never** stored as plain
settings. They live in VS Code's secure credential storage (Windows Credential Manager, macOS
Keychain, or Linux libsecret) instead:

- **Set or update:** `iceDQ: Set Client Secret` / `iceDQ: Set Password`
- **Clear:** `iceDQ: Clear Client Secret` / `iceDQ: Clear Password`

With the default Device Flow method, none of this applies — you log in through your browser and
no credentials are stored by the extension at all.

### Starting over

`iceDQ: Clear All Settings and Credentials` resets every setting and removes all stored
credentials in one step, with a confirmation prompt — useful when switching iceDQ instances or
accounts.

## Security & Privacy

- Credentials are provided through your own configuration and sent only to the iceDQ instance
  you specify — never to any third party.
- Client Secret and Password use your operating system's secure credential storage, not plain
  text files.
- All data flows directly between VS Code and your iceDQ instance.

## Support

- **Documentation:** [docs.icedq.com](https://docs.icedq.com/guides/mcp-server/intro)
- **Support:** [getsupport@icedq.com](mailto:getsupport@icedq.com)
- **Privacy Policy:** [icedq.com/privacy-policy](https://icedq.com/privacy-policy)
