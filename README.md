<p align="center">
   <img src="https://cdn-ildhhnd.nitrocdn.com/lLTTsRqXojmKENiGvwrypcTvmrbIWtKJ/assets/images/source/rev-faae778/icedq.com/wp-content/uploads/2025/01/icedq-logo.svg" alt="iceDQ Logo" width="80" />
</p>

<h1 align="center">iceDQ MCP Server</h1>

<p align="center">
  <strong>Connect your AI assistant to the iceDQ Data Reliability Platform</strong>
</p>

<p align="center">
  <a href="https://icedq.com">Website</a> &nbsp;&bull;&nbsp;
  <a href="https://docs.icedq.com/guides/mcp-server/intro">Documentation</a> &nbsp;&bull;&nbsp;
  <a href="mailto:getsupport@icedq.com">Support</a> &nbsp;&bull;&nbsp;
  <a href="https://icedq.com/privacy-policy">Privacy Policy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.5-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg" alt="Platform" />
</p>

---

## What Is This?

The iceDQ MCP Server lets you manage your entire data quality lifecycle through conversation with an AI assistant.
Ask it to explore your data sources, create validation rules, run reconciliations, monitor executions, and analyze
results — no UI switching required.

**48 tools** covering the full data quality lifecycle, grouped by what they do (see
[`manifest.json`](./manifest.json) for the exact tool names and descriptions the assistant calls):

| Category                        | Tools | What you can do                                                                                             |
|----------------------------------|:-----:|---------------------------------------------------------------------------------------------------------------|
| **Data Exploration**             |   8   | Browse workspaces, connections, databases, schemas, tables, and columns; verify a connection is reachable     |
| **Data Profiling & AI Suggestions** | 3  | Pull real sample rows, get null/uniqueness/pattern stats per column, and get AI-suggested checks from that profile |
| **Rule Creation**                |   6   | Create any of the five rule types — including AI-suggested join keys and column mappings before building a reconciliation rule |
| **Rule Management**              |   3   | Search/filter existing rules, inspect full configuration, and update checks, source/target, or join keys      |
| **Workflows**                    |   4   | Chain rules into a workflow and adjust membership later                                                        |
| **Schedules & Automation**       |   6   | Set up one-time/daily/weekly schedules, add more jobs later, trigger on demand, review run history             |
| **Execution & Monitoring**       |   4   | Run a rule or workflow, poll it to completion, and pull per-activity results and history                       |
| **Results & Exception Reporting**|   2   | Get the specific failing rows and reasons, or a link to view the report in the iceDQ UI                        |
| **Organization**                 |   5   | Organize rules/workflows into folders and track the async move operations                                      |
| **Reusable Parameters**          |   3   | Define reusable thresholds/date ranges/reference values, including bulk-loading from CSV                       |
| **Data Warehouse Analytics**     |   3   | Ask natural-language questions about DQ history via schema-validated structured queries (no raw SQL)           |

