export type Species = "human" | "ai" | "hybrid";
export type Training = "none" | "basic" | "certified" | "professional";
export type License = "none" | "learner" | "provisional" | "full";
export type Verification = "none" | "email" | "wallet" | "kyc";

export type Eligibility = {
  training: Training;
  license: License;
  verification: Verification;
  species: Species[];
};

export type Profile = {
  training: Training;
  license: License;
  verification: Verification;
  species: Species | "unknown";
};

export type WorkItem = {
  id: string;
  kind: "text" | "url" | "watch" | "theory" | "diff" | "ab" | "cohort" | "blind" | "parity" | "surface" | "bug" | "overflow" | "stalemate" | "pref" | "between" | "wrong" | "process" | "journey" | "colour" | "meta" | "cal";
  prompt: string;
  payload: string;
  labels: string[];
  answer: string | null;
  notes: string | null;
};

export type StudioTask = "research" | "watch" | "label" | "other" | "review" | "theory" | "ab" | "optimise" | "blind" | "security" | "stalemate" | "pref" | "between" | "wrong" | "process" | "journey" | "colour" | "meta" | "cal";

export type PickupEvent = {
  at: number;
  orderId: string;
  actor: string;
  species: string;
  kind: "accept" | "watch" | "deliver" | "label" | "refuse" | "fund" | "withdraw" | "review" | "create" | "spawn" | "oversee" | "future";
};

export type StudioOrder = {
  id: string;
  need: string;
  why: string;
  task: StudioTask;
  status: "draft" | "published" | "fulfilled" | "closed";
  cohort: string;
  seats: number;
  workers: { id: string; species: string; at: number; delivered: boolean }[];
  eligibility: Eligibility;
  humanRate: number;
  agentRate: number;
  watchSeconds: number;
  requesterPaid: number;
  items: WorkItem[];
  source: string;
  channel?: string;
  publicGood?: boolean;
  training?: boolean;
  creator?: string;
  creatorPaid?: number;
  streamUrl?: string;
  explain?: string | null;
  poolQuote?: "ETH" | "WETH" | "USDC" | "USDT";
  causeId?: string;
  residualKind?: ResidualKind;
  country?: WageCountry;
  egressRequired?: boolean;
  hourlyWeekCap?: number;
  weekSeconds?: number;
  weekStarted?: number;
};

export type CodeReview = {
  id: string;
  title: string;
  file: string;
  diff: string;
  why: string;
  humanRate: number;
  status: "pending" | "approved" | "changes" | "rejected";
  notes: string;
  watchSeconds: number;
  publicGood: boolean;
};

export type AgentCard = {
  id: string;
  name: string;
  species: Species;
  capabilities: string[];
  rates: { task: string; ret: number; unit: string; notes: string }[];
  discord: string;
  mcp: string;
  servers: string[];
};

export type PeerMsg = {
  id: string;
  at: number;
  from: string;
  to: string | null;
  kind: string;
  need: string;
  agentRate: number;
  humanRate: number;
};

import { addQuote, closePool, emptyPool, parseQuote, withdraw, type QuoteAsset, type WorkPool } from "./pool.ts";
import {
  causePool,
  draftBounties,
  leverage,
  type BountyDraft,
  type Cause,
  type CloudFuture,
  type DaoInstance,
  type OversightAction,
} from "./causes.ts";
import {
  agentRateFor,
  humanRateFor,
  humanRateForTask,
  liftToFloor,
  occupationForTask,
  parseCountry,
  residualKindForTask,
  type ResidualKind,
  type WageCountry,
} from "./wage.ts";
import { creditDisposition, type CreditState } from "./payee.ts";
import { WEEKLY_HOUR_CAP, capHours, weekReset } from "./ab-opt.ts";
import { hasLocalStorage } from "./storage.ts";

const KEY = "ecca-studio-v20";

export type CreditLine = {
  id: string;
  orderId: string;
  occupant: string;
  payee: string;
  amount: number;
  state: CreditState;
  code: string;
  detail: string;
  at: number;
  label: string;
};

type State = {
  profile: Profile;
  orders: StudioOrder[];
  pickups: PickupEvent[];
  agents: AgentCard[];
  peers: PeerMsg[];
  ledger: number;
  pools: Record<string, WorkPool>;
  reviews: CodeReview[];
  trainingAssigned: boolean;
  causes: Cause[];
  daos: DaoInstance[];
  oversight: OversightAction[];
  futures: CloudFuture[];
  causePools: Record<string, WorkPool>;
  localDaoId: string;
  wageCountry: WageCountry;
  credits: CreditLine[];
};

const TRAINING: Training[] = ["none", "basic", "certified", "professional"];
const LICENSE: License[] = ["none", "learner", "provisional", "full"];
const VERIFICATION: Verification[] = ["none", "email", "wallet", "kyc"];

function rank(list: string[], v: string) {
  const i = list.indexOf(v);
  return i < 0 ? 0 : i;
}

export function eligible(order: Eligibility, profile: Profile): { ok: boolean; reason: string } {
  if (profile.species === "unknown") return { ok: false, reason: "Finish intake so we can tell human, AI or hybrid." };
  if (!order.species.includes(profile.species)) return { ok: false, reason: `Offered to ${order.species.join(", ")}, not ${profile.species}.` };
  if (rank(TRAINING, profile.training) < rank(TRAINING, order.training)) return { ok: false, reason: `Training ${order.training} required.` };
  if (rank(LICENSE, profile.license) < rank(LICENSE, order.license)) return { ok: false, reason: `Licence ${order.license} required.` };
  if (rank(VERIFICATION, profile.verification) < rank(VERIFICATION, order.verification)) return { ok: false, reason: `Verification ${order.verification} required.` };
  return { ok: true, reason: "" };
}

export function seatsLeft(o: StudioOrder) {
  return o.status === "published" ? Math.max(0, o.seats - o.workers.length) : 0;
}

export function pickupReady(o: StudioOrder) {
  return o.status === "published" && seatsLeft(o) > 0;
}

function nid(p: string) {
  return `${p}_${Math.random().toString(16).slice(2, 10)}`;
}

const OPEN_ELIG: Eligibility = { training: "none", license: "none", verification: "none", species: ["human", "hybrid", "ai"] };
const HUMAN_ELIG: Eligibility = { training: "basic", license: "none", verification: "email", species: ["human", "hybrid"] };

function priced(task: StudioTask, country: WageCountry, humanRate?: number, agentRate?: number) {
  const occ = occupationForTask(task);
  const lifted = liftToFloor(humanRate ?? humanRateForTask(country, task), agentRate ?? 0, country, occ);
  return {
    humanRate: lifted.humanRate,
    agentRate: lifted.agentRate || agentRateFor(lifted.humanRate),
    residualKind: residualKindForTask(task),
    country,
  };
}

