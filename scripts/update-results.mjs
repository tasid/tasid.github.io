#!/usr/bin/env node
/**
 * update-results.mjs
 * --------------------------------------------------------------------------
 * Fetches FIFA World Cup 2026 results and rewrites results.json (read by index.html).
 *
 * Run locally:   node scripts/update-results.mjs
 * In CI:         the GitHub Action runs this on a schedule (no secrets needed).
 *
 * Data source:   openfootball/worldcup.json  — free, public domain, NO API KEY.
 *                A plain JSON file served from GitHub's CDN; final scores only,
 *                which is all a nightly job needs. Community-curated, so a fresh
 *                result may lag a few hours — fine for a once/twice-daily update.
 * Swap providers by editing fetchMatches() + the loop in main(); the name
 * matching (GROUP / canon) is provider-agnostic.
 * --------------------------------------------------------------------------
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "results.json");

const SRC = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

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

async function fetchMatches() {
  const res = await fetch(SRC, { headers: { "User-Agent": "wc2026-updater" } });
  if (!res.ok) throw new Error("Data request failed: HTTP " + res.status);
  const json = await res.json();
  return json.matches || [];
}

async function main() {
  const matches = await fetchMatches();

  // start from existing file so we never lose a result the source briefly omits
  let prev = { results: {}, teams: {} };
  try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

  const results = { ...(prev.results || {}) };
  let updatedCount = 0;

  for (const m of matches) {
    const ft = m.score && m.score.ft;             // [home, away] once played
    if (!Array.isArray(ft) || ft.length < 2) continue;   // not played yet
    const [h, a] = ft;
    if (h == null || a == null) continue;

    const homeC = canon(m.team1), awayC = canon(m.team2);
    const key = [homeC, awayC].sort().join("|");
    const entry = GROUP[key];
    if (!entry) continue;                          // knockout/placeholder or unmatched -> skip
    const [n, ourHome] = entry;

    // orient goals to OUR fixture's home/away order
    results[n] = (homeC === ourHome) ? { h, a, status: "FT" } : { h: a, a: h, status: "FT" };
    updatedCount++;
  }

  const out = {
    updated: new Date().toISOString(),
    results,
    teams: prev.teams || {}                        // preserve any manual knockout team overrides
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${OUT} — ${Object.keys(results).length} results (${updatedCount} from this run).`);
}

main().catch(err => { console.error(err); process.exit(1); });