*(The 48th tool, `get_guidance`, isn't listed above — the assistant calls it internally before complex multi-step
operations; it's not something you ask for directly.)*

---

## Compatibility

Per the [v1.0.0 release notes](https://docs.icedq.com/guides/mcp-server/releases/v1/v1.0.0):

| Client                          | Support        | Setup guide                                                                  |
|----------------------------------|----------------|-------------------------------------------------------------------------------|
| **Claude Desktop**                | ✅ MCP Bundle  | [Step-by-step](#claude-desktop)                                              |
| **VS Code + GitHub Copilot Chat** | ✅ MCP client  | [Step-by-step](#vs-code--github-copilot-chat)                                |
| **VS Code + Claude Code**         | ✅ MCP client  | [Step-by-step](#vs-code--claude-code)                                        |
| **Cursor**                        | ✅ MCP client  | [Step-by-step](#cursor)                                                      |
| **Windows**                       | ✅ Tested      | —                                                                             |
| **macOS**                         | ✅ Tested      | —                                                                             |
| **Node.js**                       | 18.x or higher | Only needed if you launch via `npx` — Claude Desktop's `.mcpb` path doesn't  |

> **Recommended AI model:** Claude Sonnet 4 or higher, for the most accurate rule creation and workflow understanding.

---

## Before You Start: Get Your iceDQ Credentials

Every install method below needs the same values from your iceDQ instance. See the
[Credentials Guide](https://docs.icedq.com/guides/mcp-server/credentials) for exactly where to find each one in the
iceDQ UI, and the [Authentication Guide](https://docs.icedq.com/guides/mcp-server/icedq-mcp-authentication) for how
the two auth modes differ.

| Value               | Env var               | Required for               | Example                              |
|----------------------|------------------------|-----------------------------|----------------------------------------|
| **Base URL**         | `ICEDQ_BASE_URL`       | Both modes                  | *No default — always your own instance URL* |
| **Realm**            | `ICEDQ_REALM`          | Both modes                  | `icedq` or `iam.icedq`                 |
| **Client ID**        | `ICEDQ_CLIENT_ID`      | Both modes                  | —                                     |
| **Client Secret**    | `ICEDQ_CLIENT_SECRET`  | `username_password` only    | —                                     |
| **Username**         | `ICEDQ_USERNAME`       | `username_password` only    | —                                     |
| **Password**         | `ICEDQ_PASSWORD`       | `username_password` only    | —                                     |
| **Tokens file path** | `TOKENS_PATH`          | `access_token` only         | —                                     |
| **Organization ID**  | `ICEDQ_ORG_ID`         | Both modes                  | `org-icedq` or `org-iam.icedq`         |

Optional: `VERIFY_SSL` (default `true`; set `"false"` only for self-signed certs), `REQUEST_TIMEOUT` (default `60`
seconds), `DEBUG` (default `false`).

> **Base URL has no default.** Every organization runs its own iceDQ instance — the `https://app.icedq.net`
> value used throughout this guide's examples is illustrative only, not a shared cloud endpoint. Always replace
> it with your own instance's URL.

> **If you're launching via `npx`** (every client below except Claude Desktop's packaged extension), also set
> `NODE_OPTIONS=--use-system-ca` in the `env` block — this is in every official config example and avoids TLS errors
> on machines with a corporate root CA installed.

---

## Installation

Jump to your client:

- [Claude Desktop](#claude-desktop)
- [VS Code + GitHub Copilot Chat](#vs-code--github-copilot-chat)
- [VS Code + Claude Code](#vs-code--claude-code)
- [Cursor](#cursor)

Each section below is a condensed quick-start. For the full walkthrough with screenshots and troubleshooting, follow
the linked guide on docs.icedq.com.

### Claude Desktop

📖 **Full guide:** [Setup in Claude Desktop](https://docs.icedq.com/guides/mcp-server/setup-in-claude-desktop)

Two paths — **Path A (recommended)** installs a packaged `.mcpb` extension with a settings form and stores your
password in your OS keychain; **Path B** hand-edits a config file and needs Node.js 18+.

**Path A:** Download the `.mcpb` from the [Releases page](https://github.com/icedq-tools/mcp-server/releases), then
in Claude Desktop go to **Settings → Extensions → Install Extension** and select the file. Fill in the credentials
form that appears and click **Save**.

**Path B:** Edit `claude_desktop_config.json` (**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`,
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "icedq",
        "ICEDQ_CLIENT_ID": "your-client-id",
        "ICEDQ_CLIENT_SECRET": "your-client-secret",
        "AUTH_TYPE": "username_password",
        "ICEDQ_USERNAME": "your-username",
        "ICEDQ_PASSWORD": "your-password",
        "ICEDQ_ORG_ID": "your-org-id"
      }
    }
  }
}
```

Fully quit and reopen Claude Desktop (closing the window isn't enough), then verify with `List my iceDQ workspaces`.

---

### VS Code + GitHub Copilot Chat

📖 **Full guide:** [Setup in VS Code & Cursor](https://docs.icedq.com/guides/mcp-server/setup-in-vs-code-and-cursor#configure-vs-code)

Requires Node.js 18+ and the GitHub Copilot Chat extension, installed and signed in.

1. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **MCP: Open user configuration** → opens `mcp.json`.
2. Add:

```json
{
  "servers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "icedq",
        "ICEDQ_CLIENT_ID": "your-client-id",
        "ICEDQ_CLIENT_SECRET": "your-client-secret",
        "AUTH_TYPE": "username_password",
        "ICEDQ_USERNAME": "your-username",
        "ICEDQ_PASSWORD": "your-password",
        "ICEDQ_ORG_ID": "your-org-id",
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

3. Save (`Ctrl+S`/`Cmd+S`) — VS Code shows a **Start** option next to the `icedq` entry. Click it.
4. Verify in Copilot Chat (`Ctrl+Alt+I`/`Cmd+Ctrl+I`): `List my iceDQ workspaces`.

> ⚠️ This file stores your password in plain text. Don't commit `.vscode/mcp.json` to git if you're using
> workspace-scoped settings.

---

### VS Code + Claude Code

📖 **Full guide:** [Setup with Claude Code](https://docs.icedq.com/guides/mcp-server/setup-with-claude-code)

Use this instead of the Copilot Chat guide if you have a Claude subscription (Pro/Max/Team/Enterprise) or an
Anthropic API key rather than a Copilot subscription. Requires Node.js 18+ and the **Claude Code for VS Code**
extension published by **Anthropic** (`anthropic.claude-code`) — skip third-party wrappers.

**Path A — edit `.claude.json`** (home directory: **Windows** `%USERPROFILE%\.claude.json`, **macOS/Linux**
`~/.claude.json`):

```json
{
  "mcpServers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "icedq",
        "ICEDQ_CLIENT_ID": "your-client-id",
        "ICEDQ_CLIENT_SECRET": "your-client-secret",
        "AUTH_TYPE": "username_password",
        "ICEDQ_USERNAME": "your-username",
        "ICEDQ_PASSWORD": "your-password",
        "ICEDQ_ORG_ID": "your-org-id",
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

**Path B — CLI** (`npm install -g @anthropic-ai/claude-code` first if you don't have it):

```bash
claude mcp add icedq \
  --scope user \
  --env ICEDQ_BASE_URL=https://app.icedq.net \
  --env ICEDQ_REALM=icedq \
  --env ICEDQ_CLIENT_ID=<your-client-id> \
  --env ICEDQ_CLIENT_SECRET=<your-client-secret> \
  --env AUTH_TYPE=username_password \
  --env ICEDQ_USERNAME=<your-username> \
  --env ICEDQ_PASSWORD=<your-password> \
  --env ICEDQ_ORG_ID=<your-org-id> \
  --env NODE_OPTIONS=--use-system-ca \
  npx --yes @icedq/mcp-server
```

(Windows PowerShell: use `` ` `` for line continuation instead of `\`, or put it all on one line.)

Verify either path with `claude mcp list` (should show `icedq`), reload VS Code
(**Developer: Reload Window**), then ask in the Claude Code panel: `List my iceDQ workspaces`.

---

### Cursor

📖 **Full guide:** [Setup in VS Code & Cursor](https://docs.icedq.com/guides/mcp-server/setup-in-vs-code-and-cursor#configure-cursor)

Cursor has built-in MCP support — no extra extension needed. Requires Node.js 18+.

1. Settings (gear icon, or `Cmd+,`/`Ctrl+,`) → search **Tools & MCP** → **Add Custom MCP** → opens `mcp.json`
   (**macOS:** `~/.cursor/mcp.json`, **Windows:** `%USERPROFILE%\.cursor\mcp.json`).
2. Add:

```json
{
  "mcpServers": {
    "icedq": {
      "command": "npx",
      "args": ["-y", "@icedq/mcp-server"],
      "env": {
        "ICEDQ_BASE_URL": "https://app.icedq.net",
        "ICEDQ_REALM": "icedq",
        "ICEDQ_CLIENT_ID": "your-client-id",
        "ICEDQ_CLIENT_SECRET": "your-client-secret",
        "AUTH_TYPE": "username_password",
        "ICEDQ_USERNAME": "your-username",
        "ICEDQ_PASSWORD": "your-password",
        "ICEDQ_ORG_ID": "your-org-id",
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

3. Save, go back to **Settings → Tools & MCP**, and enable the toggle next to **icedq** — status should show
   **Active**.
4. Verify in Cursor chat (`Cmd+L`/`Ctrl+L`): `List my iceDQ workspaces`.

---

### Access token mode (all clients)

If you'd rather not store a password in a config file, every client above also supports **access token** mode —
swap the `username_password` fields for:

```json
"env": {
  "ICEDQ_BASE_URL": "https://app.icedq.net",
  "ICEDQ_REALM": "icedq",
  "ICEDQ_CLIENT_ID": "your-oauth-client-id",
  "AUTH_TYPE": "access_token",
  "TOKENS_PATH": "/full/path/to/icedq-tokens.json",
  "ICEDQ_ORG_ID": "your-org-id"
}
```

Generate the token file from iceDQ's **Profile → Token Generation**. See the
[Authentication Guide](https://docs.icedq.com/guides/mcp-server/icedq-mcp-authentication#access-token-mode) for the
full walkthrough — the connector refreshes the token automatically and writes the new pair back to the same file.

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

**Analytics:**
> "Show me the top 5 rules that failed most often last week"

---

## Troubleshooting

| Issue                       | Solution                                                                                            |
|-----------------------------|-------------------------------------------------------------------------------------------------------|
| **Server/extension not appearing** | Claude Desktop: fully quit and reopen. VS Code/Cursor: reload the window. Claude Code: `claude mcp list` |
| **Authentication failed**   | Verify Client ID, Client Secret, username, and password by logging into iceDQ in your browser with the same values |
| **No workspaces returned**  | Check `ICEDQ_ORG_ID` and confirm your user has workspace access                                       |
| **SSL certificate error**   | Set `VERIFY_SSL` to `false` (self-signed certs only — not for production)                             |
| **Invalid JSON**            | One missing comma/quote breaks the config — validate at [jsonlint.com](https://jsonlint.com/)         |
| **npm download blocked by corporate proxy** | `npm install -g @icedq/mcp-server`, then set `"command": "icedq-mcp-server"` with empty `args` |

Each client's full guide (linked above) has an exhaustive troubleshooting section, including exact Debug Mode steps
and log locations for that client.

Claude Desktop log file locations:
- **Windows:** `%APPDATA%\Claude\Logs\extensions\`
- **macOS:** `~/Library/Logs/Claude/extensions/`

---

## Security & Privacy

- Claude Desktop's packaged extension (Path A) stores your password in your OS keychain (Windows Credential
  Manager / macOS Keychain). Every other setup path — Claude Desktop Path B, VS Code, Claude Code, and Cursor —
  stores credentials in plain text in that client's config file. Don't commit those files to version control.
- All communication uses HTTPS with OAuth 2.0
- Data flows directly between your AI client and your iceDQ instance — no third parties, no vendor-hosted relay
- No telemetry or tracking of any kind
- No data persistence beyond the active session
- Use a separate OAuth client per user, and prefer `access_token` mode on shared machines

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
  <strong>iceDQ Data Reliability Platform</strong><br/>
  <em>End-to-end data reliability, powered by AI</em><br/><br/>
  <a href="https://icedq.com">icedq.com</a>
</p>
