// Les cahiers de doléances de 1789 — page de lecture d'un document (texte.html?id=ad43:f20034).
// Le texte et la place de chaque ligne viennent de textes/<dépôt>/<identifiant>.json (textes.py), l'image de chaque
// page de images/… : survoler une ligne l'encadre sur l'image, et inversement ; cliquer une ligne l'agrandit.

const lecture = document.getElementById("lecture");
const echapper = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// ad43:f20034 → textes/ad43/f20034.json (même règle que fichier_de dans textes.py)
const fichierDe = id => { const i = id.indexOf(":"); return `textes/${id.slice(0, i)}/${id.slice(i + 1).replaceAll("/", "-")}.json`; };
// les marques du lecteur (consigne de relecture) : [?] douteux ou illisible, [~~mot~~] rayé, [en marge à gauche], [en haut]…
const marques = s => echapper(s)
  .replace(/\[~~(.*?)~~\]/g, '<del title="rayé sur le manuscrit">$1</del>')
  .replace(/\[\?\]/g, '<span class="doute" title="lecture douteuse ou mot illisible">?</span>')
  .replace(/\[(en (?:marge|haut|bas)[^\]]*|signature|paraphe|marque)\]/g, '<span class="marque">$1</span>');
const VUE = p => `vue ${p.vue}${p.moitie === "g" ? ", page de gauche" : p.moitie === "d" ? ", page de droite" : ""}`;

const id = new URLSearchParams(location.search).get("id") ?? "";
if (!/^[a-z0-9]+:[\w\/-]+$/.test(id)) erreur("Aucun document demandé.");
else fetch(fichierDe(id), { cache: "no-cache" })
  .then(r => { if (!r.ok) throw new Error(r.status === 404 ? "pas de texte publié pour ce document" : `erreur ${r.status}`); return r.json(); })
  .then(afficher)
  .catch(e => erreur(`Texte introuvable (${e.message}).`));

function erreur(message) {
  lecture.innerHTML = `<p>${echapper(message)} <a href="index.html">Retour à la carte</a>.</p>`;
}

function pageHtml(p, n) {
  const lue = p.lecteur === "opus";
  const placee = lue && p.lignes.some(l => l.c);
  // le contour de la ligne sur le manuscrit (polygone de kraken, coupé aux mots de la ligne) : x, y, x, y…
  const cadres = lue ? p.lignes.flatMap((l, k) => (l.c ?? []).map(c =>
    `<polygon data-k="${k}" points="${c.join(" ")}"/>`)).join("") : "";
  const lignes = lue ? p.lignes.map((l, k) => l.t.trim() === "//" ? "" :
    `<div class="l${l.c ? "" : " hors"}" data-k="${k}"${l.c ? "" : ' title="ligne non située sur l\'image"'}>${marques(l.t) || "&nbsp;"}</div>`).join("") : "";
  return `
    <section class="page-lue" id="p${n}">
      <h4>${VUE(p)} · ${lue ? `lu par Claude Opus 5.5${placee ? "" : " · lignes non situées sur l'image"}` : "non transcrite"}</h4>
      <div class="vis-a-vis">
        <figure class="cliche" style="--format: ${p.largeur / p.hauteur}">
          <div class="cadre" style="aspect-ratio: ${p.largeur} / ${p.hauteur}">
            <div class="plan">
              <img src="${echapper(p.image)}" alt="${echapper(VUE(p))} du manuscrit" loading="lazy" draggable="false" width="${p.largeur}" height="${p.hauteur}">
              <svg viewBox="0 0 ${p.largeur} ${p.hauteur}" preserveAspectRatio="none" aria-hidden="true">${cadres}</svg>
            </div>
          </div>
          <button type="button" class="entiere" hidden>Page entière</button>
        </figure>
        <div class="texte-lu">${lue ? lignes : `<p class="aide">Page courte (signatures, mention, page presque blanche) : le lecteur ne l'a pas relue, et le texte de la reconnaissance d'écriture n'est pas montré. L'image est là.</p>`}</div>
      </div>
    </section>`;
}

