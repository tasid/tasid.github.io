#!/usr/bin/env node
/**
 * update-results.mjs
 * --------------------------------------------------------------------------
 * Fetches FIFA World Cup 2026 fixtures from API-Football and rewrites
 * results.json (consumed by index.html).
 *
 * Run locally:   API_FOOTBALL_KEY=xxxx node scripts/update-results.mjs
 * In CI:         the GitHub Action passes the key via env (see workflow).
 *
 * Data source:   https://www.api-football.com  (free tier: 100 req/day)
 *                League id 1 = FIFA World Cup, season 2026.
 * Swap providers by editing fetchFixtures() only — the rest is provider-agnostic.
 * --------------------------------------------------------------------------
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "results.json");

const API_KEY = process.env.API_FOOTBALL_KEY;
if (!API_KEY) { console.error("Missing API_FOOTBALL_KEY env var."); process.exit(1); }

/* Group-stage fixtures keyed by normalized "teamA|teamB" (alphabetical) ->
   [matchNumber, ourHomeCanon, ourAwayCanon]. The home/away canon lets us store
   goals in OUR fixture's order regardless of how the provider labels home/away.
   Knockout matches are not here (teams are decided during the tournament). */
const GROUP = {"mexico|southafrica":[1,"mexico","southafrica"],"czechia|southkorea":[2,"southkorea","czechia"],"bosniaherzegovina|canada":[3,"canada","bosniaherzegovina"],"paraguay|usa":[4,"usa","paraguay"],"qatar|switzerland":[5,"qatar","switzerland"],"brazil|morocco":[6,"brazil","morocco"],"haiti|scotland":[7,"haiti","scotland"],"australia|turkiye":[8,"australia","turkiye"],"curacao|germany":[9,"germany","curacao"],"japan|netherlands":[10,"netherlands","japan"],"ecuador|ivorycoast":[11,"ivorycoast","ecuador"],"sweden|tunisia":[12,"sweden","tunisia"],"capeverde|spain":[13,"spain","capeverde"],"belgium|egypt":[14,"belgium","egypt"],"saudiarabia|uruguay":[15,"saudiarabia","uruguay"],"iran|newzealand":[16,"iran","newzealand"],"france|senegal":[17,"france","senegal"],"iraq|norway":[18,"iraq","norway"],"algeria|argentina":[19,"argentina","algeria"],"austria|jordan":[20,"austria","jordan"],"drcongo|portugal":[21,"portugal","drcongo"],"croatia|england":[22,"england","croatia"],"ghana|panama":[23,"ghana","panama"],"colombia|uzbekistan":[24,"uzbekistan","colombia"],"czechia|southafrica":[25,"czechia","southafrica"],"bosniaherzegovina|switzerland":[26,"switzerland","bosniaherzegovina"],"canada|qatar":[27,"canada","qatar"],"mexico|southkorea":[28,"mexico","southkorea"],"australia|usa":[29,"usa","australia"],"morocco|scotland":[30,"scotland","morocco"],"brazil|haiti":[31,"brazil","haiti"],"paraguay|turkiye":[32,"turkiye","paraguay"],"netherlands|sweden":[33,"netherlands","sweden"],"germany|ivorycoast":[34,"germany","ivorycoast"],"curacao|ecuador":[35,"ecuador","curacao"],"japan|tunisia":[36,"tunisia","japan"],"saudiarabia|spain":[37,"spain","saudiarabia"],"belgium|iran":[38,"belgium","iran"],"capeverde|uruguay":[39,"uruguay","capeverde"],"egypt|newzealand":[40,"newzealand","egypt"],"argentina|austria":[41,"argentina","austria"],"france|iraq":[42,"france","iraq"],"norway|senegal":[43,"norway","senegal"],"algeria|jordan":[44,"jordan","algeria"],"portugal|uzbekistan":[45,"portugal","uzbekistan"],"england|ghana":[46,"england","ghana"],"croatia|panama":[47,"panama","croatia"],"colombia|drcongo":[48,"colombia","drcongo"],"canada|switzerland":[49,"switzerland","canada"],"bosniaherzegovina|qatar":[50,"bosniaherzegovina","qatar"],"brazil|scotland":[51,"scotland","brazil"],"haiti|morocco":[52,"morocco","haiti"],"czechia|mexico":[53,"czechia","mexico"],"southafrica|southkorea":[54,"southafrica","southkorea"],"curacao|ivorycoast":[55,"curacao","ivorycoast"],"ecuador|germany":[56,"ecuador","germany"],"japan|sweden":[57,"japan","sweden"],"netherlands|tunisia":[58,"tunisia","netherlands"],"turkiye|usa":[59,"turkiye","usa"],"australia|paraguay":[60,"paraguay","australia"],"france|norway":[61,"norway","france"],"iraq|senegal":[62,"senegal","iraq"],"capeverde|saudiarabia":[63,"capeverde","saudiarabia"],"spain|uruguay":[64,"uruguay","spain"],"egypt|iran":[65,"egypt","iran"],"belgium|newzealand":[66,"newzealand","belgium"],"england|panama":[67,"panama","england"],"croatia|ghana":[68,"croatia","ghana"],"colombia|portugal":[69,"colombia","portugal"],"drcongo|uzbekistan":[70,"drcongo","uzbekistan"],"algeria|austria":[71,"algeria","austria"],"argentina|jordan":[72,"jordan","argentina"]};

