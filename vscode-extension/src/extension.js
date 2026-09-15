const vscode = require('vscode');
const path = require('path');

const AUTH_TYPES = [
  {
    value: 'device_flow',
    label: 'Device Flow (recommended)',
    description: 'Opens a browser to log in — no password stored'
  },
  {
    value: 'username_password',
    label: 'Username / Password',
    description: 'Uses a Client ID/Secret plus your iceDQ username and password'
  },
  {
    value: 'access_token',
    label: 'Access Token',
    description: 'Uses a local JSON file containing access_token / refresh_token'
  }
];

// Plain (non-secret) settings that get an auto-prompt when empty, plus an
// explicit "iceDQ: Set ..." command. Keyed by the setting name (under the
// `icedq.` config section); `env` is the variable name passed to the server.
const PLAIN_FIELDS = {
  baseUrl: { env: 'ICEDQ_BASE_URL', title: 'iceDQ Base URL', placeHolder: 'e.g. https://app.icedq.net' },
  realm: { env: 'ICEDQ_REALM', title: 'iceDQ Realm', placeHolder: 'e.g. icedq' },
  orgId: { env: 'ICEDQ_ORG_ID', title: 'iceDQ Organization ID', placeHolder: 'e.g. org-icedq' },
  clientId: { env: 'ICEDQ_CLIENT_ID', title: 'iceDQ Client ID' },
  username: { env: 'ICEDQ_USERNAME', title: 'iceDQ Username' },
  tokensPath: { env: 'TOKENS_PATH', title: 'iceDQ Tokens File Path', placeHolder: 'Path to a JSON file with access_token/refresh_token' }
};

// Secrets: never touch settings.json — stored in SecretStorage (OS keychain).
const SECRETS = {
  clientSecret: { key: 'icedq.clientSecret', env: 'ICEDQ_CLIENT_SECRET', title: 'iceDQ Client Secret' },
  password: { key: 'icedq.password', env: 'ICEDQ_PASSWORD', title: 'iceDQ Password' }
};

// Always passed to the server, regardless of auth type — not a setting, and
// never shown to the user (matches every mode's mcp_config in manifest.json).
const CONSTANT_ENV = {
  NODE_OPTIONS: '--use-system-ca'
};

// Ordered list of prompt "steps" for a given auth type. baseUrl, realm and
// clientId come first (every auth type needs them), then whatever fields are
// specific to that auth type, and orgId always comes last — this fixes the
// prompt order to match: Base URL, Realm, Client ID, <auth-specific>, Org ID.
function requiredStepsFor(authType) {
  const steps = [
    { kind: 'plain', name: 'baseUrl' },
    { kind: 'plain', name: 'realm' },
    { kind: 'plain', name: 'clientId' }
  ];

  if (authType === 'username_password') {
    steps.push(
      { kind: 'secret', name: 'clientSecret' },
      { kind: 'plain', name: 'username' },
      { kind: 'secret', name: 'password' }
    );
  } else if (authType === 'access_token') {
    steps.push({ kind: 'plain', name: 'tokensPath' });
  }
  // device_flow needs nothing beyond baseUrl/realm/clientId/orgId.

  steps.push({ kind: 'plain', name: 'orgId' });
  return steps;
}

function buildEnv(config) {
  const env = { ...CONSTANT_ENV };
  const map = {
    AUTH_TYPE: config.get('authType'),
    REMEMBER_ME: String(config.get('rememberMe')),
    VERIFY_SSL: String(config.get('verifySsl')),
    DEBUG: String(config.get('debug')),
    REQUEST_TIMEOUT: String(config.get('requestTimeout')),
    LOG_LEVEL: config.get('logLevel')
  };
  for (const [key, value] of Object.entries(map)) {
    if (value !== undefined && value !== null && value !== '') env[key] = value;
  }
  for (const [name, field] of Object.entries(PLAIN_FIELDS)) {
    const value = config.get(name);
    if (value !== undefined && value !== null && value !== '') env[field.env] = value;
  }
  return env;
}

