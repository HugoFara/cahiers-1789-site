// Atlas des collectes 1789 — carte D3.
// Données : donnees.json (construire.py) ; fond : ref/royaume_1789.geojson et ref/bailliages_1789.geojson
// (atlas des bailliages de Brette 1904, vectorisé par Gay, Gobbi et Goñi 2024, CC BY 4.0).
// Tout est servi depuis ce dossier ; aucune requête vers un tiers.

const STATUT_CLASSE = { "collecté": "collecte", "en cours": "en-cours", "dénombré": "denombre", "annoncé": "annonce" };
const TEXTE_LIBELLE = { transcription: "transcription (PDF texte)", "édition": "transcription imprimée (images)", ocr: "texte OCR sur le portail", htr: "texte HTR", aucun: "" };

const svg = d3.select("#carte");
const scene = document.getElementById("scene");
const bulle = document.getElementById("bulle");
const detail = document.getElementById("detail");
const legende = document.getElementById("legende");
const tbody = document.querySelector("#tableau tbody");
const recherche = document.getElementById("recherche");
const datalist = document.getElementById("lieux-liste");

const etat = { sources: new Set(), actif: null, k: 1, teinte: "cahiers" };  // teinte : cahiers | couverture | hyslop | editions
let donnees, projection, chemin, g, gPoints, gChefs, gEtiquettes, zoom, circonscriptions, cahiersParBailliage;
const nombre = n => n.toLocaleString("fr-FR");
const pourcent = (a, b) => { if (!b) return "—"; const x = 100 * a / b; return `${x.toLocaleString("fr-FR", x < 10 ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 })} %`; };
let lieuxParBailliage;  // bailliage_id → lieux (toutes sources), pour la couverture
let editions;  // id → édition imprimée numérisée (data/editions), pour la teinte « éditions » et le détail

// no-cache : revalider auprès du serveur local, les fichiers sont reconstruits souvent
const charger = u => fetch(u, { cache: "no-cache" });
Promise.all([
  charger("donnees.json").then(r => r.json()),
  charger("ref/royaume_1789.geojson").then(r => r.json()),
  charger("ref/bailliages_1789.geojson").then(r => r.json()),
  charger("ref/bailliages_1789.csv").then(r => r.text()).then(d3.csvParse),
]).then(([d, royaume, bailliages, tableB]) => {
  donnees = d;
  circonscriptions = new Map(d.circonscriptions.map(c => [c.id, c]));
  editions = new Map((d.editions ?? []).map(e => [e.id, e]));
  lieuxParBailliage = d3.group(d.lieux, l => l.bailliage_id);
  d.sources.forEach(s => etat.sources.add(s.cle));
  document.getElementById("genere").textContent = `données du ${d.genere}`;
  construireLegende(d.sources);
  construireCouverture(d);
  construireCarte(royaume, bailliages, new Map(tableB.map(b => [b.id, b])), d.lieux, d.bailliages ?? []);
  construireTableau(d.lieux);
  construireRecherche(d.lieux);
}).catch(e => {
  document.querySelector(".fond-note").textContent =
    `Impossible de charger les données (${e.message}). Lancer : python3 construire.py, puis npm start.`;
});

// ---------- légende = filtre ----------
function construireLegende(sources) {
  legende.innerHTML = "";
  for (const s of sources) {
    const t = s.totaux;
    const li = document.createElement("li");
    li.innerHTML = `
      <input type="checkbox" id="src-${s.cle}" checked>
      <label class="nom" for="src-${s.cle}">
        <span class="pastille${s.forme === "carre" ? " carre" : ""}" style="background:var(--${s.cle})"></span>
        <span>${s.nom}</span> <span class="statut">${s.statut}</span>
      </label>
      <span class="chiffres">${t.bailliages ? `<b>${t.bailliages}</b> bailliages · ` : ""}<b>${t.lieux}</b> ${t.bailliages ? "paroisses" : "lieux"} · <b>${t.signales}</b> doc. signalés${t.vues ? ` · <b>${nombre(t.vues)}</b> vues` : ""}${s.non_localises ? ` · ${s.non_localises} non localisé${s.non_localises > 1 ? "s" : ""}` : ""}<br>${collecteLibelle(t)}<br><b>${nombre(t.pop_1793)}</b> hab. en 1793, ${pourcent(t.pop_1793, donnees.royaume.pop_1793)} du royaume</span>
      <p class="note">${s.note}</p>`;
    li.querySelector("input").addEventListener("change", ev => {
      ev.target.checked ? etat.sources.add(s.cle) : etat.sources.delete(s.cle);
      appliquerFiltre();
    });
    legende.appendChild(li);
  }
}

