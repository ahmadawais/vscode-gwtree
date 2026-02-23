import * as vscode from "vscode";
import type { GitAPI, GitExtension, Repository } from "./git";

const MANAGED_KEYS = [
  "titleBar.activeBackground",
  "titleBar.activeForeground",
  "titleBar.inactiveBackground",
  "titleBar.inactiveForeground",
  "statusBar.background",
  "statusBar.foreground",
] as const;

type ManagedKey = (typeof MANAGED_KEYS)[number];

// --- Color utilities ---

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.179 ? "#000000" : "#ffffff";
}

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  if (max === r) return (((g - b) / d) % 6) * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}

function randomHue(): number {
  return Math.floor(Math.random() * 360);
}

// --- State helpers ---

function stateKey(repoPath: string, branch: string): string {
  return `gwtree:${repoPath}:${branch}`;
}

async function resolveHue(
  ctx: vscode.ExtensionContext,
  repoPath: string,
  branch: string
): Promise<number | null> {
  const cfg = vscode.workspace.getConfiguration("gwtree");

  if (!cfg.get<boolean>("enabled", true)) return null;

  const defaults = cfg.get<string[]>("defaultBranches", ["main", "master"]);
  if (defaults.includes(branch)) return null;

  const colorMap = cfg.get<Record<string, string>>("branchColors", {});
  const userHex = colorMap[branch];
  if (userHex) return hexToHue(userHex);

  const key = stateKey(repoPath, branch);
  const stored = ctx.globalState.get<number>(key);
  if (stored !== undefined) return stored;

  const hue = randomHue();
  await ctx.globalState.update(key, hue);
  return hue;
}

// --- VS Code color customization ---

async function applyColor(hue: number): Promise<void> {
  const activeBg = hslToHex(hue, 60, 40);
  const inactiveBg = hslToHex(hue, 40, 28);
  const activeFg = contrastColor(activeBg);
  const inactiveFg = contrastColor(inactiveBg);

  const cfg = vscode.workspace.getConfiguration("workbench");
  const inspected = cfg.inspect<Record<string, string>>("colorCustomizations");
  const existing = inspected?.globalValue ?? {};

  await cfg.update(
    "colorCustomizations",
    {
      ...existing,
      "titleBar.activeBackground": activeBg,
      "titleBar.activeForeground": activeFg,
      "titleBar.inactiveBackground": inactiveBg,
      "titleBar.inactiveForeground": inactiveFg,
      "statusBar.background": activeBg,
      "statusBar.foreground": activeFg,
    },
    vscode.ConfigurationTarget.Global
  );
}

async function clearColor(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("workbench");
  const inspected = cfg.inspect<Record<string, string>>("colorCustomizations");
  const existing = inspected?.globalValue ?? {};
  const cleaned = Object.fromEntries(
    Object.entries(existing).filter(([k]) => !MANAGED_KEYS.includes(k as ManagedKey))
  );
  const target = Object.keys(cleaned).length > 0 ? cleaned : undefined;
  await cfg.update("colorCustomizations", target, vscode.ConfigurationTarget.Global);
}

// --- Git helpers ---

function resolveRepo(git: GitAPI): Repository | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) return git.repositories[0];

  let best: Repository | undefined;
  for (const repo of git.repositories) {
    const root = repo.rootUri.fsPath;
    if (!uri.fsPath.startsWith(root)) continue;
    if (!best || root.length > best.rootUri.fsPath.length) best = repo;
  }
  return best ?? git.repositories[0];
}

let pendingSeq = 0;
let lastAppliedHue: number | null | undefined;

function scheduleHandleBranch(
  ctx: vscode.ExtensionContext,
  repo: Repository
): void {
  const seq = ++pendingSeq;
  // 80ms debounce — drops intermediate calls from the
  // settings-write → git-change → onDidChange feedback loop.
  const timer = new vscode.Disposable(() => {});
  void new Promise<void>((resolve) => {
    const id = (globalThis as any).setTimeout(() => {
      if (seq === pendingSeq) handleBranch(ctx, repo);
      resolve();
    }, 80);
    timer.dispose = () => (globalThis as any).clearTimeout(id);
  });
}

async function handleBranch(
  ctx: vscode.ExtensionContext,
  repo: Repository
): Promise<void> {
  const branch = repo.state.HEAD?.name;
  if (!branch) {
    if (lastAppliedHue !== null) {
      lastAppliedHue = null;
      await clearColor();
    }
    return;
  }

  const hue = await resolveHue(ctx, repo.rootUri.fsPath, branch);
  if (hue === null) {
    if (lastAppliedHue !== null) {
      lastAppliedHue = null;
      await clearColor();
    }
    return;
  }

  if (lastAppliedHue === hue) return;
  lastAppliedHue = hue;
  await applyColor(hue);
}

// --- Extension lifecycle ---

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExt) return;
  if (!gitExt.isActive) await gitExt.activate();

  const git = gitExt.exports.getAPI(1 as 1);

  function watchRepo(repo: Repository): void {
    handleBranch(ctx, repo);
    const disposable = repo.state.onDidChange(() => scheduleHandleBranch(ctx, repo));
    ctx.subscriptions.push(disposable);
  }

  for (const repo of git.repositories) watchRepo(repo);
  ctx.subscriptions.push(git.onDidOpenRepository(watchRepo));

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      const repo = resolveRepo(git);
      if (repo) scheduleHandleBranch(ctx, repo);
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("gwtree")) return;
      lastAppliedHue = undefined; // force re-apply on config change
      const repo = resolveRepo(git);
      if (repo) scheduleHandleBranch(ctx, repo);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("gwtree.reroll", async () => {
      const repo = resolveRepo(git);
      if (!repo) {
        vscode.window.showWarningMessage("GW Tree: No git repository found.");
        return;
      }
      const branch = repo.state.HEAD?.name;
      if (!branch) return;

      const hue = randomHue();
      await ctx.globalState.update(stateKey(repo.rootUri.fsPath, branch), hue);
      lastAppliedHue = hue;
      await applyColor(hue);
      vscode.window.showInformationMessage(
        `GW Tree: New color for "${branch}" — ${hslToHex(hue, 60, 40)}`
      );
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("gwtree.reset", async () => {
      const repo = resolveRepo(git);
      if (!repo) {
        vscode.window.showWarningMessage("GW Tree: No git repository found.");
        return;
      }
      const branch = repo.state.HEAD?.name;
      if (!branch) return;

      await ctx.globalState.update(stateKey(repo.rootUri.fsPath, branch), undefined);
      lastAppliedHue = null;
      await clearColor();
      vscode.window.showInformationMessage(`GW Tree: Color reset for "${branch}".`);
    })
  );
}

export function deactivate(): void {}
