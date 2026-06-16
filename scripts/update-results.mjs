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

/* Group matches in the source carry no match number, so we match them by team pair ->
   [matchNumber, ourHomeCanon]. (Knockout matches DO carry a `num` field, handled below.) */
const GROUP = {"mexico|southafrica":[1,"mexico"],"czechia|southkorea":[2,"southkorea"],"bosniaherzegovina|canada":[3,"canada"],"paraguay|usa":[4,"usa"],"qatar|switzerland":[5,"qatar"],"brazil|morocco":[6,"brazil"],"haiti|scotland":[7,"haiti"],"australia|turkiye":[8,"australia"],"curacao|germany":[9,"germany"],"japan|netherlands":[10,"netherlands"],"ecuador|ivorycoast":[11,"ivorycoast"],"sweden|tunisia":[12,"sweden"],"capeverde|spain":[13,"spain"],"belgium|egypt":[14,"belgium"],"saudiarabia|uruguay":[15,"saudiarabia"],"iran|newzealand":[16,"iran"],"france|senegal":[17,"france"],"iraq|norway":[18,"iraq"],"algeria|argentina":[19,"argentina"],"austria|jordan":[20,"austria"],"drcongo|portugal":[21,"portugal"],"croatia|england":[22,"england"],"ghana|panama":[23,"ghana"],"colombia|uzbekistan":[24,"uzbekistan"],"czechia|southafrica":[25,"czechia"],"bosniaherzegovina|switzerland":[26,"switzerland"],"canada|qatar":[27,"canada"],"mexico|southkorea":[28,"mexico"],"australia|usa":[29,"usa"],"morocco|scotland":[30,"scotland"],"brazil|haiti":[31,"brazil"],"paraguay|turkiye":[32,"turkiye"],"netherlands|sweden":[33,"netherlands"],"germany|ivorycoast":[34,"germany"],"curacao|ecuador":[35,"ecuador"],"japan|tunisia":[36,"tunisia"],"saudiarabia|spain":[37,"spain"],"belgium|iran":[38,"belgium"],"capeverde|uruguay":[39,"uruguay"],"egypt|newzealand":[40,"newzealand"],"argentina|austria":[41,"argentina"],"france|iraq":[42,"france"],"norway|senegal":[43,"norway"],"algeria|jordan":[44,"jordan"],"portugal|uzbekistan":[45,"portugal"],"england|ghana":[46,"england"],"croatia|panama":[47,"panama"],"colombia|drcongo":[48,"colombia"],"canada|switzerland":[49,"switzerland"],"bosniaherzegovina|qatar":[50,"bosniaherzegovina"],"brazil|scotland":[51,"scotland"],"haiti|morocco":[52,"morocco"],"czechia|mexico":[53,"czechia"],"southafrica|southkorea":[54,"southafrica"],"curacao|ivorycoast":[55,"curacao"],"ecuador|germany":[56,"ecuador"],"japan|sweden":[57,"japan"],"netherlands|tunisia":[58,"tunisia"],"turkiye|usa":[59,"turkiye"],"australia|paraguay":[60,"paraguay"],"france|norway":[61,"norway"],"iraq|senegal":[62,"senegal"],"capeverde|saudiarabia":[63,"capeverde"],"spain|uruguay":[64,"uruguay"],"egypt|iran":[65,"egypt"],"belgium|newzealand":[66,"newzealand"],"england|panama":[67,"panama"],"croatia|ghana":[68,"croatia"],"colombia|portugal":[69,"colombia"],"drcongo|uzbekistan":[70,"drcongo"],"algeria|austria":[71,"algeria"],"argentina|jordan":[72,"jordan"]};

/* canonical normalized name -> OUR display spelling (used to resolve knockout teams
   as they appear, and to normalize source spellings like "Czech Republic" -> "Czechia"). */