// « collecté : 358 en images, 237 en texte » — ce que l'on tient, sur ce que l'inventaire du dépôt signale
function collecteLibelle(t) {
  const c = t.collecte, parts = [];
  if (c.images) parts.push(`<b>${c.images}</b> en images`);
  if (c.texte) parts.push(`<b>${c.texte}</b> en texte`);
  if (c.partielle) parts.push(`<b>${c.partielle}</b> partiel${c.partielle > 1 ? "s" : ""}`);
  return parts.length ? `collecté : ${parts.join(", ")}${c.aucune ? ` · ${c.aucune} restant${c.aucune > 1 ? "s" : ""}` : ""}` : "rien de collecté : liens vers le portail";
}

function appliquerFiltre() {
  gPoints.selectAll(".pt").attr("display", l => etat.sources.has(l.source) ? null : "none");
  // un bailliage reste teinté tant qu'un des dépôts qui lui donnent un cahier d'ordre est coché
  const visible = b => b && b.depots.some(d => etat.sources.has(d));
  g.selectAll(".bailliage.avec-cahier").classed("eteint", f => !visible(cahiersParBailliage.get(f.properties.BAIL_ID)));
  g.selectAll(".chef-lieu").attr("display", b => visible(b) ? null : "none");
  tbody.querySelectorAll("tr").forEach(tr => { tr.hidden = !etat.sources.has(tr.dataset.source); });
  teinter();
}

// ---------- couverture : part des communes de 1793 (≈ paroisses de 1789) ayant au moins un document ----------
const PALIERS = [0.10, 0.25, 0.50, 0.75, 1.01];  // bornes hautes des cinq degrés
// Une paroisse tenue par deux dépôts (AD22 et AD56 sur Ploërmel) ne compte qu'une fois : on
// dédoublonne par numéro Cassini parmi les dépôts cochés.
function couvertureDe(c, sources = etat.sources) {
  const vus = new Map();
  for (const l of lieuxParBailliage.get(c.id) ?? []) if (sources.has(l.source) && !vus.has(l.cassini)) vus.set(l.cassini, l);
  const lieux = vus.size, pop = d3.sum(vus.values(), l => l.pop_1793 ?? 0);
  return { lieux, pop, part: c.communes_1793 ? Math.min(lieux / c.communes_1793, 1) : 0 };
}
function degre(part) { return part <= 0 ? 0 : 1 + PALIERS.findIndex(b => part < b); }
// Hyslop (1933) : les paroisses que le Répertoire liste dans le bailliage comme ayant un cahier ou un
// procès-verbal conservé, et celles qu'un dépôt coché montre (même village de Cassini) ; « hors » : les
// lieux du dépôt que le Répertoire ne liste pas (fonds classés depuis 1933, ou lecture OCR manquée).
function hyslopDe(c, sources = etat.sources) {
  const h = c?.hyslop1933;
  if (!h) return null;
  const liste = new Set(h.cassini), vus = new Set(), hors = new Set();
  for (const l of lieuxParBailliage.get(c.id) ?? []) if (sources.has(l.source)) (liste.has(l.cassini) ? vus : hors).add(l.cassini);
  return { listees: h.listees, placees: h.placees, retrouvees: vus.size, hors: hors.size, part: h.listees ? Math.min(vus.size / h.listees, 1) : 0 };
}
// éditions imprimées numérisées d'un bailliage : « paroisses » si l'une d'elles édite ses cahiers de
// paroisses ou de communautés, « autre » si seulement des cahiers généraux, du clergé, des études
function editionsDe(c) { return (c?.editions ?? []).map(id => editions.get(id)).filter(Boolean); }
function niveauEdition(c) { const es = editionsDe(c); return es.some(e => e.paroisses) ? "paroisses" : es.length ? "autre" : null; }
function teinter() {
  const couverture = etat.teinte === "couverture", hy = etat.teinte === "hyslop", ed = etat.teinte === "editions";
  svg.classed("teinte-couverture", couverture || hy).classed("teinte-editions", ed);
  g.selectAll(".bailliage").attr("data-degre", f => {
    const c = circonscriptions.get(f.properties.BAIL_ID);
    if (!c) return null;
    if (couverture) return degre(couvertureDe(c).part);
    if (hy) { const h = hyslopDe(c); return h ? degre(h.part) : null; }
    return null;
  })
    .attr("data-edition", f => ed ? niveauEdition(circonscriptions.get(f.properties.BAIL_ID)) : null);
}
function construireCouverture(d) {
  const r = d.royaume;
  document.getElementById("royaume").innerHTML =
    `<b>${nombre(r.pop_1793)}</b> habitants et <b>${nombre(r.communes_1793)}</b> communes au recensement de l'an III (1793), sommés village par village dans les bailliages de Brette.`;
  document.querySelectorAll("input[name=teinte]").forEach(i => i.addEventListener("change", () => { etat.teinte = i.value; teinter(); }));
  const couverts = d.circonscriptions.filter(c => niveauEdition(c) === "paroisses").length;
  const vols = d3.sum(d.editions ?? [], e => e.volumes.length);
  const hyB = d.circonscriptions.filter(c => c.hyslop1934).length;
  const enLigne = (d.bailliages ?? []).filter(b => circonscriptions.get(b.id)?.hyslop1934).length;
  const h33 = r.hyslop1933;
  if (h33) document.getElementById("hyslop1933-total").innerHTML = `Hyslop (1933) liste <b>${nombre(h33.listees)}</b> paroisses ou communautés dont un cahier ou un procès‑verbal était conservé, dans <b>${h33.bailliages}</b> bailliages de Brette (${nombre(h33.placees)} placées sur un village de Cassini) : le dénominateur de la troisième teinte. Lecture OCR du <i>Répertoire</i>, imparfaite et corrigée par vagues (${(h33.version.match(/commit \S+ du [\d-]+/) ?? [""])[0]}).`;
  if (hyB) document.getElementById("hyslop-total").innerHTML = `Hyslop (1934) recense <b>615</b> cahiers généraux dans 234 districts (522 textes conservés, 93 perdus), portés ici sur <b>${hyB}</b> bailliages de Brette ; <b>${enLigne}</b> d'entre eux ont un cahier d'ordre en ligne dans les dépôts cochés ou non.`;
  document.getElementById("editions-total").innerHTML = `<b>${couverts}</b> bailliages sur ${d.circonscriptions.length} ont leurs cahiers de paroisses dans une édition imprimée numérisée (${(d.editions ?? []).length} éditions, ${vols} volumes sur Gallica ou Internet Archive).`;
}

