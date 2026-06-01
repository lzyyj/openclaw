import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { isRich, theme } from "../../terminal/theme.js";
import { escapeRegExp } from "../../utils.js";
import { hasFlag, hasRootVersionAlias } from "../argv.js";
import { formatCliBannerLine, hasEmittedCliBanner } from "../banner.js";
import { replaceCliName, resolveCliName } from "../cli-name.js";
import { getText } from "../i18n.js";
import { CLI_LOG_LEVEL_VALUES, parseCliLogLevelOption } from "../log-level-option.js";
import { getCoreCliCommandsWithSubcommands } from "./command-registry.js";
import type { ProgramContext } from "./context.js";
import { getSubCliCommandsWithSubcommands } from "./register.subclis.js";

const CLI_NAME = resolveCliName();
const CLI_NAME_PATTERN = escapeRegExp(CLI_NAME);
const ROOT_COMMANDS_WITH_SUBCOMMANDS = new Set([
  ...getCoreCliCommandsWithSubcommands(),
  ...getSubCliCommandsWithSubcommands(),
]);
const ROOT_COMMANDS_HINT = getText(
  "help.subcommands_hint",
  "Hint: commands suffixed with * have subcommands. Run <command> --help for details.",
);

type ExampleEntry = [command: string, descriptionKey: string, descriptionFallbackEn: string];

const EXAMPLES: ExampleEntry[] = [
  [
    "openclaw models --help",
    "help.example.show_model_help",
    "Show detailed help for the models command.",
  ],
  [
    "openclaw channels login --verbose",
    "help.example.login_whatsapp",
    "Link personal WhatsApp Web and show QR + connection logs.",
  ],
  [
    'openclaw message send --target +15555550123 --message "Hi" --json',
    "help.example.send_json",
    "Send via your web session and print JSON result.",
  ],
  [
    "openclaw gateway --port 18789",
    "help.example.run_gateway",
    "Run the WebSocket Gateway locally.",
  ],
  [
    "openclaw --dev gateway",
    "help.example.dev_gateway",
    "Run a dev Gateway (isolated state/config) on ws://127.0.0.1:19001.",
  ],
  [
    "openclaw gateway --force",
    "help.example.force_gateway",
    "Kill anything bound to the default gateway port, then start it.",
  ],
  ["openclaw gateway ...", "help.example.gateway_control", "Gateway control via WebSocket."],
  [
    'openclaw agent --to +15555550123 --message "Run summary" --deliver',
    "help.example.agent_deliver",
    "Talk directly to the agent using the Gateway; optionally send the WhatsApp reply.",
  ],
  [
    'openclaw message send --channel telegram --target @mychat --message "Hi"',
    "help.example.send_telegram",
    "Send via your Telegram bot.",
  ],
] as const;

export function configureProgramHelp(program: Command, ctx: ProgramContext) {
  program
    .name(CLI_NAME)
    .description("")
    .version(ctx.programVersion)
    .option(
      "--dev",
      getText(
        "help.dev_profile",
        "Dev profile: isolate state under ~/.openclaw-dev, default gateway port 19001, and shift derived ports (browser/canvas)",
      ),
    )
    .option(
      "--profile <name>",
      getText(
        "help.profile",
        "Use a named profile (isolates OPENCLAW_STATE_DIR/OPENCLAW_CONFIG_PATH under ~/.openclaw-<name>)",
      ),
    )
    .option(
      "--log-level <level>",
      getText(
        "help.log_level",
        `Global log level override for file + console (${CLI_LOG_LEVEL_VALUES})`,
        { levels: CLI_LOG_LEVEL_VALUES },
      ),
      parseCliLogLevelOption,
    );

  program.option("--no-color", getText("help.no_color", "Disable ANSI colors"), false);
  program.helpOption("-h, --help", getText("help.display_help", "Display help for command"));
  program.helpCommand("help [command]", getText("help.display_help", "Display help for command"));

  program.configureHelp({
    // sort options and subcommands alphabetically
    sortSubcommands: true,
    sortOptions: true,
    optionTerm: (option) => theme.option(option.flags),
    subcommandTerm: (cmd) => {
      const isRootCommand = cmd.parent === program;
      const hasSubcommands = isRootCommand && ROOT_COMMANDS_WITH_SUBCOMMANDS.has(cmd.name());
      return theme.command(hasSubcommands ? `${cmd.name()} *` : cmd.name());
    },
  });

  const formatHelpOutput = (str: string) => {
    let output = str;
    const isRootHelp = new RegExp(
      `^Usage:\\s+${CLI_NAME_PATTERN}\\s+\\[options\\]\\s+\\[command\\]\\s*$`,
      "m",
    ).test(output);
    if (isRootHelp && /^Commands:/m.test(output)) {
      output = output.replace(
        /^Commands:/m,
        `${getText("help.commands", "Commands:")}\n  ${theme.muted(ROOT_COMMANDS_HINT)}`,
      );
    }

    return output
      .replace(/^Usage:/gm, theme.heading(getText("help.usage", "Usage:")))
      .replace(/^Options:/gm, theme.heading(getText("help.options", "Options:")))
      .replace(/^Commands:/gm, theme.heading(getText("help.commands", "Commands:")));
  };

  program.configureOutput({
    writeOut: (str) => {
      process.stdout.write(formatHelpOutput(str));
    },
    writeErr: (str) => {
      process.stderr.write(formatHelpOutput(str));
    },
    outputError: (str, write) => write(theme.error(str)),
  });

  if (
    hasFlag(process.argv, "-V") ||
    hasFlag(process.argv, "--version") ||
    hasRootVersionAlias(process.argv)
  ) {
    console.log(ctx.programVersion);
    process.exit(0);
  }

  program.addHelpText("beforeAll", () => {
    if (hasEmittedCliBanner()) {
      return "";
    }
    const rich = isRich();
    const line = formatCliBannerLine(ctx.programVersion, { richTty: rich });
    return `\n${line}\n`;
  });

  const fmtExamples = EXAMPLES.map(([cmd, key, fallback]) => {
    const desc = getText(key, fallback);
    return `  ${theme.command(replaceCliName(cmd, CLI_NAME))}\n    ${theme.muted(desc)}`;
  }).join("\n");

  program.addHelpText("afterAll", ({ command }) => {
    if (command !== program) {
      return "";
    }
    const docs = formatDocsLink("/cli", "docs.openclaw.ai/cli");
    return `\n${theme.heading(getText("help.examples", "Examples:"))}\n${fmtExamples}\n\n${theme.muted(getText("help.docs", "Docs:"))} ${docs}\n`;
  });
}
