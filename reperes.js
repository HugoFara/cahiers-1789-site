// Repères — graphiques de reperes.html (D3, servi localement).
// Données : reperes.json (reperes.py) ; la frise est dans la page (#frise-liste), chaque date avec sa source.

const bulle = document.getElementById("bulle");
const nombre = n => n.toLocaleString("fr-FR");
const fr = d3.timeFormatLocale({
  dateTime: "", date: "", time: "", periods: ["", ""], days: [], shortDays: [],
  months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  shortMonths: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
});
const jourLong = fr.format("%-d %B"), moisCourt = fr.format("%b"), moisAn = fr.format("%b %Y");
const date = s => new Date(`${s}T12:00:00`);

function montrer(ev, html) {
  bulle.innerHTML = html;
  bulle.hidden = false;
  placer(ev);
}
function placer(ev) {
  const r = bulle.parentElement.getBoundingClientRect();
  bulle.style.left = `${Math.min(Math.max(ev.clientX - r.left, 90), r.width - 90)}px`;
  bulle.style.top = `${ev.clientY - r.top}px`;
}
const cacher = () => { bulle.hidden = true; };

// Une figure se redessine à la largeur de son cadre (et au changement de largeur seulement).
function figure(id, dessiner) {
  const cadre = document.getElementById(id);
  let largeur = 0;
  const f = () => {
    const w = Math.round(cadre.getBoundingClientRect().width);
    if (w && w !== largeur) { largeur = w; cadre.querySelector("svg")?.remove(); dessiner(d3.select(cadre), w); }
  };
  new ResizeObserver(f).observe(cadre);
}

// ---------- 1. la frise : lue dans la liste de la page, qui reste la version texte ----------
function frise() {
  const evts = [...document.querySelectorAll("#frise-liste li[data-date]")].map(li => ({
    debut: date(li.dataset.date), fin: li.dataset.fin ? date(li.dataset.fin) : null, phase: li.dataset.phase,
    court: li.dataset.court, texte: li.querySelector(".quoi").textContent, quand: li.querySelector("time").textContent,
  }));
  figure("frise", (cadre, w) => {
    const m = { g: 12, d: 12 }, hLigne = 18, maxNiveaux = 8;
    const x = d3.scaleTime().domain([date("1788-07-20"), date("1789-09-05")]).range([m.g, w - m.d]);
    const svg = cadre.append("svg").attr("width", w)
      .attr("role", "img").attr("aria-label", "Frise chronologique d'août 1788 à août 1789 ; la liste ci-dessous en donne le détail et les sources");
    // étiquettes d'abord : chaque repère, dans l'ordre des dates, prend le niveau libre le plus bas, dessus ou
    // dessous ; les tiges passent derrière les étiquettes, dont le liseré couleur de fond les masque
    const points = evts.filter(e => !e.fin);
    const occupe = { haut: Array(maxNiveaux).fill(-Infinity), bas: Array(maxNiveaux).fill(-Infinity) };
    const mesure = svg.append("text").attr("class", "etiquette").attr("visibility", "hidden");
    points.forEach((e, i) => {
      mesure.text(e.court);
      const larg = mesure.node().getComputedTextLength() + 10, xs = x(e.debut);
      const x0 = Math.min(Math.max(xs - 4, m.g), w - m.d - larg);
      const cotes = i % 2 ? ["bas", "haut"] : ["haut", "bas"];
      let choix = null;
      for (let n = 0; n < maxNiveaux && !choix; n++) for (const c of cotes) if (!choix && occupe[c][n] < x0) choix = [c, n];
      if (!choix) choix = [cotes[0], maxNiveaux - 1];
      const [cote, n] = choix;
      occupe[cote][n] = x0 + larg;
      e.cote = cote; e.niveau = n; e.x0 = x0;
    });
    mesure.remove();
    const nHaut = 1 + (d3.max(points.filter(e => e.cote === "haut"), e => e.niveau) ?? -1);
    const nBas = 1 + (d3.max(points.filter(e => e.cote === "bas"), e => e.niveau) ?? -1);
    const axe = 20 + nHaut * hLigne + 6, h = axe + 34 + nBas * hLigne;
    svg.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
    // bandes des périodes (assemblées), sous les repères
    for (const e of evts.filter(e => e.fin)) {
      svg.append("rect").attr("class", `bande ${e.phase}`).attr("x", x(e.debut)).attr("y", axe - 7)
        .attr("width", Math.max(2, x(e.fin) - x(e.debut))).attr("height", 14).attr("rx", 2);
    }
    svg.append("line").attr("class", "axe").attr("x1", m.g).attr("x2", w - m.d).attr("y1", axe).attr("y2", axe);
    const mois = x.ticks(d3.timeMonth.every(1));
    svg.append("g").selectAll("text").data(mois).join("text").attr("class", "tic")
      .attr("x", d => x(d)).attr("y", axe + 22).attr("text-anchor", (d, i) => i ? "middle" : "start")
      .text(d => d.getMonth() === 0 || d === mois[0] ? moisAn(d) : moisCourt(d))
      .attr("display", (d, i) => w < 820 && i % 2 ? "none" : null);
    const yEt = d => d.cote === "haut" ? axe - 16 - d.niveau * hLigne : axe + 40 + d.niveau * hLigne;
    // trois couches : toutes les tiges, puis les points, puis les étiquettes (qui masquent les tiges qu'elles croisent)
    svg.append("g").selectAll("line").data(points).join("line").attr("class", "tige").attr("x1", d => x(d.debut)).attr("x2", d => x(d.debut))
      .attr("y1", axe).attr("y2", d => d.cote === "haut" ? yEt(d) + 4 : yEt(d) - 12);
    const g = svg.append("g").selectAll("g").data(points).join("g").attr("class", d => `repere ${d.phase}`)
      .attr("tabindex", 0).attr("aria-label", d => `${d.quand} : ${d.texte}`);
    g.append("circle").attr("cx", d => x(d.debut)).attr("cy", axe).attr("r", 4.5);
    g.append("text").attr("class", "etiquette").attr("x", d => d.x0 + 2).attr("y", yEt).text(d => d.court);
    g.append("rect").attr("class", "cible").attr("x", d => d.x0 - 2).attr("y", d => yEt(d) - 14)
      .attr("width", d => Math.max(24, d.court.length * 7.2)).attr("height", 20);
    g.on("pointerenter", (ev, d) => montrer(ev, `${d.texte}<small>${d.quand}</small>`)).on("pointermove", placer).on("pointerleave", cacher)
      .on("focus", function (ev, d) { const b = this.getBoundingClientRect(); montrer({ clientX: b.left + b.width / 2, clientY: b.top }, `${d.texte}<small>${d.quand}</small>`); })
      .on("blur", cacher);
  });
}