// ---------- carte ----------
function construireCarte(royaume, bailliages, tableB, lieux, cahiersB) {
  const avecCahier = cahiersParBailliage = new Map(cahiersB.map(b => [b.id, b]));
  const { width, height } = scene.getBoundingClientRect();
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Conique conforme, parallèles de la Lambert‑93 : la France sans déformation visible.
  projection = d3.geoConicConformal().parallels([44, 49]).rotate([-3, 0]);
  projection.fitExtent([[24, 24], [width - 24, height - 24]], royaume);
  chemin = d3.geoPath(projection);

  g = svg.append("g");
  // le royaume en 1789 : une seule pièce, tout le reste est mer ou étranger
  g.append("path").datum(royaume).attr("d", chemin).attr("class", "royaume");
  const libelle = f => { const b = tableB.get(f.properties.BAIL_ID); return b ? `${b.nom_long} (généralité de ${b.generalite})` : f.properties.BAIL_NL; };
  const gB = g.append("g");
  gB.selectAll("path").data(bailliages.features).join("path")
    .attr("d", chemin)
    .attr("class", f => "bailliage" + (avecCahier.has(f.properties.BAIL_ID) ? " avec-cahier" : ""))
    .on("pointerenter", (ev, f) => {
      const c = avecCahier.get(f.properties.BAIL_ID), q = circonscriptions.get(f.properties.BAIL_ID);
      const cv = q ? couvertureDe(q) : null, ed = editionsDe(q).filter(e => e.paroisses), h = hyslopDe(q);
      montrerBulleTexte(ev, libelle(f) + (c ? ` — cahiers ${c.ordres.join(", ")}` : "") + (ed.length ? ` — édité : ${ed.map(e => `${e.auteur || e.titre.split(" ").slice(0, 3).join(" ")} ${e.annees.slice(0, 4)}`).join(", ")}` : ""),
        q ? `${nombre(q.pop_1793)} hab. en 1793 · ${cv.lieux ? `${cv.lieux} cahier${cv.lieux > 1 ? "s" : ""} sur ${nombre(q.communes_1793)} paroisses (${pourcent(cv.lieux, q.communes_1793)})` : `${nombre(q.communes_1793)} paroisses, aucun cahier`}${h ? ` · Hyslop 1933 : ${h.retrouvees} retrouvée${h.retrouvees > 1 ? "s" : ""} sur ${h.listees}` : ""}` : "");
    })
    .on("pointermove", ev => placerBulle(ev))
    .on("pointerleave", () => { bulle.hidden = true; })
    .on("click", (ev, f) => choisirBailliage(avecCahier.get(f.properties.BAIL_ID) ?? { id: f.properties.BAIL_ID, ...tableB.get(f.properties.BAIL_ID), docs: [] }));
  // noms des bailliages, visibles quand on est assez près
  gEtiquettes = g.append("g").attr("class", "etiquettes").attr("display", "none");
  gEtiquettes.selectAll("text").data(bailliages.features).join("text")
    .attr("transform", f => `translate(${chemin.centroid(f)})`)
    .text(f => tableB.get(f.properties.BAIL_ID)?.nom ?? f.properties.BAIL_NS);

  // rayon : racine du nombre de documents, pour que l'aire suive la quantité
  const rayon = d3.scaleSqrt().domain([0, d3.max(lieux, l => l.docs.length) || 1]).range([2.6, 9]);
  // chefs-lieux des bailliages qui ont un cahier général : carré plein, cliquable
  gChefs = g.append("g");
  gChefs.selectAll("rect").data(cahiersB.filter(b => b.lon != null)).join("rect")
    .attr("class", "chef-lieu")
    .attr("x", b => projection([b.lon, b.lat])[0] - 3.5).attr("y", b => projection([b.lon, b.lat])[1] - 3.5)
    .attr("width", 7).attr("height", 7)
    .attr("tabindex", 0).attr("aria-label", b => `${b.nom_long}, cahiers d'ordre`)
    .on("pointerenter", (ev, b) => montrerBulleTexte(ev, `${b.nom_long} — cahiers ${b.ordres.join(", ")}`))
    .on("pointermove", ev => placerBulle(ev))
    .on("pointerleave", () => { bulle.hidden = true; })
    .on("click", (ev, b) => { ev.stopPropagation(); choisirBailliage(b); })
    .on("keydown", (ev, b) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choisirBailliage(b); } });

  gPoints = g.append("g");
  const forme = l => donnees.sources.find(s => s.cle === l.source).forme === "carre" ? "rect" : "circle";
  const tri = lieux.slice().sort((a, b) => b.docs.length - a.docs.length);  // petits au-dessus
  gPoints.selectAll("circle").data(tri.filter(l => forme(l) === "circle")).join("circle")
    .attr("cx", l => projection([l.lon, l.lat])[0])
    .attr("cy", l => projection([l.lon, l.lat])[1])
    .attr("r", l => rayon(l.docs.length));
  gPoints.selectAll("rect").data(tri.filter(l => forme(l) === "rect")).join("rect")
    .attr("x", l => projection([l.lon, l.lat])[0] - rayon(l.docs.length))
    .attr("y", l => projection([l.lon, l.lat])[1] - rayon(l.docs.length))
    .attr("width", l => 2 * rayon(l.docs.length)).attr("height", l => 2 * rayon(l.docs.length));
  gPoints.selectAll("circle, rect")
    .attr("class", l => `pt ${l.source} ${STATUT_CLASSE[statutDe(l)]}`)
    .attr("tabindex", 0)
    .attr("aria-label", l => `${l.nom}, ${nomSource(l.source)}`)
    .on("pointerenter", (ev, l) => montrerBulle(ev, l))
    .on("pointermove", ev => placerBulle(ev))
    .on("pointerleave", () => { bulle.hidden = true; })
    .on("click", (ev, l) => choisir(l))
    .on("keydown", (ev, l) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choisir(l); } });

  zoom = d3.zoom().scaleExtent([1, 14]).on("zoom", ev => {
    etat.k = ev.transform.k;
    g.attr("transform", ev.transform);
    // les points gardent une taille lisible à l'écran, sans grossir avec le zoom
    gPoints.selectAll("circle").attr("r", l => rayon(l.docs.length) / Math.sqrt(etat.k));
    gPoints.selectAll("rect").each(function (l) {
      const r = rayon(l.docs.length) / Math.sqrt(etat.k), [x, y] = projection([l.lon, l.lat]);
      d3.select(this).attr("x", x - r).attr("y", y - r).attr("width", 2 * r).attr("height", 2 * r);
    });
    gChefs.selectAll("rect").each(function (b) {
      const r = 3.5 / Math.sqrt(etat.k), [x, y] = projection([b.lon, b.lat]);
      d3.select(this).attr("x", x - r).attr("y", y - r).attr("width", 2 * r).attr("height", 2 * r);
    });
    gEtiquettes.attr("display", etat.k >= 2.5 ? null : "none")
      .attr("font-size", `${11 / etat.k}px`);
  });
  svg.call(zoom);
  document.getElementById("zoom-plus").onclick = () => svg.transition().call(zoom.scaleBy, 1.6);
  document.getElementById("zoom-moins").onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.6);
  document.getElementById("zoom-reset").onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

  // Première vue : cadrer sur les lieux plutôt que sur la France entière.
  cadrer(lieux);

  window.addEventListener("resize", () => {
    const r = scene.getBoundingClientRect();
    svg.attr("viewBox", `0 0 ${r.width} ${r.height}`);
  });
}