function afficher(d) {
  document.title = `${d.titre} — Les cahiers de doléances de 1789`;
  const lues = d.pages.filter(p => p.lecteur === "opus");
  const mots = lues.reduce((n, p) => n + p.lignes.reduce((m, l) => m + l.t.split(/\s+/).filter(Boolean).length, 0), 0);
  lecture.innerHTML = `
    <div class="tete">
      <h2>Transcription</h2>
      <h3 class="titre-doc">${echapper(d.titre)}</h3>
      <p class="fiche">${[d.lieu, d.bailliage ? `bailliage de ${d.bailliage}` : "", d.type, d.ordre].filter(Boolean).map(echapper).join(" · ")}<br>
        <span class="mono">${echapper(d.mention)}</span><br>${d.pages.length} page${d.pages.length > 1 ? "s" : ""}, dont ${lues.length} transcrite${lues.length > 1 ? "s" : ""} · ${mots.toLocaleString("fr-FR")} mots</p>
      <div class="avertissement">
        <p><b>Qui a lu ce texte ?</b> ${echapper(d.lecture)}</p>
        <p><b>Ce qu'il vaut.</b> ${echapper(d.qualite)} Le texte n'a pas été relu par un humain : vérifiez chaque passage sur l'image, à côté.</p>
        <p class="legende-lecture">Survoler ou toucher une ligne l'encadre sur l'image ; la cliquer l'agrandit. Marques du lecteur :
          <span class="doute">?</span> lecture douteuse ou mot illisible · <del>rayé</del> sur le manuscrit · <span class="marque">en marge</span>, <span class="marque">signature</span>, <span class="marque">paraphe</span> · <span class="hors-ex">ligne en gris</span> : non située sur l'image.</p>
        <p><a class="bouton" href="${echapper(d.notice)}" target="_blank" rel="noopener">Le document sur le site des archives ↗</a>
          <a class="bouton secondaire" id="telecharger" href="#">Télécharger le texte (.txt)</a></p>
      </div>
    </div>
    ${d.pages.map(pageHtml).join("")}
    <h2>Source et réutilisation</h2>
    <p class="aide">Manuscrit : ${echapper(d.mention)} ; images réduites des vues du portail (${echapper(d.depot)}), doubles pages coupées en deux. Conditions de réutilisation : ${echapper(d.licence)}. Méthode et mesures : <a href="a-propos.html">À propos</a>.</p>`;
  lecture.querySelectorAll(".page-lue").forEach(relier);
  document.getElementById("telecharger").addEventListener("click", ev => {
    ev.preventDefault();
    const entete = `${d.titre}\n${d.mention}\n${d.notice}\nLu par ${d.lecture}\n${d.qualite}\nTexte non relu par un humain. [?] : lecture douteuse ou illisible ; [~~…~~] : rayé.\n`;
    const corps = d.pages.map(p => `\n=== ${VUE(p)} ===\n${p.lecteur === "opus" ? p.lignes.map(l => l.t).join("\n") : "(non transcrite)"}`).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([entete + corps + "\n"], { type: "text/plain;charset=utf-8" })),
      download: `${d.id.replace(/[:/]/g, "-")}.txt`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// une page : la ligne et ses contours se désignent l'une l'autre ; un clic sur une ligne cadre l'image sur elle
function relier(section) {
  const cadre = section.querySelector(".cadre"), plan = section.querySelector(".plan");
  const svg = section.querySelector("svg"), entiere = section.querySelector(".entiere");
  const [, , W, H] = svg.getAttribute("viewBox").split(" ").map(Number);
  // l'image agrandie : échelle et décalage, toujours bornés pour ne pas sortir du cliché
  const vue = { s: 1, tx: 0, ty: 0 };
  const poser = (anime = true) => {
    const cw = cadre.clientWidth, ch = cadre.clientHeight;
    vue.tx = Math.min(0, Math.max(cw - cw * vue.s, vue.tx));
    vue.ty = Math.min(0, Math.max(ch - ch * vue.s, vue.ty));
    plan.style.transition = anime ? "" : "none";
    plan.style.transform = vue.s === 1 ? "" : `translate(${vue.tx}px, ${vue.ty}px) scale(${vue.s})`;
  };
  // glisser l'image agrandie (souris, doigt) ; un glissement n'est pas un clic
  let tir = null, glisse = false;
  cadre.addEventListener("pointerdown", ev => {
    if (vue.s === 1) return;
    ev.preventDefault();
    tir = { x: ev.clientX, y: ev.clientY, tx: vue.tx, ty: vue.ty };
    glisse = false;
    cadre.setPointerCapture(ev.pointerId);
  });
  cadre.addEventListener("pointermove", ev => {
    if (!tir) return;
    const dx = ev.clientX - tir.x, dy = ev.clientY - tir.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) glisse = true;
    vue.tx = tir.tx + dx; vue.ty = tir.ty + dy;
    poser(false);
  });
  const lacher = () => { tir = null; };
  cadre.addEventListener("pointerup", lacher);
  cadre.addEventListener("pointercancel", lacher);
  const allumer = (k, oui) => {
    section.querySelectorAll(`[data-k="${k}"]`).forEach(e => e.classList.toggle("vise", oui));
  };
  const agrandir = k => {
    const pts = [...svg.querySelectorAll(`polygon[data-k="${k}"]`)].flatMap(e => [...e.points]);
    if (!pts.length) return;
    const x0 = Math.min(...pts.map(q => q.x)), y0 = Math.min(...pts.map(q => q.y));
    const x1 = Math.max(...pts.map(q => q.x)), y1 = Math.max(...pts.map(q => q.y));
    const cw = cadre.clientWidth, ch = cadre.clientHeight, f = cw / W;
    // assez grand pour lire la main (2,5 fois au moins), le début de la ligne au bord gauche ; on fait glisser pour la suite
    const s = Math.max(2.5, Math.min(4, 0.92 * cw / ((x1 - x0) * f)));
    vue.s = s;
    vue.tx = cw * 0.04 - x0 * f * s;
    vue.ty = ch / 2 - (y0 + y1) / 2 * f * s;
    poser();
    section.querySelectorAll(".choisie").forEach(e => e.classList.remove("choisie"));
    section.querySelectorAll(`[data-k="${k}"]`).forEach(e => e.classList.add("choisie"));
    entiere.hidden = false;
  };
  entiere.addEventListener("click", () => {
    vue.s = 1;
    poser();
    section.querySelectorAll(".choisie").forEach(e => e.classList.remove("choisie"));
    entiere.hidden = true;
  });
  section.addEventListener("pointerover", ev => { const e = ev.target.closest("[data-k]"); if (e) allumer(e.dataset.k, true); });
  section.addEventListener("pointerout", ev => { const e = ev.target.closest("[data-k]"); if (e) allumer(e.dataset.k, false); });
  section.addEventListener("click", ev => {
    if (glisse) { glisse = false; return; }
    const e = ev.target.closest("[data-k]");
    if (!e) return;
    if (e.classList.contains("choisie")) entiere.click();
    else if (e.tagName === "polygon") e.closest("section").querySelector(`.l[data-k="${e.dataset.k}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else agrandir(e.dataset.k);
  });
}