// True once the user (or a command) has actually written a value for this
// setting — as opposed to it merely resolving to its schema default. Used to
// decide whether to auto-prompt: a schema default (e.g. baseUrl's
// "https://app.icedq.net") should still be confirmed once, not silently used
// forever just because it happens to be non-empty.
function hasExplicitValue(config, name) {
  const inspected = config.inspect(name);
  return !!(
    inspected &&
    (inspected.globalValue !== undefined ||
      inspected.workspaceValue !== undefined ||
      inspected.workspaceFolderValue !== undefined)
  );
}

// Shows the auth-type picker and, if something was picked, persists it.
// Always prompts — used both for first-time setup and for switching later.
async function promptAndStoreAuthType(config) {
  const picked = await vscode.window.showQuickPick(AUTH_TYPES, {
    title: 'iceDQ: Choose Authentication Type',
    placeHolder: 'How should the iceDQ MCP server authenticate?',
    ignoreFocusOut: true
  });
  if (!picked) return undefined;
  await config.update('authType', picked.value, vscode.ConfigurationTarget.Global);
  return picked.value;
}

// Returns the configured auth type, prompting via QuickPick only if the user
// has never explicitly chosen one (i.e. it's still on the schema default).
// This is what lets a first-time user pick a type before any field-specific
// input boxes show up, while never re-prompting once a choice is on record.
async function ensureAuthType(config) {
  if (hasExplicitValue(config, 'authType')) return config.get('authType');

  const picked = await promptAndStoreAuthType(config);
  return picked || config.get('authType');
}

// Prompts for a plain (non-secret) config value and writes it to Settings
// (User scope) so it shows up as an editable value in Settings > Extensions
// afterwards, same as if the user had typed it there directly. Pre-fills
// with the current value (including a schema default) so confirming it is
// just pressing Enter.
async function promptAndStoreConfigValue(config, name, field) {
  const value = await vscode.window.showInputBox({
    title: field.title,
    placeHolder: field.placeHolder,
    value: config.get(name) || '',
    ignoreFocusOut: true
  });
  if (value === undefined) return undefined;
  await config.update(name, value, vscode.ConfigurationTarget.Global);
  return value;
}

// Returns the setting's value, prompting for it if the user hasn't
// explicitly set/confirmed it yet — even if a schema default makes it
// non-empty, since that default (e.g. a shared iceDQ base URL) still needs a
// one-time confirmation, and an org-specific field like Org ID or Client ID
// almost certainly needs a real value instead of its placeholder default.
async function ensureConfigValue(config, name, field) {
  if (hasExplicitValue(config, name)) {
    const existing = config.get(name);
    if (existing) return existing;
  }
  return promptAndStoreConfigValue(config, name, field);
}

// Prompts for a secret's value and stores it, overwriting any existing value.
// Used both by the explicit "set" commands and by auto-prompt-on-first-use.
async function promptAndStoreSecret(context, secretDef) {
  const value = await vscode.window.showInputBox({
    title: secretDef.title,
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'Leave empty to cancel'
  });
  if (!value) return undefined;
  await context.secrets.store(secretDef.key, value);
  return value;
}

// Returns the stored value for a secret, prompting the user for it if it's
// not set yet. Used when resolving the server definition, i.e. right before
// the server actually starts, per VS Code's guidance that auth-requiring
// user interaction belongs in resolveMcpServerDefinition, not provide*.
async function ensureSecret(context, secretDef) {
  const existing = await context.secrets.get(secretDef.key);
  if (existing) return existing;
  return promptAndStoreSecret(context, secretDef);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function registerConfigCommands(context, didChangeEmitter) {
  context.subscriptions.push(
    vscode.commands.registerCommand('icedq.setAuthType', async () => {
      const config = vscode.workspace.getConfiguration('icedq');
      const value = await promptAndStoreAuthType(config);
      if (value) {
        vscode.window.showInformationMessage(`iceDQ Authentication Type set to "${value}".`);
        didChangeEmitter.fire();
      }
    })
  );

  for (const [name, field] of Object.entries(PLAIN_FIELDS)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`icedq.set${capitalize(name)}`, async () => {
        const config = vscode.workspace.getConfiguration('icedq');
        const value = await promptAndStoreConfigValue(config, name, field);
        if (value !== undefined) vscode.window.showInformationMessage(`${field.title} saved.`);
      })
    );
  }
}