// ---------- 2. la règle des députés contre les procès-verbaux lus ----------
function deputes(obs) {
  const regle = f => f <= 200 ? 2 : 2 + Math.ceil((f - 200) / 100);
  const xmax = 1000;
  // décalage vertical fixe par procès-verbal, pour séparer les points d'une même valeur
  const decale = i => ((i * 0.618034) % 1 - 0.5) * 0.46;
  obs.forEach((o, i) => { o.dy = decale(i); o.ecart = o.deputes - o.regle; });
  figure("fig-deputes", (cadre, w) => {
    const m = { h: 16, d: 16, b: 42, g: 36 }, h = 340;
    const x = d3.scaleLinear().domain([0, xmax]).range([m.g, w - m.d]);
    const y = d3.scaleLinear().domain([0.4, 10.6]).range([h - m.b, m.h]);
    const svg = cadre.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
      .attr("role", "img").attr("aria-label", `Nombre de députés élus selon le nombre de feux, ${obs.length} procès-verbaux, et la règle du 24 janvier 1789`);
    svg.append("g").attr("class", "grille").selectAll("line").data(d3.range(1, 11)).join("line")
      .attr("x1", m.g).attr("x2", w - m.d).attr("y1", d => y(d)).attr("y2", d => y(d));
    svg.append("g").attr("class", "tic").selectAll("text").data(d3.range(1, 11)).join("text")
      .attr("x", m.g - 8).attr("y", d => y(d) + 4).attr("text-anchor", "end").text(d => d);
    svg.append("g").attr("class", "tic").selectAll("text").data(d3.range(0, xmax + 1, w < 520 ? 200 : 100)).join("text")
      .attr("x", d => x(d)).attr("y", h - m.b + 18).attr("text-anchor", "middle").text(d => nombre(d));
    svg.append("text").attr("class", "tic titre-axe").attr("x", w - m.d).attr("y", h - 6).attr("text-anchor", "end").text("feux déclarés par la communauté →");
    svg.append("text").attr("class", "tic titre-axe").attr("x", m.g - 8).attr("y", m.h - 4).attr("text-anchor", "start").text("députés élus");
    // la règle, en escalier : 2 jusqu'à 200 feux, puis un de plus par centaine commencée
    const marches = [[0, 2], ...d3.range(200, xmax, 100).map(f => [f, regle(f + 1)]), [xmax, regle(xmax)]];
    svg.append("path").attr("class", "regle").attr("d", d3.line().curve(d3.curveStepAfter).x(d => x(d[0])).y(d => y(d[1]))(marches));
    svg.append("text").attr("class", "annot").attr("x", x(690)).attr("y", y(7) - 8).attr("text-anchor", "end").text("ce que la règle demandait");
    const pts = svg.append("g").selectAll("circle").data(obs.filter(o => o.feux <= xmax)).join("circle")
      .attr("class", o => o.ecart === 0 ? "obs conforme" : "obs ecart")
      .attr("cx", o => x(o.feux)).attr("cy", o => y(o.deputes + o.dy)).attr("r", 4)
      .on("pointerenter", (ev, o) => montrer(ev, `${o.paroisse} <small>${o.depot} · ${nombre(o.feux)} feux · ${o.deputes} député${o.deputes > 1 ? "s" : ""} élu${o.deputes > 1 ? "s" : ""}, la règle en voulait ${o.regle}</small>`))
      .on("pointermove", placer).on("pointerleave", cacher);
    pts.filter(o => o.ecart !== 0).raise();
    const hors = obs.filter(o => o.feux > xmax).length;
    if (hors) svg.append("text").attr("class", "annot").attr("x", w - m.d).attr("y", y(1)).attr("text-anchor", "end").text(`${hors} au-delà de ${nombre(xmax)} feux, non montré${hors > 1 ? "s" : ""}`);
  });
}