function cadrer(lieux) {
  if (!lieux.length) return;
  const pts = lieux.map(l => projection([l.lon, l.lat]));
  const [x0, x1] = d3.extent(pts, p => p[0]), [y0, y1] = d3.extent(pts, p => p[1]);
  const { width, height } = scene.getBoundingClientRect();
  const k = Math.min(14, 0.8 / Math.max((x1 - x0) / width, (y1 - y0) / height));
  const t = d3.zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  svg.transition().duration(600).call(zoom.transform, t);
}

function statutDe(l) { return donnees.sources.find(s => s.cle === l.source).statut; }
function nomSource(cle) { return donnees.sources.find(s => s.cle === cle).nom; }

// ---------- bulle ----------
function montrerBulle(ev, l) {
  const n = l.docs.length;
  bulle.innerHTML = `${l.nom}<small>${nomSource(l.source)} · ${n ? `${n} document${n > 1 ? "s" : ""}` : "annoncé"}${l.vues ? ` · ${l.vues} vues` : ""}${l.pop_1793 != null ? ` · ${nombre(l.pop_1793)} hab. en 1793` : ""}</small>`;
  bulle.hidden = false;
  placerBulle(ev);
}
function montrerBulleTexte(ev, texte, petit = "") {
  bulle.textContent = texte;
  if (petit) { const s = document.createElement("small"); s.textContent = petit; bulle.appendChild(s); }
  bulle.hidden = false;
  placerBulle(ev);
}
function placerBulle(ev) {
  const r = scene.getBoundingClientRect();
  bulle.style.left = `${ev.clientX - r.left}px`;
  bulle.style.top = `${ev.clientY - r.top}px`;
}