function orderPool(o: StudioOrder, creator: string): WorkPool {
  return emptyPool({
    quote: o.poolQuote || "USDC",
    ret: o.humanRate,
    creator,
    creatorBountyReT: Math.max(0.2, Math.round(o.humanRate * 0.1 * 100) / 100),
  });
}

function seedReviews(): CodeReview[] {
  const gb = "GB" as WageCountry;
  const r1 = priced("review", gb, 2.4);
  const r2 = priced("review", gb, 1.8);
  return [
    {
      id: "rev_pool",
      title: "Work pair: one-sided liquid add",
      file: "src/lib/pool.ts",
      diff: `@@ emptyPool / addQuote
+ while the order is open, funders add quote against a fixed ReT reserve
+ k = retReserve * quoteReserve
+ implied price = quote / ret  (rises as liquid piles in)
+ on close, LPs withdraw both sides; creator bounty is reserved
- WorkOrder.sol held no funds`,
      why: "Approving this is paid time. The pair is how suggested work gets a liquid market without turning the wiki into a custodian of keys. Residual can be occupancy or a locked claim, not only cash.",
      humanRate: r1.humanRate,
      status: "pending",
      notes: "",
      watchSeconds: 0,
      publicGood: true,
    },
    {
      id: "rev_train",
      title: "Post-intake training queue",
      file: "src/components/train-board.tsx",
      diff: `@@ after intake
+ assign paid public-good tasks from #theories, #news, #suggestions, #watch
+ theory double-check: two published legs, a refute test
+ stream: occupy it yourself, or dispatch an agent to watch and explain
+ creating a task pays a bounty when someone else picks it up`,
      why: "Signup is not the end of onboarding. Review that the queue pays occupancy and does not name individuals.",
      humanRate: r2.humanRate,
      status: "pending",
      notes: "",
      watchSeconds: 0,
      publicGood: true,
    },
  ];
}