/* Normalize a team name, then map provider spellings to our canonical keys. */
const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const ALIAS = {
  korearepublic:"southkorea", southkorea:"southkorea",
  iriran:"iran", iran:"iran",
  cotedivoire:"ivorycoast", ivorycoast:"ivorycoast",
  unitedstates:"usa", usa:"usa",
  czechrepublic:"czechia", czechia:"czechia",
  caboverde:"capeverde", capeverde:"capeverde",
  congodr:"drcongo", drcongo:"drcongo", democraticrepublicofcongo:"drcongo",
  turkey:"turkiye", turkiye:"turkiye",
  bosniaandherzegovina:"bosniaherzegovina", bosniaherzegovina:"bosniaherzegovina"
};
const canon = name => { const n = norm(name); return ALIAS[n] || n; };

/* Map an API status to ours: FT-ish -> "FT", in-play -> "LIVE", else skip (not started). */
function mapStatus(short) {
  if (["FT","AET","PEN"].includes(short)) return "FT";
  if (["1H","2H","HT","ET","BT","P","LIVE","INT"].includes(short)) return "LIVE";
  return null; // NS, TBD, PST, CANC, etc.
}

async function fetchFixtures() {
  const url = "https://v3.football.api-sports.io/fixtures?league=1&season=2026";
  const res = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
  if (!res.ok) throw new Error("API request failed: HTTP " + res.status);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error("API returned errors: " + JSON.stringify(json.errors));
  }
  return json.response || [];
}

async function main() {
  const fixtures = await fetchFixtures();

  // start from existing file so we never lose a result the API briefly omits
  let prev = { results: {}, teams: {} };
  try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

  const results = { ...(prev.results || {}) };
  let updatedCount = 0;

  for (const fx of fixtures) {
    const short = fx?.fixture?.status?.short;
    const status = mapStatus(short);
    if (!status) continue;                       // skip not-yet-played
    const h = fx?.goals?.home, a = fx?.goals?.away;
    if (h == null || a == null) continue;

    const homeC = canon(fx.teams.home.name), awayC = canon(fx.teams.away.name);
    const key = [homeC, awayC].sort().join("|");
    const entry = GROUP[key];
    if (!entry) continue;                        // knockout or unmatched name -> skip
    const [n, ourHome] = entry;

    // orient goals to OUR fixture's home/away order
    results[n] = (homeC === ourHome) ? { h, a, status } : { h: a, a: h, status };
    updatedCount++;
  }

  const out = {
    updated: new Date().toISOString(),
    results,
    teams: prev.teams || {}                       // preserve any manual knockout team overrides
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${OUT} — ${Object.keys(results).length} results (${updatedCount} from this run).`);
}

main().catch(err => { console.error(err); process.exit(1); });