function registerCredentialCommands(context, didChangeEmitter) {
  for (const [name, secretDef] of Object.entries(SECRETS)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`icedq.set${capitalize(name)}`, async () => {
        const stored = await promptAndStoreSecret(context, secretDef);
        if (stored !== undefined) {
          vscode.window.showInformationMessage(`${secretDef.title} saved.`);
        }
      }),
      vscode.commands.registerCommand(`icedq.clear${capitalize(name)}`, async () => {
        await context.secrets.delete(secretDef.key);
        vscode.window.showInformationMessage(`${secretDef.title} cleared.`);
      })
    );
  }

  context.subscriptions.push(
    context.secrets.onDidChange((e) => {
      if (Object.values(SECRETS).some((s) => s.key === e.key)) {
        didChangeEmitter.fire();
      }
    })
  );
}

function registerClearAllCommand(context, didChangeEmitter) {
  context.subscriptions.push(
    vscode.commands.registerCommand('icedq.clearAll', async () => {
      const confirmed = await vscode.window.showWarningMessage(
        'Clear all saved iceDQ settings and credentials? This resets Authentication Type, Base URL, ' +
        'Realm, Organization ID, Client ID, Username, Tokens Path, Client Secret, and Password.',
        { modal: true },
        'Clear All'
      );
      if (confirmed !== 'Clear All') return;

      const config = vscode.workspace.getConfiguration('icedq');
      await Promise.all([
        config.update('authType', undefined, vscode.ConfigurationTarget.Global),
        ...Object.keys(PLAIN_FIELDS).map((name) =>
          config.update(name, undefined, vscode.ConfigurationTarget.Global)
        ),
        ...Object.values(SECRETS).map((secretDef) => context.secrets.delete(secretDef.key))
      ]);

      didChangeEmitter.fire();
      vscode.window.showInformationMessage('All iceDQ settings and credentials cleared.');
    })
  );
}

function activate(context) {
  const serverEntry = context.asAbsolutePath(path.join('server', 'icedq-mcp-server.js'));
  const didChangeEmitter = new vscode.EventEmitter();

  registerConfigCommands(context, didChangeEmitter);
  registerCredentialCommands(context, didChangeEmitter);
  registerClearAllCommand(context, didChangeEmitter);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('icedq')) didChangeEmitter.fire();
    })
  );

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('icedqMcpProvider', {
      onDidChangeMcpServerDefinitions: didChangeEmitter.event,

      provideMcpServerDefinitions: async () => {
        const config = vscode.workspace.getConfiguration('icedq');
        const env = buildEnv(config);
        const definition = new vscode.McpStdioServerDefinition(
          'iceDQ MCP Server',
          process.execPath,
          [serverEntry],
          env
        );
        definition.cwd = vscode.Uri.file(context.asAbsolutePath('server'));
        return [definition];
      },

      // Called right before the server actually starts — the right place to
      // prompt for missing config/credentials, per VS Code's MCP provider
      // contract (provideMcpServerDefinitions must not require interaction).
      resolveMcpServerDefinition: async (server) => {
        const config = vscode.workspace.getConfiguration('icedq');
        const authType = await ensureAuthType(config);
        server.env.AUTH_TYPE = authType;

        // Walked in order: Base URL, Realm, Client ID, then whatever this
        // auth type needs, then Org ID last.
        for (const step of requiredStepsFor(authType)) {
          if (step.kind === 'plain') {
            const field = PLAIN_FIELDS[step.name];
            const value = await ensureConfigValue(config, step.name, field);
            if (value) server.env[field.env] = value;
          } else {
            const secretDef = SECRETS[step.name];
            const value = await ensureSecret(context, secretDef);
            if (value) server.env[secretDef.env] = value;
          }
        }

        return server;
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