// ---------- 3. le calendrier des assemblées de paroisse ----------
function calendrier(series) {
  const d0 = date("1789-02-15"), d1 = date("1789-05-08"), ouverture = date("1789-05-05");
  const max = d3.max(series, s => d3.max(s.jours, j => j[1]));
  figure("fig-calendrier", (cadre, w) => {
    const m = { g: 110, d: 12 }, hRang = 58, haut = 8, h = haut + series.length * hRang + 34;
    const gauche = w < 520 ? 0 : m.g;
    const x = d3.scaleTime().domain([d0, d1]).range([gauche + 4, w - m.d]);
    const larg = Math.max(1.5, (x(date("1789-03-02")) - x(date("1789-03-01"))) - 1.5);
    const y = d3.scaleLinear().domain([0, max]).range([0, hRang - (w < 520 ? 26 : 14)]);
    const svg = cadre.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
      .attr("role", "img").attr("aria-label", "Nombre d'assemblées de paroisse par jour, février à avril 1789, dans quatre dépôts");
    const rang = svg.selectAll("g.rang").data(series).join("g").attr("class", "rang")
      .attr("transform", (s, i) => `translate(0,${haut + (i + 1) * hRang})`);
    rang.append("line").attr("class", "axe").attr("x1", gauche).attr("x2", w - m.d);
    rang.append("text").attr("class", "nom-serie").attr("x", w < 520 ? 0 : gauche - 10).attr("y", w < 520 ? -hRang + 18 : -6)
      .attr("text-anchor", w < 520 ? "start" : "end").text(s => s.nom);
    rang.append("text").attr("class", "tic").attr("x", w < 520 ? w - m.d : gauche - 10).attr("y", w < 520 ? -hRang + 18 : 8)
      .attr("text-anchor", "end").text(s => `${s.n} datées`);
    rang.each(function (s) {
      d3.select(this).selectAll("rect").data(s.jours).join("rect").attr("class", "barre")
        .attr("x", j => x(date(j[0])) - larg / 2).attr("width", larg)
        .attr("y", j => -y(j[1])).attr("height", j => Math.max(1, y(j[1]))).attr("rx", Math.min(2, larg / 2))
        .on("pointerenter", (ev, j) => montrer(ev, `${s.nom} : ${j[1]} assemblée${j[1] > 1 ? "s" : ""}<small>${jourLong(date(j[0]))} 1789</small>`))
        .on("pointermove", placer).on("pointerleave", cacher);
    });
    const bas = haut + series.length * hRang;
    svg.append("g").attr("class", "tic").selectAll("text").data([date("1789-03-01"), date("1789-04-01"), date("1789-05-01")]).join("text")
      .attr("x", d => x(d)).attr("y", bas + 18).attr("text-anchor", "middle").text(d => `1er ${fr.format("%B")(d)}`);
    svg.append("line").attr("class", "reperage").attr("x1", x(ouverture)).attr("x2", x(ouverture)).attr("y1", haut).attr("y2", bas);
    svg.append("text").attr("class", "annot").attr("x", x(ouverture) - 4).attr("y", haut + 10).attr("text-anchor", "end").text("5 mai : Versailles");
  });
}

