'use strict';

const { stripPluginNamespace } = require('./plugin-namespace');
const { adaptAntigravityAgent } = require('./antigravity-agent');
const { adaptCopilotAgent } = require('./copilot-agent');
const { disableOpenCodeHookPluginRegistration, getDisabledOpenCodePluginContent } = require('./hook-consent');

function rewriteCopilotWorkflowPaths(content, sourceRelativePath) {
  if (!/\.md$/i.test(sourceRelativePath)) return content;
  // Commands run from the installed project root. Rewrite only the supported
  // helper entrypoint, leaving unrelated project scripts and URLs untouched.
  return content.replace(/(^|[\s`"'(])scripts\/setup-package-manager\.js\b/g,
    '$1.github/ecc/scripts/setup-package-manager.js');
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function transformInstallContent(operation, content) {
  if (!operation.contentTransform) {
    return content;
  }
  if (operation.contentTransform === 'claude-manual-plugin-namespace') {
    return stripPluginNamespace(content);
  }
  if (operation.contentTransform === 'qwen-agent-frontmatter') {
    return require('../../qwen-adapt-agents').adaptFrontmatter(content).text;
  }
  if (operation.contentTransform === 'antigravity-agent-frontmatter') {
    return adaptAntigravityAgent(content, operation.sourceRelativePath);
  }
  if (operation.contentTransform === 'copilot-agent-frontmatter') {
    return rewriteCopilotWorkflowPaths(adaptCopilotAgent(content, operation.sourceRelativePath), operation.sourceRelativePath);
  }
  if (operation.contentTransform === 'copilot-workflow-paths') {
    return rewriteCopilotWorkflowPaths(content, operation.sourceRelativePath);
  }
  if (operation.contentTransform === 'opencode-disable-ecc-hooks') {
    return transformInstallContent({ ...operation, contentTransform: 'opencode-home-skills-path' },
      disableOpenCodeHookPluginRegistration(content, operation.sourceRelativePath));
  }
  if (operation.contentTransform === 'opencode-disable-plugin-entrypoint') {
    return getDisabledOpenCodePluginContent();
  }
  if (operation.contentTransform === 'opencode-home-skills-path') {
    const config = JSON.parse(content);
    if (!Array.isArray(config?.skills?.paths) || !config.skills.paths.includes('../skills')) {
      return content;
    }
    const installedConfig = {
      ...config,
      skills: {
        ...config.skills,
        paths: config.skills.paths.map(skillPath => skillPath === '../skills' ? './skills' : skillPath),
      },
    };
    return `${JSON.stringify(installedConfig, null, 2)}\n`;
  }
  if (operation.contentTransform === 'grok-plugin-consent') {
    const manifest = JSON.parse(content);
    return formatJson({
      ...manifest,
      hooks: operation.grokHooksEnabled ? 'hooks/hooks.json' : '',
      mcpServers: operation.grokMcpEnabled ? '.mcp.json' : '',
    });
  }
  if (operation.contentTransform === 'grok-hook-boundary') {
    return content.split('var e=process.env.CLAUDE_PLUGIN_ROOT;').join(
      'var e=process.env.GROK_PLUGIN_ROOT||process.env.CLAUDE_PLUGIN_ROOT;'
    );
  }
  if (operation.contentTransform === 'grok-mcp-consent') {
    const config = JSON.parse(content);
    if (!config || typeof config !== 'object' || Array.isArray(config)
      || !config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
      throw new Error(`Invalid Grok MCP config: ${operation.sourceRelativePath}`);
    }
    const allowed = new Set(operation.grokMcpIds || []);
    return formatJson({
      ...config,
      mcpServers: Object.fromEntries(
        Object.entries(config.mcpServers).filter(([id]) => allowed.has(id))
      ),
    });
  }
  throw new Error(`Unknown install content transform: ${operation.contentTransform}`);
}

module.exports = { transformInstallContent };
