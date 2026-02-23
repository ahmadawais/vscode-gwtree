"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var MANAGED_KEYS = [
  "titleBar.activeBackground",
  "titleBar.activeForeground",
  "titleBar.inactiveBackground",
  "titleBar.inactiveForeground",
  "statusBar.background",
  "statusBar.foreground"
];
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function contrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.179 ? "#000000" : "#ffffff";
}
function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  if (max === r) return (g - b) / d % 6 * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}
function randomHue() {
  return Math.floor(Math.random() * 360);
}
function stateKey(repoPath, branch) {
  return `gwtree:${repoPath}:${branch}`;
}
function resolveHue(ctx, repoPath, branch) {
  const cfg = vscode.workspace.getConfiguration("gwtree");
  if (!cfg.get("enabled", true)) return null;
  const defaults = cfg.get("defaultBranches", ["main", "master"]);
  if (defaults.includes(branch)) return null;
  const colorMap = cfg.get("branchColors", {});
  const userHex = colorMap[branch];
  if (userHex) return hexToHue(userHex);
  const key = stateKey(repoPath, branch);
  const stored = ctx.globalState.get(key);
  if (stored !== void 0) return stored;
  const hue = randomHue();
  ctx.globalState.update(key, hue);
  return hue;
}
async function applyColor(hue) {
  const activeBg = hslToHex(hue, 60, 40);
  const inactiveBg = hslToHex(hue, 40, 28);
  const activeFg = contrastColor(activeBg);
  const inactiveFg = contrastColor(inactiveBg);
  const cfg = vscode.workspace.getConfiguration("workbench");
  const existing = cfg.get("colorCustomizations", {});
  await cfg.update(
    "colorCustomizations",
    {
      ...existing,
      "titleBar.activeBackground": activeBg,
      "titleBar.activeForeground": activeFg,
      "titleBar.inactiveBackground": inactiveBg,
      "titleBar.inactiveForeground": inactiveFg,
      "statusBar.background": activeBg,
      "statusBar.foreground": activeFg
    },
    vscode.ConfigurationTarget.Workspace
  );
}
async function clearColor() {
  const cfg = vscode.workspace.getConfiguration("workbench");
  const existing = cfg.get("colorCustomizations", {});
  const cleaned = Object.fromEntries(
    Object.entries(existing).filter(([k]) => !MANAGED_KEYS.includes(k))
  );
  const target = Object.keys(cleaned).length > 0 ? cleaned : void 0;
  await cfg.update("colorCustomizations", target, vscode.ConfigurationTarget.Workspace);
}
function resolveRepo(git) {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) return git.repositories[0];
  let best;
  for (const repo of git.repositories) {
    const root = repo.rootUri.fsPath;
    if (!uri.fsPath.startsWith(root)) continue;
    if (!best || root.length > best.rootUri.fsPath.length) best = repo;
  }
  return best ?? git.repositories[0];
}
async function handleBranch(ctx, repo) {
  const branch = repo.state.HEAD?.name;
  if (!branch) {
    await clearColor();
    return;
  }
  const hue = resolveHue(ctx, repo.rootUri.fsPath, branch);
  if (hue === null) {
    await clearColor();
    return;
  }
  await applyColor(hue);
}
async function activate(ctx) {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) return;
  if (!gitExt.isActive) await gitExt.activate();
  const git = gitExt.exports.getAPI(1);
  function watchRepo(repo) {
    handleBranch(ctx, repo);
    const disposable = repo.state.onDidChange(() => handleBranch(ctx, repo));
    ctx.subscriptions.push(disposable);
  }
  for (const repo of git.repositories) watchRepo(repo);
  ctx.subscriptions.push(git.onDidOpenRepository(watchRepo));
  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      const repo = resolveRepo(git);
      if (repo) handleBranch(ctx, repo);
    })
  );
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("gwtree")) return;
      const repo = resolveRepo(git);
      if (repo) handleBranch(ctx, repo);
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
      await applyColor(hue);
      vscode.window.showInformationMessage(
        `GW Tree: New color for "${branch}" \u2014 ${hslToHex(hue, 60, 40)}`
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
      await ctx.globalState.update(stateKey(repo.rootUri.fsPath, branch), void 0);
      await clearColor();
      vscode.window.showInformationMessage(`GW Tree: Color reset for "${branch}".`);
    })
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
