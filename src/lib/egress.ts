export const CHAIN_HOST = "peer.annotrain.org";
export const CHAIN_ORIGIN = `https://${CHAIN_HOST}`;

export type EgressKind = "local" | "chain" | "paid" | "matrix" | "bridge" | "vpn" | "unknown";
export type EgressDecision = "auto" | "approve";

export type EgressClass = {
  kind: EgressKind;
  decision: EgressDecision;
  host: string;
  path: string;
  label: string;
};

const PAID_HOSTS = new Set(["api.x.ai"]);

const BRIDGE_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "cdn.discordapp.com",
  "gateway.discord.gg",
  "slack.com",
  "hooks.slack.com",
  "slack-files.com",
]);

function hostMatches(host: string, suffixes: string[]): boolean {
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

export function classifyEgress(url: string, method = "GET"): EgressClass {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      kind: "unknown",
      decision: "approve",
      host: "",
      path: "",
      label: "Invalid URL",
    };
  }
  const host = parsed.hostname;
  const path = parsed.pathname;
  const verb = method.toUpperCase();

  if (host === "127.0.0.1" || host === "localhost") {
    return {
      kind: "local",
      decision: "auto",
      host,
      path,
      label: "Local compute",
    };
  }

  if (host === "matrix.ecca.local") {
    return { kind: "matrix", decision: "auto", host, path, label: "In-process Matrix hub" };
  }

  if (host === "matrix.org" || host.endsWith(".matrix.org") || host.startsWith("matrix.")) {
    return { kind: "matrix", decision: "approve", host, path, label: "Matrix client API" };
  }

  if (BRIDGE_HOSTS.has(host) || hostMatches(host, ["discord.com", "discordapp.com", "slack.com"])) {
    return { kind: "bridge", decision: "approve", host, path, label: "Bridge fan-out" };
  }

  if (host.endsWith(".ts.net") || host.startsWith("100.")) {
    return { kind: "vpn", decision: "approve", host, path, label: "VPN mesh" };
  }

  if (host === CHAIN_HOST) {
    const chainRead =
      path.startsWith("/api/chain") ||
      path.startsWith("/api/tokens") ||
      path.startsWith("/api/ledger") ||
      (path.startsWith("/api/work") && verb === "GET") ||
      (path.startsWith("/api/rpc") && verb === "GET");
    const chainWrite = path.startsWith("/api/rpc") && verb !== "GET";
    if (chainRead) {
      return { kind: "chain", decision: "auto", host, path, label: "Chain read" };
    }
    if (chainWrite) {
      return { kind: "chain", decision: "approve", host, path, label: "Chain RPC write" };
    }
    return { kind: "chain", decision: "approve", host, path, label: "Wiki egress" };
  }

  if (PAID_HOSTS.has(host)) {
    return { kind: "paid", decision: "approve", host, path, label: "Paid model hop" };
  }

  return {
    kind: "unknown",
    decision: "approve",
    host,
    path,
    label: "Unknown egress",
  };
}

export function needsApproval(url: string, method = "GET"): boolean {
  return classifyEgress(url, method).decision === "approve";
}