// ---------- 4. ce qui reste ----------
function reste(enLigne) {
  const barres = [
    { cle: "rediges", n: 40000, max: 60000, texte: "cahiers rédigés en 1789, à tous les niveaux", valeur: "plus de 40 000", note: "jusqu'à 60 000 selon d'autres estimations" },
    { cle: "conserves", n: 17995, texte: "cahiers manuscrits recensés en 1974", valeur: "17 995" },
    { cle: "publies", n: 11279, texte: "dont publiés (imprimés) en 1974", valeur: "11 279" },
    { cle: "en-ligne", n: enLigne.cahiers, texte: `cahiers signalés en ligne par les ${enLigne.depots} services d'archives de la carte`, valeur: nombre(enLigne.cahiers) },
  ];
  figure("fig-reste", (cadre, w) => {
    const etroit = w < 560, hB = 16, lh = 18;
    const svg = cadre.append("svg").attr("width", w).attr("role", "img")
      .attr("aria-label", "Cahiers rédigés, conservés, publiés et en ligne ; les chiffres sont écrits à côté de chaque barre");
    const x = d3.scaleLinear().domain([0, 60000]).range([0, w - 8]);
    let y = 0;
    for (const b of barres) {
      const g = svg.append("g").attr("transform", `translate(0,${y})`);
      const v = g.append("text").attr("class", "valeur").attr("y", 16).text(b.valeur);
      const dx = etroit ? 0 : v.node().getComputedTextLength() + 10;
      // le libellé, coupé en lignes qui tiennent dans la largeur restante
      const lib = g.append("text").attr("class", "libelle");
      let ligne = [], n = 0, ts = lib.append("tspan").attr("x", dx).attr("y", etroit ? 16 + lh : 16);
      for (const mot of b.texte.split(" ")) {
        ts.text([...ligne, mot].join(" "));
        if (ligne.length && ts.node().getComputedTextLength() > w - dx - 4) {
          ts.text(ligne.join(" ")); ligne = [mot]; n++;
          ts = lib.append("tspan").attr("x", dx).attr("y", (etroit ? 16 + lh : 16) + n * lh).text(mot);
        } else ligne.push(mot);
      }
      const yB = (etroit ? 16 + lh : 16) + n * lh + 8;
      if (b.max) g.append("rect").attr("class", "barre-incertaine").attr("y", yB).attr("height", hB)
        .attr("x", x(b.n) + 2).attr("width", x(b.max) - x(b.n) - 2).attr("rx", 3);
      g.append("rect").attr("class", `barre-reste ${b.cle}`).attr("y", yB).attr("height", hB).attr("width", x(b.n)).attr("rx", 3)
        .on("pointerenter", ev => montrer(ev, `${b.valeur} ${b.texte}${b.note ? `<small>${b.note}</small>` : ""}`)).on("pointermove", placer).on("pointerleave", cacher);
      y += yB + hB + 18;
    }
    svg.attr("height", y).attr("viewBox", `0 0 ${w} ${y}`);
  });
}

frise();
if (matchMedia("(max-width: 640px)").matches) document.querySelector("details.detail-frise").open = true;
fetch("reperes.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
  deputes(d.deputes);
  calendrier(d.calendrier);
  reste(d.en_ligne);
  for (const [id, v] of Object.entries({
    "n-pv": nombre(d.deputes.length),
    "n-conformes-400": (() => { const a = d.deputes.filter(o => o.feux <= 400); return `${a.filter(o => o.deputes === o.regle).length} sur ${a.length}`; })(),
    "n-conformes-plus": (() => { const a = d.deputes.filter(o => o.feux > 400); return `${a.filter(o => o.deputes === o.regle).length} sur ${a.length}`; })(),
    "n-dates": nombre(d3.sum(d.calendrier, s => s.n)),
  })) document.querySelectorAll(`[data-chiffre="${id}"]`).forEach(e => { e.textContent = v; });
});