const DISPLAY = {"argentina":"Argentina","spain":"Spain","france":"France","england":"England","portugal":"Portugal","brazil":"Brazil","morocco":"Morocco","netherlands":"Netherlands","belgium":"Belgium","germany":"Germany","croatia":"Croatia","colombia":"Colombia","mexico":"Mexico","senegal":"Senegal","uruguay":"Uruguay","usa":"USA","japan":"Japan","switzerland":"Switzerland","iran":"Iran","turkiye":"Türkiye","ecuador":"Ecuador","austria":"Austria","southkorea":"South Korea","australia":"Australia","algeria":"Algeria","egypt":"Egypt","canada":"Canada","norway":"Norway","ivorycoast":"Ivory Coast","panama":"Panama","sweden":"Sweden","czechia":"Czechia","paraguay":"Paraguay","scotland":"Scotland","tunisia":"Tunisia","drcongo":"DR Congo","uzbekistan":"Uzbekistan","qatar":"Qatar","iraq":"Iraq","southafrica":"South Africa","saudiarabia":"Saudi Arabia","jordan":"Jordan","bosniaherzegovina":"Bosnia & Herzegovina","capeverde":"Cape Verde","ghana":"Ghana","curacao":"Curaçao","haiti":"Haiti","newzealand":"New Zealand"};

const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const ALIAS = {
  korearepublic:"southkorea", iriran:"iran", cotedivoire:"ivorycoast", unitedstates:"usa",
  czechrepublic:"czechia", caboverde:"capeverde", congodr:"drcongo", democraticrepublicofcongo:"drcongo",
  turkey:"turkiye", bosniaandherzegovina:"bosniaherzegovina"
};
const canon = name => { const n = norm(name); return ALIAS[n] || n; };
const displayName = name => DISPLAY[canon(name)] || null;   // null => placeholder (e.g. "2A", "W73")

async function fetchMatches() {
  const res = await fetch(SRC, { headers: { "User-Agent": "wc2026-updater" } });
  if (!res.ok) throw new Error("Data request failed: HTTP " + res.status);
  const json = await res.json();
  return json.matches || [];
}

function ftScore(m) {
  const ft = m.score && m.score.ft;
  if (!Array.isArray(ft) || ft.length < 2 || ft[0] == null || ft[1] == null) return null;
  const pens = Array.isArray(m.score.p) && m.score.p.length >= 2 ? [m.score.p[0], m.score.p[1]] : null;
  return { ft, pens };
}

async function main() {
  const matches = await fetchMatches();

  // start from the existing file so a result the source briefly omits is never lost
  let prev = { results: {}, teams: {} };
  try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

  const results = { ...(prev.results || {}) };
  const teams   = { ...(prev.teams   || {}) };
  let scoreCount = 0, teamCount = 0;

  for (const m of matches) {
    const sc = ftScore(m);

    if (m.num) {
      // ---- Knockout match (carries the official match number) ----
      const n = m.num;
      const home = displayName(m.team1), away = displayName(m.team2);   // null while still a slot
      if (home && away) { teams[n] = { h: home, a: away }; teamCount++; }
      if (sc) {
        const rec = { h: sc.ft[0], a: sc.ft[1], status: "FT" };          // source home/away order
        if (sc.pens) rec.p = sc.pens;
        results[n] = rec;
        scoreCount++;
      }
    } else if (sc) {
      // ---- Group match (no number in source): match by team pair ----
      const homeC = canon(m.team1), awayC = canon(m.team2);
      const entry = GROUP[[homeC, awayC].sort().join("|")];
      if (!entry) continue;                                             // unmatched -> skip
      const [n, ourHome] = entry;
      results[n] = (homeC === ourHome)
        ? { h: sc.ft[0], a: sc.ft[1], status: "FT" }
        : { h: sc.ft[1], a: sc.ft[0], status: "FT" };                   // orient to our home/away
      scoreCount++;
    }
  }

  const out = { updated: new Date().toISOString(), results, teams };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${OUT} — ${Object.keys(results).length} results, ${Object.keys(teams).length} resolved knockout teams (this run: ${scoreCount} scores, ${teamCount} teams).`);
}

main().catch(err => { console.error(err); process.exit(1); });