// ---------- détail ----------
function choisir(l) {
  etat.actif = l;
  gPoints.selectAll(".pt").classed("actif", d => d === l).filter(d => d === l).raise();
  gChefs.selectAll("rect").classed("actif", false);
  const s = donnees.sources.find(x => x.cle === l.source);
  const docs = l.docs.map(d => `
    <li>${d.url ? `<a href="${d.url}" target="_blank" rel="noopener">${d.titre}</a>` : d.titre}
      <span class="meta">${[d.cote, d.vues ? `${d.vues} vues` : "", TEXTE_LIBELLE[d.texte], d.collecte !== "aucune" ? `${d.collecte === "partielle" ? "collecte partielle" : d.collecte === "texte" ? "texte collecté" : "images collectées"}` : "", d.note].filter(Boolean).join(" · ")}</span></li>`).join("");
  const methode = { alias: "graphie du portail ramenée au nom Cassini", prefixe: "rattaché à la première paroisse du nom", contenu: "nom contenu dans celui du village", bailliage: "cherché dans le bailliage nommé par le dépôt" }[l.methode];
  detail.innerHTML = `
    <h2>Lieu</h2>
    <h3>${l.nom}</h3>
    <p class="commune">${l.bailliage_long}, généralité de ${l.generalite}<br>
      sur la carte de Cassini : <em>${l.nom_cassini}</em> <span class="mono">n° ${l.cassini}</span>${l.nom_1999 && l.nom_1999 !== l.nom ? ` · ${l.nom_1999} (1999)` : ""}<br>
      ${l.pop_1793 != null ? `${nombre(l.pop_1793)} habitants au recensement de 1793` : "pas de chiffre en 1793 : n'était pas une commune (trève, hameau ou commune créée plus tard)"}<br>
      ${s.nom}, <em>${s.statut}</em>${methode ? `<br><span class="mono">${methode}</span>` : ""}</p>
    ${docs ? `<ol>${docs}</ol>` : `<p class="aide">Aucun document en ligne pour l'instant.</p>`}
    ${l.source === "ad62" ? `<p class="avert">Réutilisation privée seulement (conditions AD62) : la carte ne renvoie qu'à la visionneuse du portail.</p>` : ""}`;
  detail.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function choisirBailliage(b) {
  etat.actif = b;
  gPoints.selectAll(".pt").classed("actif", false);
  gChefs.selectAll("rect").classed("actif", d => d === b);
  const ORDRE_LIBELLE = { "clergé": "Clergé", "noblesse": "Noblesse", "tiers-état": "Tiers‑état", "tiers état": "Tiers‑état", "tiers": "Tiers‑état",
    "trois ordres": "Trois ordres", "trois ordres réunis": "Trois ordres", "autre": "Autres pièces" };
  const libelleOrdre = d => d.echelon === "autre" ? "Autres pièces" : ORDRE_LIBELLE[d.ordre] ?? (d.ordre ? d.ordre.charAt(0).toUpperCase() + d.ordre.slice(1) : "Sans ordre");
  const blocs = (b.depots ?? []).filter(dep => etat.sources.has(dep)).map(dep => {
    const s = donnees.sources.find(x => x.cle === dep);
    const groupes = d3.group(b.docs.filter(d => d.depot === dep), libelleOrdre);
    return `<p class="commune"><span class="pastille${s.forme === "carre" ? " carre" : ""}" style="background:var(--${dep})"></span>${s.nom}</p><ol>${[...groupes].map(([ordre, docs]) => `
    <li><span class="ordre">${ordre}</span>${docs.map(d => `
      <a href="${d.url}" target="_blank" rel="noopener">${d.titre}</a> <span class="meta">${[d.cote, d.vues ? `${d.vues} vues` : "", TEXTE_LIBELLE[d.texte]].filter(Boolean).join(" · ")}</span>`).join("<br>")}</li>`).join("")}</ol>`;
  }).join("");
  const q = circonscriptions.get(b.id);
  const parSource = q ? donnees.sources.filter(s => etat.sources.has(s.cle)).map(s => [s, couvertureDe(q, new Set([s.cle]))]).filter(([, v]) => v.lieux).map(([s, v]) => `
      <li><span class="pastille${s.forme === "carre" ? " carre" : ""}" style="background:var(--${s.cle})"></span>${s.nom} : <b>${v.lieux}</b> commune${v.lieux > 1 ? "s" : ""} avec un document, ${pourcent(v.lieux, q.communes_1793)} des communes, ${pourcent(v.pop, q.pop_1793)} des habitants</li>`).join("") : "";
  const cv = q ? couvertureDe(q) : null;
  const h = hyslopDe(q);
  const hParSource = h ? donnees.sources.filter(s => etat.sources.has(s.cle)).map(s => [s, hyslopDe(q, new Set([s.cle]))]).filter(([, v]) => v.retrouvees || v.hors).map(([s, v]) => `
      <li><span class="pastille${s.forme === "carre" ? " carre" : ""}" style="background:var(--${s.cle})"></span>${s.nom} : <b>${v.retrouvees}</b> retrouvée${v.retrouvees > 1 ? "s" : ""}${v.hors ? `, ${v.hors} lieu${v.hors > 1 ? "x" : ""} que Hyslop ne liste pas` : ""}</li>`).join("") : "";
  const hy33 = h ? `
    <h4>Paroisses selon Hyslop (1933)</h4>
    <p class="couverture"><b>${nombre(h.listees)}</b> paroisses ou communautés dont un cahier ou un procès‑verbal était conservé en 1933 <span class="meta">(${q.hyslop1933.circonscriptions.map(c => `${c.nom}, f. ${c.folio}${q.hyslop1933.circonscriptions.length > 1 ? ` : ${c.paroisses}` : ""}`).join(" ; ")})</span><br>
      <b>${pourcent(h.retrouvees, h.listees)}</b> retrouvées dans les dépôts cochés (${h.retrouvees})${h.hors ? ` ; ${h.hors} lieu${h.hors > 1 ? "x" : ""} des dépôts que le Répertoire ne liste pas` : ""}${h.placees < h.listees ? ` ; ${h.listees - h.placees} sans village placé, donc jamais retrouvée${h.listees - h.placees > 1 ? "s" : ""}` : ""}</p>
    ${hParSource ? `<ul class="par-source">${hParSource}</ul>` : ""}
    <p class="aide">Lecture OCR du <i>Répertoire critique</i>, imparfaite et corrigée par vagues ; « retrouvée » : même village de Cassini dans un dépôt coché. Le compte vaut pour 1933 — des fonds classés depuis le dépassent, et un dépôt qui liste plus que Hyslop le dit ici.</p>` : "";
  const SERIE = { AP: "Archives parlementaires", CDI: "Commission Jaurès", locale: "édition locale", "étude": "étude" };
  const eds = editionsDe(q).map(e => `
      <li${e.paroisses ? "" : ' class="sans-paroisses"'}>${e.auteur ? `${e.auteur}, ` : ""}<em>${e.titre}</em>, ${e.annees} <span class="meta">${SERIE[e.serie] ?? e.serie} · ${e.contenu}</span><br>${e.volumes.map(v => `<a href="${v.url}" target="_blank" rel="noopener">${v.source === "gallica" ? "Gallica" : v.source === "ia" ? "Internet Archive" : v.source}${v.vues ? ` (${v.vues} vues)` : ""}</a>`).join(" · ")}${e.note ? `<br><span class="meta">${e.note}</span>` : ""}</li>`).join("");
  const ETAT = v => !v ? "" : v.startsWith("perdu") ? `<span class="perdu">perdu</span>` : v.startsWith("non fait") ? `<span class="perdu">non fait</span>` : v;
  const hy = (q?.hyslop1934 ?? []).map(d => `
      <li><b>${d.district}</b> (gén. de ${d.generalite})${["clerge", "nobles", "tiers"].filter(k => d[k]).map(k => ` · ${{ clerge: "clergé", nobles: "noblesse", tiers: "tiers" }[k]} : ${ETAT(d[k])}`).join("")}${d.commun ? ` · ${ETAT(d.commun)}` : ""}${d.note ? ` <span class="meta">${d.note}</span>` : ""}</li>`).join("");
  const nb = v => v == null ? "?" : nombre(v);
  const cp = (q?.comptes ?? []).map(c => `
      <li>${c.auteur ? `${c.auteur} ${c.annees.slice(0, 4)}` : c.edition}${c.bailliages.length > 1 ? ` <span class="meta">(${c.bailliages.length} bailliages ensemble)</span>` : ""} : <b>${nb(c.conserves)}</b> cahiers de paroisses conservés${c.communautes != null ? ` pour <b>${nombre(c.communautes)}</b> communautés convoquées` : ""}${c.publies != null ? `, ${nombre(c.publies)} publiés` : ""}<br><span class="meta">${c.citation}</span></li>`).join("");
  const m = q?.mesure;
  const PROFIL = { filtrer: "l'assemblée a réécrit et laissé tomber ce qui ne pesait que sur les ruraux", compiler: "le cahier général est la réunion des cahiers de paroisses",
    "synthétiser": "tout ce que les paroisses demandent y est, hiérarchisé en un programme", condenser: "chaque sujet des paroisses tient en un article de principe",
    "développer": "les sujets des paroisses y sont, mais le bailliage écrit les siens", adopter: "le bailliage a signé le cahier de son chef‑lieu",
    reprendre: "le cahier général est fait des cahiers des communautés",
    relayer: "synthèse à deux étages : paroisses, sièges secondaires, bailliage — la mesure ne voit que le second",
    "réduire": "le bailliage secondaire a réduit les cahiers à un programme court, avant une réduction de plus", annexer: "la ville a joint les cahiers de ses corporations au sien au lieu de les fondre" };
  const mes = m ? `
      <p><b>${m.part_reprise} %</b> des ${nombre(m.articles_paroisses)} articles de <b>${m.paroisses}</b> cahiers de ${m.unites === "corporations" ? "corporations" : "paroisses"} ont un article qui leur ressemble dans le cahier général du tiers (${m.articles_general} articles) ; <b>${m.portes_1}</b> articles généraux ressemblent à une paroisse au moins, <b>${m.portes_10}</b> à dix ou plus${m.paroisses_le_portant >= 5 ? ` — le plus porté, par ${m.paroisses_le_portant} : « ${m.article_le_plus_porte}… »` : ""}.${m.themes_absents.length ? ` Demandé par un cinquième des paroisses au moins et absent du cahier général : ${m.themes_absents.join(" ; ")}.` : " Rien de ce qu'un cinquième des paroisses demande ne manque au cahier général."}</p>
      ${m.petites ? `<p>Qui est entendu, sur ${m.paroisses_localisees} paroisses localisées : le tiers des plus petites (${nombre(m.petites.mediane)} habitants en médiane) est repris à <b>${Math.round(m.petites.part)} %</b>, celui des plus grosses (${nombre(m.grosses.mediane)}) à <b>${Math.round(m.grosses.part)} %</b> ; les cahiers courts (${m.courts.mediane} articles) à <b>${Math.round(m.courts.part)} %</b>, les longs (${m.longs.mediane}) à <b>${Math.round(m.longs.part)} %</b>.</p>` : ""}
      <p class="aide">Profil : <b>${m.profil}</b> — ${PROFIL[m.profil] ?? ""}. Paroisses : ${m.source_paroisses} ; cahier général : ${m.source_general}. Ressemblance : cosinus TF‑IDF ≥ 0,20 entre articles ; grille de 37 thèmes. <a href="a-propos.html#mesure">Méthode et limites</a>.</p>` : "";
  detail.innerHTML = `
    <h2>Bailliage</h2>
    <h3>${b.nom_long}</h3>
    <p class="commune">Généralité de ${b.generalite}${q ? `<br><b>${nombre(q.pop_1793)}</b> habitants et <b>${nombre(q.communes_1793)}</b> communes en 1793${q.lacunes ? ` (${q.lacunes} sans chiffre)` : ""}, soit ${pourcent(q.pop_1793, donnees.royaume.pop_1793)} du royaume` : ""}</p>
    ${q ? `<p class="couverture"><b>${cv.lieux ? pourcent(cv.lieux, q.communes_1793) : "0 %"}</b> des communes de 1793 ont un document (cahier ou procès‑verbal) dans les dépôts cochés, ${cv.lieux ? pourcent(cv.pop, q.pop_1793) : "0 %"} des habitants</p>` : ""}
    ${parSource ? `<ul class="par-source">${parSource}</ul>` : ""}
    ${hy33}
    ${eds ? `<h4>Éditions imprimées numérisées</h4><ul class="editions">${eds}</ul>` : ""}
    ${cp ? `<h4>Ce que les éditeurs comptent</h4><ul class="editions comptes">${cp}</ul><p class="aide">Relevé dans les introductions (<code>data/editions/comptes.csv</code>) : un dénominateur en cahiers conservés plus récent que Hyslop 1933, ci‑dessus. « ? » : l'éditeur ne le dit pas.</p>` : ""}
    ${mes ? `<h4>Le cahier général contre ses paroisses</h4>${mes}` : ""}
    ${hy ? `<h4>Cahiers généraux selon Hyslop (1934)</h4><ul class="editions hyslop">${hy}</ul><p class="aide">Où est le texte de chaque cahier d'ordre : tome et pages des Archives parlementaires (G : texte à corriger d'après le Guide), édition, manuscrit — ou perdu.</p>` : ""}
    ${blocs ? `<h4>Cahiers d'ordre et de bailliage</h4>${blocs}${(b.depots ?? []).includes("ap") && etat.sources.has("ap") ? `<p class="avert">Archives parlementaires : texte non moissonné, la carte renvoie à la notice Persée (demande n° 1 en attente).</p>` : ""}` : `<p class="aide">Aucun cahier d'ordre ou de bailliage dans les dépôts cochés.</p>`}`;
  detail.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

// ---------- tableau ----------
function construireTableau(lieux) {
  const tri = lieux.slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  tbody.innerHTML = tri.map(l => `
    <tr data-source="${l.source}">
      <td><span class="pastille" style="background:var(--${l.source})"></span>${l.nom}</td>
      <td>${l.bailliage_long}</td><td>${l.dept}</td><td>${nomSource(l.source)}</td>
      <td class="num">${l.docs.length}</td><td class="num">${l.vues || ""}</td><td class="num">${l.pop_1793 != null ? nombre(l.pop_1793) : ""}</td></tr>`).join("");
  tbody.querySelectorAll("tr").forEach((tr, i) => tr.addEventListener("click", () => { afficher("carte"); allerA(tri[i]); }));

  const btnCarte = document.getElementById("btn-carte"), btnListe = document.getElementById("btn-liste");
  btnCarte.onclick = () => afficher("carte");
  btnListe.onclick = () => afficher("liste");
  function afficher(quoi) {
    const carte = quoi === "carte";
    document.getElementById("scene").hidden = !carte;
    document.getElementById("liste").hidden = carte;
    btnCarte.classList.toggle("actif", carte); btnCarte.setAttribute("aria-pressed", carte);
    btnListe.classList.toggle("actif", !carte); btnListe.setAttribute("aria-pressed", !carte);
  }
}

// ---------- recherche ----------
function construireRecherche(lieux) {
  const noms = [...new Set(lieux.map(l => l.nom))].sort((a, b) => a.localeCompare(b, "fr"));
  datalist.innerHTML = noms.map(n => `<option value="${n.replace(/"/g, "&quot;")}">`).join("");
  recherche.addEventListener("change", () => {
    const q = recherche.value.trim().toLowerCase();
    const l = lieux.find(x => x.nom.toLowerCase() === q) || lieux.find(x => x.nom.toLowerCase().startsWith(q));
    if (l) allerA(l);
  });
}

function allerA(l) {
  const [x, y] = projection([l.lon, l.lat]);
  const { width, height } = scene.getBoundingClientRect();
  const k = Math.max(etat.k, 6);
  svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-x, -y));
  choisir(l);
}