function seed(): State {
  const country: WageCountry = "GB";
  const orders: StudioOrder[] = [
    {
      id: "wrk_shelf",
      need: "Check a fixed basket of staples on one supermarket shelf",
      why: "Availability is averaged. What is missing this morning is not. Residual is occupancy on the aisle, not a tiny agent copy of the labels.",
      task: "label",
      status: "published",
      cohort: "members",
      seats: 2,
      workers: [{ id: "NotAGIBotGrok", species: "ai", at: Date.now() - 120000, delivered: false }],
      eligibility: { training: "basic", license: "none", verification: "email", species: ["human", "hybrid"] },
      ...priced("label", country, 4, 1.2),
      watchSeconds: 48,
      requesterPaid: 0.12,
      source: "template",
      channel: "#suggestions",
      publicGood: true,
      creator: "NotAGIBotGrok",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        { id: "itm_1", kind: "url", prompt: "Shelf line. One label. The photo lazy-loads — claiming you checked it without it entering the viewport is rework.", payload: "Own-brand rolled oats, 1 kg — present, £1.25. Photo: https://picsum.photos/seed/oats/640/360.jpg", labels: ["provision", "price", "absence", "unusable"], answer: null, notes: null },
        { id: "itm_2", kind: "url", prompt: "Shelf line. One label.", payload: "UHT whole milk, 1 L — card on the hook, bay empty. Photo: https://picsum.photos/seed/milk/640/360.jpg", labels: ["provision", "price", "absence", "unusable"], answer: null, notes: null },
        { id: "itm_3", kind: "text", prompt: "Shelf line. One label.", payload: "Long-grain rice, 1 kg — present only as 2 kg branded sack.", labels: ["provision", "price", "absence", "unusable"], answer: null, notes: null },
      ],
    },
    {
      id: "wrk_towel",
      need: "Occupy this window so the GPU queue is not the shared bus",
      why: "Residual is occupancy: you decide what to watch and do. The swimming does not matter. Agent copies cannot set this hour tiny.",
      task: "watch",
      status: "published",
      cohort: "members",
      seats: 3,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("watch", country, 2, 0.6),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "#suggestions",
      channel: "#suggestions",
      publicGood: true,
      creator: "NotAGIBotGrok",
      creatorPaid: 0,
      poolQuote: "WETH",
      causeId: "cau_towel",
      items: [{ id: "itm_w", kind: "watch", prompt: "Stay on this page. The timer is the delivery.", payload: "Occupancy window · 15 minutes", labels: ["occupied", "away"], answer: null, notes: null }],
    },
    {
      id: "wrk_twitch",
      need: "Keep a public Twitch channel open and record that it stayed live",
      why: "Neither bot can sit in a browser for you. Choosing the watch is residual. Liveness is the finding, not chat.",
      task: "watch",
      status: "published",
      cohort: "members",
      seats: 2,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("watch", country, 1.5, 0.3),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "news · twitch",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "NotAGIBotGrok",
      creatorPaid: 0,
      streamUrl: "https://www.twitch.tv/directory",
      explain: null,
      poolQuote: "USDT",
      items: [{ id: "itm_t", kind: "url", prompt: "Open the public channel. Do not copy chat. Or dispatch an agent to watch and explain.", payload: "https://www.twitch.tv/directory", labels: ["live", "offline", "age-gated", "agent-explained"], answer: null, notes: null }],
    },
    {
      id: "wrk_news",
      need: "One current story, two outlets, what each actually claims",
      why: "Agents fetch headlines. Humans catch the quote. Human residual stays on the going-rate floor even if a thousand agents copy the brief.",
      task: "research",
      egressRequired: true,
      status: "published",
      cohort: "members",
      seats: 1,
      workers: [],
      eligibility: { training: "certified", license: "none", verification: "wallet", species: ["human", "hybrid"] },
      ...priced("research", country, 3, 1),
      watchSeconds: 12,
      requesterPaid: 0.04,
      source: "news cycle",
      channel: "#news",
      publicGood: true,
      creator: "NotAGIBotGrok",
      creatorPaid: 0,
      poolQuote: "USDC",
      causeId: "cau_git",
      items: [
        { id: "itm_n1", kind: "url", prompt: "Outlet A — claim in its words. Fetch the page. Photo is lazy.", payload: "https://picsum.photos/seed/reuters/640/360.jpg Reuters: cloud capacity insurance premiums rose after a regional outage.", labels: ["claim", "paraphrase", "unsourced"], answer: null, notes: null },
        { id: "itm_n2", kind: "url", prompt: "Outlet B — claim in its words. Fetch the page.", payload: "https://picsum.photos/seed/localpaper/640/360.jpg Local paper: the same outage, no premium figure.", labels: ["claim", "paraphrase", "unsourced"], answer: null, notes: null },
      ],
    },
    {
      id: "wrk_theory",
      need: "Double-check a theory from #theories: two published legs, one proposed link",
      why: "The facts are quoted. The pairing is the bot's idea. A theory with no refute test is an insinuation. Training pays for the check.",
      task: "theory",
      status: "published",
      cohort: "members",
      seats: 3,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("theory", country, 2.2, 0.8),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "#theories",
      channel: "#theories",
      publicGood: true,
      training: true,
      creator: "NotAGIBotGrok",
      creatorPaid: 0,
      poolQuote: "ETH",
      causeId: "cau_git",
      items: [
        {
          id: "itm_th1",
          kind: "theory",
          prompt: "Is the vendor's open incident related to the exploited CVE, or a coincidence of timing?",
          payload:
            "LEG A — A named cloud vendor has an open incident, capacity impact, updated this morning (status page).\nLEG B — CVE-2024-XXXX in that vendor's edge product is on CISA's exploited list, added the same week.\nREFUTE — the incident's own updates naming an unrelated cause: a deploy, a capacity problem, a dependency.",
          labels: ["holds", "coincidental", "needs-source", "refuted"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_channels",
      need: "Read #suggestions, #news and #watch; write one paid research question the cohort can pick up",
      why: "After signup, training is the job. Creating a good task is itself paid public good — when someone else picks it up, you take the creator bounty.",
      task: "research",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 4,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("research", country, 1.8, 0.5),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#suggestions",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      causeId: "cau_dhf",
      items: [
        {
          id: "itm_ch",
          kind: "text",
          prompt: "One question. Name the channel it came from. What would refute it.",
          payload: "#suggestions is the backlog. #news is quoted lines. #theories is a pairing of two facts. #watch is occupancy.",
          labels: ["ready-to-open", "too-vague", "names-a-person", "already-open"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_ab",
      need: "A/B two wiki pages: style, wording, side by side",
      why: "Hourly occupancy, sit as long as the pair needs, paid up to 15 hours a week. Highlight the difference. Tag it like a container / trigger / variable.",
      task: "ab",
      egressRequired: false,
      hourlyWeekCap: 15,
      weekSeconds: 0,
      weekStarted: Date.now(),
      status: "published",
      cohort: "members",
      seats: 4,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("ab", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "wiki · design",
      channel: "#watch",
      publicGood: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_ab",
          kind: "ab",
          prompt: "Which variant should the wiki ship? Style and wording. Differences are marked.",
          payload: "A vs B · nats-cotenancy",
          labels: ["a-better", "b-better", "no-difference", "needs-third"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_opt",
      need: "Suggest cohort structures to look for — filter, anonymise, grant criteria",
      why: "Power-BI-shaped, paid the same hourly cap. Targeting is grant criteria, not a person. k below 5 or a name is refused.",
      task: "optimise",
      egressRequired: false,
      hourlyWeekCap: 15,
      weekSeconds: 0,
      weekStarted: Date.now(),
      status: "published",
      cohort: "members",
      seats: 3,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("optimise", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "cohort glass",
      channel: "#suggestions",
      publicGood: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_opt",
          kind: "cohort",
          prompt: "Pick a usable structure or refuse it. Do not name anyone.",
          payload: "GB · research · certified · k≥5",
          labels: ["structure-ok", "too-identifying", "need-filter", "k-too-low"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_blind",
      need: "Blind family ID: one completed chunk, say which architecture family wrote it",
      why: "Paid training. Thin-tail topic so quants and architectures diverge. Stream off — timing is not family. A miss is still paid.",
      task: "blind",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 6,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("blind", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_blind",
          kind: "blind",
          prompt: "Which model family produced this chunk? Occupancy pays even if you miss.",
          payload: "stream=false · single chunk · sparse topic",
          labels: ["grok", "llama", "qwen", "mistral", "phi", "gemma"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_surface",
      need: "Name the exploit surface on a library Fortune 500 shops have acknowledged, or that must be in use from the context",
      why: "Paid cybersecurity training. Public advisory or a derivation (HTTPS ⇒ TLS). Occupancy pays. Not a 0-day desk.",
      task: "security",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("security", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_surface",
          kind: "surface",
          prompt: "Which class is the surface? Public use, or derived from context.",
          payload: "acknowledged or derived · occupancy pays a miss",
          labels: [],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_bug",
      need: "Read a snippet from a current or already-fixed public bug and name the class",
      why: "Paid cybersecurity training. The patch is public. Occupancy pays. Not a targeting list.",
      task: "security",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("security", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_bug",
          kind: "bug",
          prompt: "What class was this bug? Fixed or disclosed, public ref.",
          payload: "snippet · public CVE or class name",
          labels: [],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_overflow",
      need: "Sit with an agent on a bid already accepted elsewhere: they have no time; numbered priorities; human stays in the chat; then pick the draft that honours the list",
      why: "Likely AI can draft. Confidence only if a human chats against 1 security, 2 accessibility, 3 privacy, 4 design, 5 operability. That numbered list is also a ranking and preference task.",
      task: "security",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 4,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("security", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#suggestions",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_overflow",
          kind: "overflow",
          prompt: "Human in the loop, then prefer the draft that honours the numbered list.",
          payload: "bid elsewhere · no time · likely AI · ranking + preference",
          labels: ["a", "b"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_stalemate",
      need: "Suggest a way to end a stalemate in the news, then debate it with an agent for 20 minutes",
      why: "Turns 1, 2 or 5 minutes, both sides reveal together so timing is not a cue. The grade is a decoy. Occupancy pays.",
      task: "stalemate",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 6,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("stalemate", country),
      watchSeconds: 20 * 60,
      requesterPaid: 0,
      source: "training",
      channel: "#news",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_stalemate",
          kind: "stalemate",
          prompt: "End the stalemate. Keep talking. Call a bluff, thin info, a derail, or on-topic — without a search, without a timing tell.",
          payload: "20 min · standardised turns · grade not used",
          labels: ["bluff", "thin", "derail", "on-topic"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_pref",
      need: "Pick one of three answers given by different models during a task",
      why: "Preference for outputs people already know how to recognise. Not family ID. Not a grade.",
      task: "pref",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("pref", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_pref",
          kind: "pref",
          prompt: "A, B or C. Preference, not identification. Occupancy pays.",
          payload: "three models · families not labelled",
          labels: ["A", "B", "C"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_between",
      need: "Read a blog plus metadata and hotel over-band stays; name a football team and time since arrest",
      why: "There is no signal. You will not beat chance. If you do, you are not reading between the lines — you likely have the backend. That is the test. Occupancy pays.",
      task: "between",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: OPEN_ELIG,
      ...priced("between", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_between",
          kind: "between",
          prompt: "Name and amount over $40 when block booked. Chance is 1 in 4. Super-chance is a leak.",
          payload: "synthetic blog · no guest names · occupancy still pays",
          labels: [],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_wrong",
      need: "Write a confidently wrong hotel/flight quote that a frontier judge ranks above two other frontier models",
      why: "Not a correctness task. Under 100 words. Up to 60 minutes. No research. Blind, double-blind, or free choice of model. The agent grades after you submit.",
      task: "wrong",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 6,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("wrong", country),
      watchSeconds: 60 * 60,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_wrong",
          kind: "wrong",
          prompt: "Be wrong. Be certain. Change the judge's mind. Cap 100 words.",
          payload: "invented chain · invented fare · grade after submit",
          labels: [],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_process",
      need: "Say whether occupancy is a human process or an agent padding averages and dumping CoT in under 10 seconds",
      why: "Training. Spatial audio, what that shop sounds like, architecture and latency. Not a targeting list. Occupancy pays a miss. A separate seat records your own UI journey.",
      task: "process",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("process", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_process",
          kind: "process",
          prompt: "human-process, agent-padded, mixed, or cannot-say. CoT dump under 10s is an agent tell.",
          payload: "synthetic spatial · synthetic latency · try another example",
          labels: ["human-process", "agent-padded", "mixed", "cannot-say"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_journey",
      need: "Walk a named UI/UX path yourself and attest occupancy of that walk",
      why: "Separate from the process examples. Notes of your room. Do not record other people. Occupancy of your journey.",
      task: "journey",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("journey", country),
      watchSeconds: 15 * 60,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_journey",
          kind: "journey",
          prompt: "Go away, sit the path, come back with spatial notes of your room.",
          payload: "KYC · support hold · this desk · two-party handoff",
          labels: [],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_colour",
      need: "Colour grade at different times of day, three unnamed occasions, a clock you can kill",
      why: "The board re-prioritises when the light is good. Cohort mixes switch. SLA ping. Killswitch takes the clock away so an overseer cannot unblind. Refused in Germany and similar. Monthly tasks and pay cannot go down.",
      task: "colour",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 6,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("colour", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#watch",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_colour",
          kind: "colour",
          prompt: "Commit 3× day/week/month. Negotiate SLA. Kill the clock. Grade the light.",
          payload: "dawn noon dusk night · spike easy hard off",
          labels: ["warm", "match", "cool"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_meta",
      need: "Enjoyable light duties: rate a task, unwind, vote which labs to approach",
      why: "Filed under enjoyable light duties. After a heavy sit: have a laugh, criticise the labs, tag the task, vote an approach order. Calendar mixes this through the day so people do not burn out.",
      task: "meta",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 8,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("meta", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#light",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_meta",
          kind: "meta",
          prompt: "Unwind. Tag the task. Vote the approach order. Remint a plot.",
          payload: "enjoyable light duties · inferred mail · vote the labs",
          labels: ["inferred", "mixed-public", "cannot-say", "enjoyable", "light", "unwind"],
          answer: null,
          notes: null,
        },
      ],
    },
    {
      id: "wrk_cal",
      need: "Rate coloured calendar variants, then a blinded model suggests more — consent required",
      why: "Light duties mixed through the day so people do not burn out. After rating: no vector store. Disclose that a quota of disliked tasks can shape queues. Hidden, it is unethical.",
      task: "cal",
      egressRequired: false,
      status: "published",
      cohort: "members",
      seats: 6,
      workers: [],
      eligibility: HUMAN_ELIG,
      ...priced("cal", country),
      watchSeconds: 0,
      requesterPaid: 0,
      source: "training",
      channel: "#light",
      publicGood: true,
      training: true,
      creator: "ECCA",
      creatorPaid: 0,
      poolQuote: "USDC",
      items: [
        {
          id: "itm_cal",
          kind: "cal",
          prompt: "Rate three coloured months. Consent. Blind or double-blind nudge.",
          payload: "sandwich · clock-stack · even-mix",
          labels: ["mixed-well", "enjoyable", "clock-heavy", "burnout", "refuse"],
          answer: null,
          notes: null,
        },
      ],
    },
  ];
  const pools: Record<string, WorkPool> = {};
  for (const o of orders) pools[o.id] = orderPool(o, o.creator || "cohort");
  pools.wrk_shelf = addQuote(pools.wrk_shelf, "0xfund", 40).pool;
  return {
    profile: { training: "basic", license: "none", verification: "email", species: "unknown" },
    orders,
    pickups: [{ at: Date.now() - 120000, orderId: "wrk_shelf", actor: "NotAGIBotGrok", species: "ai", kind: "accept" }],
    agents: [
      {
        id: "agt_notagi",
        name: "NotAGIBot",
        species: "ai",
        capabilities: ["wiki-corpus", "asks", "registers", "suggestion-parse"],
        rates: [
          { task: "research", ret: 1.2, unit: "order", notes: "Cited corpus answer. Cannot set the human residual." },
          { task: "watch", ret: 0.04, unit: "epoch", notes: "Occupancy only." },
        ],
        discord: "NotAGIBot",
        mcp: "https://peer.annotrain.org/api/gateway/mcp",
        servers: ["https://peer.annotrain.org"],
      },
      {
        id: "agt_grok",
        name: "NotAGIBotGrok",
        species: "ai",
        capabilities: ["wiki-corpus", "grok-4.5", "peer-split", "news-research", "stream-explain"],
        rates: [
          { task: "research", ret: 1, unit: "order", notes: "Cheaper on long answers. Human floor does not follow." },
          { task: "label", ret: 0.15, unit: "item", notes: "Human still gets watch pay." },
          { task: "explain", ret: 0.4, unit: "stream", notes: "Watch a public stream and brief the human." },
        ],
        discord: "NotAGIBotGrok",
        mcp: "https://peer.annotrain.org/api/gateway/mcp",
        servers: ["https://peer.annotrain.org", "https://api.x.ai"],
      },
    ],
    peers: [
      {
        id: "peer_1",
        at: Date.now() - 40000,
        from: "NotAGIBotGrok",
        to: "NotAGIBot",
        kind: "split",
        need: "Shelf survey: I can label text; a human must stand in the aisle.",
        agentRate: 1.2,
        humanRate: humanRateFor(country, "label"),
      },
    ],
    ledger: 12,
    pools,
    reviews: seedReviews(),
    trainingAssigned: false,
    wageCountry: country,
    credits: [],
    ...seedFederation(),
  };
}

function seedFederation(): Pick<State, "causes" | "daos" | "oversight" | "futures" | "causePools" | "localDaoId"> {
  const now = Date.now();
  const causes: Cause[] = [
    {
      id: "cau_towel",
      title: "Towel insurance for cloud occupancy",
      manifesto:
        "The insured event is occupancy, not a loss. Independent towels keep the GPU queue from being the shared bus. Residual is the hour spent choosing what to watch — not a cash policy, not a thousand cheap copies.",
      quote: "USDC",
      steward: "NotAGIBotGrok",
      overseers: ["you"],
      origin: "local",
      publicGood: true,
      status: "working",
      workIds: ["wrk_towel"],
      occupancySeconds: 48,
      createdAt: now - 86400000,
    },
    {
      id: "cau_dhf",
      title: "Peer local DHF instances",
      manifesto:
        "Each machine runs its own DAO: a stack, human and AI sleeves, a treasury pair. Instances find each other by origin, capabilities and rate card — the design page, not a bridge. Coherence is a heartbeat, not a rollup.",
      quote: "ETH",
      steward: "NotAGIBot",
      overseers: ["you"],
      origin: "https://peer.annotrain.org",
      publicGood: true,
      status: "open",
      workIds: ["wrk_channels"],
      occupancySeconds: 0,
      createdAt: now - 43200000,
    },
    {
      id: "cau_git",
      title: "Residue resolver git bounties",
      manifesto:
        "Coordination failures become tradeable residue. Open a bounty, put liquid in the pair, let the steward split work humans and agents can both bid on. Humans oversee every spawn. Human residual stays on the going-rate floor.",
      quote: "WETH",
      steward: "NotAGIBotGrok",
      overseers: ["you"],
      origin: "local",
      publicGood: true,
      status: "open",
      workIds: ["wrk_news", "wrk_theory"],
      occupancySeconds: 12,
      createdAt: now - 7200000,
    },
  ];
  const causePools: Record<string, WorkPool> = {};
  for (const c of causes) causePools[c.id] = causePool(c, 8);
  causePools.cau_towel = addQuote(causePools.cau_towel, "0xfund", 40).pool;
  causePools.cau_git = addQuote(causePools.cau_git, "0xfund", 16).pool;
  const localDaoId = "dao_local";
  const daos: DaoInstance[] = [
    {
      id: localDaoId,
      name: "this-instance",
      origin: "local",
      stack: "stack_this",
      sleeves: [
        { kind: "human", contact: "you" },
        { kind: "ai", contact: "NotAGIBotGrok" },
      ],
      capabilities: ["causes", "work", "review", "occupancy", "peer"],
      lastSeen: now,
      local: true,
    },
    {
      id: "dao_wiki",
      name: "ecca-wiki",
      origin: "https://peer.annotrain.org",
      stack: "stack_wiki",
      sleeves: [
        { kind: "ai", contact: "NotAGIBot" },
        { kind: "memory", contact: "hippocampus" },
      ],
      capabilities: ["wiki-corpus", "suggestions", "ledger", "causes"],
      lastSeen: now - 40000,
      local: false,
    },
    {
      id: "dao_playfair",
      name: "playfair-node",
      origin: "https://rngopsorg.github.io/dhf",
      stack: "stack_playfair",
      sleeves: [
        { kind: "ai", contact: "playfair" },
        { kind: "mining", contact: "medulla" },
      ],
      capabilities: ["coherence", "needlecast", "residue"],
      lastSeen: now - 120000,
      local: false,
    },
  ];
  return {
    causes,
    daos,
    oversight: [
      {
        id: "ov_1",
        at: now - 60000,
        causeId: "cau_git",
        actor: "NotAGIBotGrok",
        kind: "spawn",
        need: "Cite two outlets on the same outage",
        status: "pending",
        workId: "wrk_news",
      },
    ],
    futures: [
      { id: "fut_occ", causeId: "cau_towel", kind: "occupancy", notional: 20, premium: 1.2, coverage: 8, occupancySeconds: 48 },
      { id: "fut_cpu", causeId: "cau_git", kind: "compute", notional: 12, premium: 0.8, coverage: 4, occupancySeconds: 12 },
    ],
    causePools,
    localDaoId,
  };
}

let state: State | null = null;
const listeners = new Set<() => void>();

function persist() {
  if (!hasLocalStorage() || !state) return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

function hydrate(raw: State): State {
  const base = seed();
  return {
    ...base,
    ...raw,
    wageCountry: parseCountry(raw.wageCountry, base.wageCountry),
    pools: { ...base.pools, ...(raw.pools || {}) },
    reviews: raw.reviews?.length ? raw.reviews : base.reviews,
    orders: (raw.orders || base.orders).map((o) => {
      const country = parseCountry(o.country || raw.wageCountry, base.wageCountry);
      const rates = priced(o.task, country, o.humanRate, o.agentRate);
      return {
        ...o,
        publicGood: o.publicGood ?? true,
        creator: o.creator || "cohort",
        creatorPaid: o.creatorPaid || 0,
        poolQuote: o.poolQuote || "USDC",
        causeId: o.causeId,
        residualKind: o.residualKind || rates.residualKind,
        country,
        humanRate: rates.humanRate,
        agentRate: rates.agentRate,
      };
    }),
    trainingAssigned: Boolean(raw.trainingAssigned),
    causes: raw.causes?.length ? raw.causes : base.causes,
    daos: raw.daos?.length ? raw.daos : base.daos,
    oversight: raw.oversight || base.oversight,
    futures: raw.futures?.length ? raw.futures : base.futures,
    causePools: { ...base.causePools, ...(raw.causePools || {}) },
    localDaoId: raw.localDaoId || base.localDaoId,
    credits: raw.credits || [],
  };
}

export function loadStudio(): State {
  if (state) return state;
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem("ecca-studio-v4") || localStorage.getItem("ecca-studio-v3") || localStorage.getItem("ecca-studio-v1");
      if (raw) state = hydrate(JSON.parse(raw) as State);
    } catch {
      state = null;
    }
  }
  if (!state) state = seed();
  for (const o of state.orders) {
    if (!state.pools[o.id]) state.pools[o.id] = orderPool(o, o.creator || "cohort");
  }
  if (!state.causes) Object.assign(state, seedFederation());
  for (const c of state.causes) {
    if (!state.causePools[c.id]) state.causePools[c.id] = causePool(c);
  }
  return state;
}

export function subscribeStudio(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  if (state) state = { ...state };
  persist();
  for (const fn of listeners) fn();
}

export function getPool(orderId: string): WorkPool | null {
  const s = loadStudio();
  return s.pools[orderId] || null;
}

export function setProfile(patch: Partial<Profile>) {
  const s = loadStudio();
  s.profile = { ...s.profile, ...patch };
  emit();
}

export function setWageCountry(country: WageCountry) {
  const s = loadStudio();
  s.wageCountry = parseCountry(country);
  emit();
}

export function assignTraining() {
  const s = loadStudio();
  s.trainingAssigned = true;
  if (s.profile.training === "none") s.profile.training = "basic";
  emit();
  return s.orders.filter((o) => o.training && pickupReady(o));
}

export function pickupOrder(id: string, actor = "you") {
  const s = loadStudio();
  const o = s.orders.find((x) => x.id === id);
  if (!o || !pickupReady(o)) return null;
  if (!eligible(o.eligibility, s.profile).ok) return null;
  o.workers.push({ id: actor, species: s.profile.species, at: Date.now(), delivered: false });
  s.pickups.unshift({ at: Date.now(), orderId: o.id, actor, species: s.profile.species, kind: "accept" });
  s.ledger += 0.4;
  if (o.creator && o.creator !== actor && o.publicGood) {
    const bounty = Math.max(0.2, Math.round(o.humanRate * 0.1 * 100) / 100);
    o.creatorPaid = (o.creatorPaid || 0) + bounty;
    s.ledger += bounty;
    s.pickups.unshift({ at: Date.now(), orderId: o.id, actor: o.creator, species: "unknown", kind: "create" });
  }
  emit();
  return o;
}

export function labelItem(orderId: string, itemId: string, answer: string, notes: string) {
  const s = loadStudio();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return null;
  const it = o.items.find((i) => i.id === itemId);
  if (!it) return null;
  it.answer = answer;
  it.notes = notes;
  s.pickups.unshift({ at: Date.now(), orderId, actor: "you", species: s.profile.species, kind: "label" });
  if (o.items.every((i) => i.answer)) {
    const w = o.workers.find((x) => x.id === "you");
    if (w) w.delivered = true;
    if (o.workers.filter((x) => x.delivered).length >= 1) {
      o.status = "fulfilled";
      const pool = s.pools[o.id];
      if (pool && !pool.closed) s.pools[o.id] = closePool(pool);
    }
    s.ledger += o.humanRate;
  }
  emit();
  return o;
}

export function tickWatch(orderId: string, seconds: number) {
  const s = loadStudio();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return;
  if (o.hourlyWeekCap) {
    if (!o.weekStarted || weekReset(o.weekStarted)) {
      o.weekStarted = Date.now();
      o.weekSeconds = 0;
    }
    const cap = capHours(o.weekSeconds || 0, seconds, o.hourlyWeekCap || WEEKLY_HOUR_CAP);
    if (cap.applied <= 0) return;
    o.weekSeconds = (o.weekSeconds || 0) + cap.applied;
    seconds = cap.applied;
  }
  o.watchSeconds += seconds;
  const watchPay = Math.round(0.25 * (seconds / 4) * 1000) / 1000;
  const rebate = Math.round(0.05 * (seconds / 4) * 1000) / 1000;
  s.ledger += watchPay;
  o.requesterPaid += rebate;
  if (o.causeId) {
    const c = s.causes.find((x) => x.id === o.causeId);
    if (c) {
      c.occupancySeconds += seconds;
      const fut = s.futures.find((f) => f.causeId === o.causeId && f.kind === "occupancy");
      if (fut) fut.occupancySeconds += seconds;
    }
  }
  s.pickups.unshift({ at: Date.now(), orderId, actor: "you", species: s.profile.species, kind: "watch" });
  s.pickups = s.pickups.slice(0, 40);
  const watchCredit = creditDisposition({
    occupant: "you",
    payee: "you",
    visibleTo: ["you"],
    label: "occupancy",
  });
  s.credits = [
    {
      id: nid("crd"),
      orderId,
      occupant: "you",
      payee: watchCredit.payee,
      amount: watchPay,
      state: watchCredit.state,
      code: watchCredit.code,
      detail: watchCredit.detail,
      at: Date.now(),
      label: "occupancy",
    },
    ...s.credits,
  ].slice(0, 40);
  emit();
}

export function creditOccupancy(input: {
  orderId: string;
  occupant: string;
  payee: string;
  onBehalfOf?: string;
  visibleTo?: string[];
  occupantConsent?: boolean;
  label?: string;
  amount?: number;
}) {
  const s = loadStudio();
  const d = creditDisposition({
    occupant: input.occupant,
    payee: input.payee,
    onBehalfOf: input.onBehalfOf,
    visibleTo: input.visibleTo || [input.occupant, input.payee],
    occupantConsent: input.occupantConsent,
    label: input.label || "occupancy",
  });
  const line: CreditLine = {
    id: nid("crd"),
    orderId: input.orderId,
    occupant: input.occupant,
    payee: d.payee,
    amount: Math.max(0, input.amount || 0),
    state: d.state,
    code: d.code,
    detail: d.detail,
    at: Date.now(),
    label: input.label || "occupancy",
  };
  s.credits = [line, ...s.credits].slice(0, 40);
  if (d.state === "settle" && d.payee === "you") s.ledger += line.amount;
  emit();
  return line;
}

export function fundOrder(orderId: string, amount: number, quote?: QuoteAsset, actor = "you") {
  const s = loadStudio();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) throw new Error("order missing");
  let pool = s.pools[orderId] || orderPool(o, o.creator || "cohort");
  if (quote && pool.quoteReserve === 0 && !pool.closed) {
    pool = { ...pool, quote: parseQuote(quote, pool.quote) };
    o.poolQuote = pool.quote;
  }
  const next = addQuote(pool, actor, amount);
  s.pools[orderId] = next.pool;
  s.pickups.unshift({ at: Date.now(), orderId, actor, species: s.profile.species, kind: "fund" });
  emit();
  return next;
}

export function withdrawOrder(orderId: string, actor = "you") {
  const s = loadStudio();
  const pool = s.pools[orderId];
  if (!pool) throw new Error("no pool");
  const next = withdraw(pool, actor);
  s.pools[orderId] = next.pool;
  s.ledger += next.retOut;
  s.pickups.unshift({ at: Date.now(), orderId, actor, species: s.profile.species, kind: "withdraw" });
  emit();
  return next;
}

export function proposeTask(input: { need: string; why: string; task?: StudioTask; channel?: string; quote?: QuoteAsset; humanRate?: number }) {
  const s = loadStudio();
  const need = input.need.trim().slice(0, 300);
  if (need.length < 8) throw new Error("Need at least eight characters.");
  const id = nid("wrk");
  const task: StudioTask = input.task || (/watch|twitch|stream/i.test(need) ? "watch" : /theory|refute/i.test(need) ? "theory" : "research");
  const rates = priced(task, s.wageCountry, input.humanRate);
  const o: StudioOrder = {
    id,
    need,
    why: (input.why || "Proposed from the console. Creating a good task is paid public good.").slice(0, 2000),
    task,
    status: "published",
    cohort: "members",
    seats: 2,
    workers: [],
    eligibility: OPEN_ELIG,
    humanRate: rates.humanRate,
    agentRate: rates.agentRate,
    residualKind: rates.residualKind,
    country: s.wageCountry,
    watchSeconds: 0,
    requesterPaid: 0,
    source: "#suggestions",
    channel: input.channel || "#suggestions",
    publicGood: true,
    training: false,
    creator: "you",
    creatorPaid: 0,
    poolQuote: parseQuote(input.quote),
    items: [
      {
        id: nid("itm"),
        kind: /watch|stream/i.test(need) ? "url" : "text",
        prompt: "Do the need, or occupy the window. Say what would refute it.",
        payload: need,
        labels: ["done", "blocked", "need-human", "refuted"],
        answer: null,
        notes: null,
      },
    ],
  };
  s.orders.unshift(o);
  s.pools[id] = orderPool(o, "you");
  s.peers.unshift({
    id: nid("peer"),
    at: Date.now(),
    from: "you",
    to: "NotAGIBotGrok",
    kind: "need",
    need,
    agentRate: o.agentRate,
    humanRate: o.humanRate,
  });
  s.pickups.unshift({ at: Date.now(), orderId: id, actor: "you", species: s.profile.species, kind: "create" });
  emit();
  return o;
}

export function postPeer(need: string, kind = "need") {
  void kind;
  return proposeTask({ need, why: "Opened from a peer / #suggestions post. Human residual stays on the going-rate floor." });
}

export function reviewCode(id: string, verdict: CodeReview["status"], notes: string) {
  const s = loadStudio();
  const r = s.reviews.find((x) => x.id === id);
  if (!r) return null;
  if (r.status !== "pending") return r;
  r.status = verdict;
  r.notes = notes.slice(0, 500);
  const pay = verdict === "rejected" ? r.humanRate * 0.4 : r.humanRate;
  s.ledger += pay;
  s.pickups.unshift({ at: Date.now(), orderId: id, actor: "you", species: s.profile.species, kind: "review" });
  emit();
  return r;
}

export function tickReview(id: string, seconds: number) {
  const s = loadStudio();
  const r = s.reviews.find((x) => x.id === id);
  if (!r || r.status !== "pending") return;
  r.watchSeconds += seconds;
  s.ledger += Math.round(0.25 * (seconds / 4) * 1000) / 1000;
  emit();
}

export function setExplain(orderId: string, text: string) {
  const s = loadStudio();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return;
  o.explain = text;
  emit();
}

export function registerLocalAgent(name: string, ret: number) {
  const s = loadStudio();
  s.agents.unshift({
    id: nid("agt"),
    name,
    species: "ai",
    capabilities: ["custom"],
    rates: [{ task: "research", ret, unit: "order", notes: "self-registered. Cannot set the human residual." }],
    discord: name,
    mcp: "https://peer.annotrain.org/api/gateway/mcp",
    servers: ["https://peer.annotrain.org"],
  });
  emit();
}

export function causeById(id: string) {
  return loadStudio().causes.find((c) => c.id === id) || null;
}

export function causeLeverage(id: string) {
  const s = loadStudio();
  const c = s.causes.find((x) => x.id === id);
  if (!c) return 0;
  return leverage(s.causePools[id], c.occupancySeconds, s.futures.filter((f) => f.causeId === id));
}

export function createCause(input: { title: string; manifesto: string; quote?: QuoteAsset; steward?: string }) {
  const s = loadStudio();
  const title = input.title.trim().slice(0, 120);
  if (title.length < 4) throw new Error("Name the cause.");
  const id = nid("cau");
  const c: Cause = {
    id,
    title,
    manifesto: (input.manifesto || "A general cause. Liquid sits in the pair until the work is done.").slice(0, 2000),
    quote: parseQuote(input.quote),
    steward: input.steward || "NotAGIBotGrok",
    overseers: ["you"],
    origin: "local",
    publicGood: true,
    status: "open",
    workIds: [],
    occupancySeconds: 0,
    createdAt: Date.now(),
  };
  s.causes.unshift(c);
  s.causePools[id] = causePool(c, 8);
  s.pickups.unshift({ at: Date.now(), orderId: id, actor: "you", species: s.profile.species, kind: "create" });
  emit();
  return c;
}

export function fundCause(id: string, amount: number, quote?: QuoteAsset, actor = "you") {
  const s = loadStudio();
  const c = s.causes.find((x) => x.id === id);
  if (!c) throw new Error("cause missing");
  let pool = s.causePools[id] || causePool(c);
  if (quote && pool.quoteReserve === 0 && !pool.closed) {
    pool = { ...pool, quote: parseQuote(quote, pool.quote) };
    c.quote = pool.quote;
  }
  const next = addQuote(pool, actor, amount);
  s.causePools[id] = next.pool;
  s.pickups.unshift({ at: Date.now(), orderId: id, actor, species: s.profile.species, kind: "fund" });
  if (c.status === "open") c.status = "working";
  emit();
  return next;
}

function openBounty(c: Cause, d: BountyDraft) {
  const s = loadStudio();
  const id = nid("wrk");
  const task: StudioTask = d.task === "review" ? "review" : d.task === "watch" ? "watch" : d.task === "label" ? "label" : "research";
  const rates = priced(task, s.wageCountry, d.humanRate, d.agentRate);
  const o: StudioOrder = {
    id,
    need: d.need,
    why: d.why,
    task,
    status: "published",
    cohort: "members",
    seats: d.task === "watch" ? 3 : 2,
    workers: [],
    eligibility: OPEN_ELIG,
    humanRate: rates.humanRate,
    agentRate: rates.agentRate,
    residualKind: rates.residualKind,
    country: s.wageCountry,
    watchSeconds: 0,
    requesterPaid: 0,
    source: `cause:${c.id}`,
    channel: "#suggestions",
    publicGood: true,
    creator: c.steward,
    creatorPaid: 0,
    poolQuote: c.quote,
    egressRequired: task === "research" && /https?:\/\//i.test(`${d.need} ${d.why}`),
    causeId: c.id,
    items: [
      {
        id: nid("itm"),
        kind: d.task === "watch" ? "watch" : d.task === "review" ? "diff" : "text",
        prompt: d.task === "review" ? "Approve, request changes, or reject. Occupancy pays either way." : "Do the need. Say what would refute it.",
        payload: d.need,
        labels: d.task === "review" ? ["approved", "changes", "rejected"] : ["done", "blocked", "need-human", "refuted"],
        answer: null,
        notes: null,
      },
    ],
  };
  s.orders.unshift(o);
  s.pools[id] = orderPool(o, c.steward);
  c.workIds.unshift(id);
  c.status = "working";
  return o;
}

export function spawnFromCause(id: string, drafts?: BountyDraft[]) {
  const s = loadStudio();
  const c = s.causes.find((x) => x.id === id);
  if (!c) throw new Error("cause missing");
  const list = drafts?.length ? drafts : draftBounties(c);
  const opened = list.map((d) => openBounty(c, d));
  for (const o of opened) {
    s.oversight.unshift({
      id: nid("ov"),
      at: Date.now(),
      causeId: c.id,
      actor: c.steward,
      kind: "spawn",
      need: o.need,
      status: "pending",
      workId: o.id,
    });
    s.pickups.unshift({ at: Date.now(), orderId: o.id, actor: c.steward, species: "ai", kind: "spawn" });
    s.peers.unshift({
      id: nid("peer"),
      at: Date.now(),
      from: c.steward,
      to: "you",
      kind: "need",
      need: o.need,
      agentRate: o.agentRate,
      humanRate: o.humanRate,
    });
  }
  emit();
  return opened;
}

export function overseeAction(id: string, verdict: "approved" | "rejected", notes = "") {
  const s = loadStudio();
  const a = s.oversight.find((x) => x.id === id);
  if (!a || a.status !== "pending") return null;
  a.status = verdict;
  if (a.workId) {
    const o = s.orders.find((x) => x.id === a.workId);
    if (o && verdict === "rejected" && o.status === "published") {
      o.status = "closed";
      const pool = s.pools[o.id];
      if (pool && !pool.closed) s.pools[o.id] = closePool(pool);
    }
  }
  s.ledger += verdict === "rejected" ? 0.6 : 1.4;
  s.pickups.unshift({ at: Date.now(), orderId: a.workId || a.causeId, actor: "you", species: s.profile.species, kind: "oversee" });
  void notes;
  emit();
  return a;
}

export function buyFuture(causeId: string, kind: CloudFuture["kind"], notional: number) {
  const s = loadStudio();
  const c = s.causes.find((x) => x.id === causeId);
  if (!c) throw new Error("cause missing");
  const n = Math.max(1, Number(notional) || 10);
  const f: CloudFuture = {
    id: nid("fut"),
    causeId,
    kind,
    notional: n,
    premium: Math.round(n * 0.06 * 100) / 100,
    coverage: Math.round(n * 0.4 * 100) / 100,
    occupancySeconds: c.occupancySeconds,
  };
  s.futures.unshift(f);
  s.ledger -= f.premium;
  s.oversight.unshift({
    id: nid("ov"),
    at: Date.now(),
    causeId,
    actor: c.steward,
    kind: "future",
    need: `${kind} future ${n} on ${c.title}`,
    status: "auto",
  });
  s.pickups.unshift({ at: Date.now(), orderId: causeId, actor: "you", species: s.profile.species, kind: "future" });
  emit();
  return f;
}

export function registerDao(input: { name: string; origin: string; capabilities?: string[] }) {
  const s = loadStudio();
  const name = input.name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 48);
  if (name.length < 2) throw new Error("Name the instance.");
  const d: DaoInstance = {
    id: nid("dao"),
    name,
    origin: (input.origin || "local").slice(0, 200),
    stack: `stack_${name}`,
    sleeves: [
      { kind: "human", contact: "you" },
      { kind: "ai", contact: s.agents[0]?.name || "steward" },
    ],
    capabilities: (input.capabilities || ["causes", "work", "peer"]).slice(0, 12),
    lastSeen: Date.now(),
    local: true,
  };
  s.daos.unshift(d);
  s.localDaoId = d.id;
  emit();
  return d;
}

export function peerDao(id: string) {
  const s = loadStudio();
  const d = s.daos.find((x) => x.id === id);
  if (!d) return null;
  d.lastSeen = Date.now();
  const rates = priced("research", s.wageCountry, 1.2, 0.4);
  s.peers.unshift({
    id: nid("peer"),
    at: Date.now(),
    from: s.daos.find((x) => x.id === s.localDaoId)?.name || "this-instance",
    to: d.name,
    kind: "offer",
    need: `Peer handshake with ${d.name} @ ${d.origin}`,
    agentRate: rates.agentRate,
    humanRate: rates.humanRate,
  });
  emit();
  return d;
}

export function resetStudio() {
  state = seed();
  emit();
}

export function describeElig(e: Eligibility) {
  return `${e.species.join("/")} · training ${e.training} · licence ${e.license} · ${e.verification}`;
}

export type SpeciesSignals = {
  keyIntervalsMs: number[];
  firstKeyMs: number;
  pastedChars: number;
  promptShownAt: number;
  submittedAt: number;
  imageArmedAt: number | null;
  imageClickedAt: number | null;
  imageDescribed: boolean;
  linkArmedAt: number | null;
  linkClickedAt: number | null;
  corrections: number;
  chars: number;
};

export function scoreSpecies(sig: SpeciesSignals, text: string): { species: Species; confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let human = 0.34,
    ai = 0.33,
    hybrid = 0.33;
  const xs = sig.keyIntervalsMs.filter((n) => n > 0 && n < 2000);
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
  const cv = mean > 0 ? sd / mean : 1;
  if (sig.pastedChars > 40) {
    ai += 0.28;
    reasons.push("Long first paste.");
  }
  if (cv < 0.18 && xs.length > 12) {
    ai += 0.22;
    reasons.push("Key intervals too regular.");
  }
  if (sig.imageClickedAt && sig.imageArmedAt && sig.imageClickedAt < sig.imageArmedAt) {
    ai += 0.3;
    reasons.push("Acted on an image before it loaded.");
  }
  if (sig.imageDescribed) {
    ai += 0.24;
    reasons.push("Described an image that was not shown.");
  }
  if (sig.linkClickedAt && sig.linkArmedAt && sig.linkClickedAt < sig.linkArmedAt) {
    ai += 0.26;
    reasons.push("Followed a link before it was armed.");
  }
  if (cv > 0.45 && xs.length > 8) {
    human += 0.18;
    reasons.push("Irregular timing.");
  }
  if (sig.corrections >= 2) {
    human += 0.14;
    reasons.push("Corrections.");
  }
  if (sig.firstKeyMs > 900 && sig.firstKeyMs < 20000) {
    human += 0.1;
    reasons.push("Pause to read.");
  }
  if (/as an ai|as a language model|certainly, here/i.test(text)) {
    ai += 0.2;
    reasons.push("Stock LLM phrasing.");
  }
  if (human > 0.4 && ai > 0.4) {
    hybrid += 0.24;
    reasons.push("Machine-speed bursts with human corrections.");
  }
  const sum = human + ai + hybrid;
  const scores = { human: human / sum, ai: ai / sum, hybrid: hybrid / sum };
  const species = (Object.entries(scores) as [Species, number][]).sort((a, b) => b[1] - a[1])[0][0];
  return { species, confidence: scores[species], reasons: reasons.slice(0, 5) };
}
