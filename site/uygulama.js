// NewsESF arayüzü. Haberleri veri/haberler.json'dan okur; filtreleme, puanlama,
// okundu takibi ve kaydetme tamamen tarayıcıda yapılır.
(() => {
  "use strict";

  const SAYFA_BOYU = 40;
  const KONTROL_ARALIGI = 5 * 60 * 1000;
  const ESKI_VERI_SAATI = 2;

  const IKON = {
    yenile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    ayar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    gunes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    ay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sistem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
    kapat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    tik: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    geri: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    yerImi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    yerImiDolu: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    katman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  };

  const RENKLER = ["#c2410c", "#1d4ed8", "#7c3aed", "#0f766e", "#0369a1", "#b45309", "#be185d", "#4d7c0f"];

  const $ = (secici, kok = document) => kok.querySelector(secici);

  // ---------------------------------------------------------------- depolama

  const depo = {
    oku(anahtar, varsayilan) {
      try {
        const deger = localStorage.getItem("newsesf." + anahtar);
        return deger == null ? varsayilan : JSON.parse(deger);
      } catch (e) {
        return varsayilan;
      }
    },
    yaz(anahtar, deger) {
      try { localStorage.setItem("newsesf." + anahtar, JSON.stringify(deger)); } catch (e) { /* gizli sekme vb. */ }
    },
  };

  const kopya = (nesne) => JSON.parse(JSON.stringify(nesne));

  // ---------------------------------------------------------------- metin

  // toplayici/topla.py içindeki sadelestir() ile aynı sonucu vermelidir.
  function sadelestir(metin) {
    return String(metin || "")
      .replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().replace(/ı/g, "i")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  const KACIS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const k = (metin) => String(metin ?? "").replace(/[&<>"']/g, (c) => KACIS[c]);
  const guvenliLink = (url) => (/^https?:\/\//i.test(url) ? url : "#");

  function kelimeDerle(ham) {
    let metin = String(ham).trim();
    let tam = false;
    const tirnak = metin.match(/^["“”'‘’](.+)["“”'‘’]$/);
    if (tirnak) { metin = tirnak[1]; tam = true; }
    const sade = sadelestir(metin);
    if (!sade) return null;
    // "AB", "BM" gibi büyük harfli kısa kısaltmalar tam eşleşir ("ABD"yi yakalamasın diye).
    if (!tam && sade.length <= 3 && !sade.includes(" ") && /\p{Lu}/u.test(metin) && metin === metin.toLocaleUpperCase("tr-TR")) tam = true;
    return { ham: metin, aranan: " " + sade + (tam ? " " : "") };
  }

  const kelimeListesi = (metin) => String(metin).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  // ---------------------------------------------------------------- zaman

  const saatBicim = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const tamBicim = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" });
  const gunBicim = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
  const bugunBicim = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function goreliZaman(ms) {
    const fark = (Date.now() - ms) / 60000;
    if (fark < 1) return "az önce";
    if (fark < 60) return `${Math.floor(fark)} dk önce`;
    if (fark < 24 * 60) return `${Math.floor(fark / 60)} sa önce`;
    const dun = new Date(); dun.setHours(0, 0, 0, 0); dun.setDate(dun.getDate() - 1);
    if (ms >= dun.getTime()) return `dün ${saatBicim.format(ms)}`;
    return `${gunBicim.format(ms)} ${saatBicim.format(ms)}`;
  }

  // ---------------------------------------------------------------- durum

  const D = {
    veri: null,
    bekleyenVeri: null,
    olaylar: [],
    filtre: null,
    derli: null,
    okunan: new Set(depo.oku("okunan", [])),
    kayitli: new Map(depo.oku("kayitli", [])),
    oncekiZiyaret: depo.oku("sonZiyaret", null),
    gorunum: Object.assign({ sekme: "onemli", kaynak: "", kategori: "", sira: "yeni", okunanGizle: true }, depo.oku("gorunum", {})),
    arama: "",
    gosterilen: SAYFA_BOYU,
  };
  depo.yaz("sonZiyaret", Date.now());

  function filtreYukle() {
    const kayitli = depo.oku("filtreler", null);
    D.filtre = kayitli && Array.isArray(kayitli.kategoriler) ? kayitli : kopya(VARSAYILAN_FILTRELER);
    D.filtre.kapaliKaynaklar = D.filtre.kapaliKaynaklar || [];
    D.filtre.haric = D.filtre.haric || [];
    filtreDerle();
  }

  function filtreDerle() {
    const f = D.filtre;
    D.derli = {
      esik: Number(f.esik) || 15,
      haric: f.haric.map(kelimeDerle).filter(Boolean),
      kategoriler: f.kategoriler.filter((kat) => kat.aktif !== false).map((kat) => ({
        ...kat,
        agirlik: Number(kat.agirlik) || 1,
        kelimeler: kat.kelimeler.map(kelimeDerle).filter(Boolean),
      })),
    };
  }

  let kayitZamanlayici;
  function filtreKaydet() {
    clearTimeout(kayitZamanlayici);
    kayitZamanlayici = setTimeout(() => depo.yaz("filtreler", D.filtre), 300);
  }

  const gorunumKaydet = () => depo.yaz("gorunum", D.gorunum);
  const okunanKaydet = () => depo.yaz("okunan", [...D.okunan]);
  const kayitliKaydet = () => depo.yaz("kayitli", [...D.kayitli]);

  // ---------------------------------------------------------------- olaylar ve puan

  function olayYap(id, haberler) {
    haberler = [...haberler].sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
    const ana = haberler[0];
    return {
      id,
      haberler,
      ana,
      ozet: (haberler.find((h) => h.ozet) || {}).ozet || "",
      gorsel: ana.gorsel || (haberler.find((h) => h.gorsel) || {}).gorsel || "",
      tarih: Date.parse(ana.tarih),
      ilk: Math.min(...haberler.map((h) => Date.parse(h.ilk || h.tarih))),
      kaynaklar: new Set(haberler.map((h) => h.kaynak)),
      kose: haberler.some((h) => h.tur === "kose"),
      b: " " + haberler.map((h) => sadelestir(h.baslik)).join("  ") + " ",
      o: " " + haberler.map((h) => sadelestir(h.ozet)).join("  ") + " ",
      p: null,
    };
  }

  function olaylariKur() {
    const kapali = new Set(D.filtre.kapaliKaynaklar);
    const gruplar = new Map();
    for (const h of D.veri.haberler) {
      if (kapali.has(h.kaynak)) continue;
      if (!gruplar.has(h.grup)) gruplar.set(h.grup, []);
      gruplar.get(h.grup).push(h);
    }
    D.olaylar = [...gruplar].map(([id, haberler]) => olayYap(id, haberler));
    puanlariHesapla();
  }

  function puanla(olay) {
    const F = D.derli;
    const haricKelime = F.haric.find((kel) => olay.b.includes(kel.aranan));
    if (haricKelime) return { haric: haricKelime.ham, puan: 0, etiketler: [] };
    let puan = 0;
    const etiketler = [];
    for (const kat of F.kategoriler) {
      let ham = 0;
      const bulunan = [];
      for (const kel of kat.kelimeler) {
        if (olay.b.includes(kel.aranan)) { ham += 3; bulunan.push(kel.ham); }
        else if (olay.o.includes(kel.aranan)) { ham += 1; bulunan.push(kel.ham); }
      }
      if (ham) {
        const p = Math.min(ham, 6) * kat.agirlik;
        puan += p;
        etiketler.push({ kat, p, bulunan });
      }
    }
    if (puan > 0) puan += Math.min(olay.kaynaklar.size - 1, 3) * 3;
    etiketler.sort((a, b) => b.p - a.p);
    return { haric: null, puan, etiketler };
  }

  function puanlariHesapla() {
    for (const olay of D.olaylar) olay.p = puanla(olay);
  }

  const okunduMu = (olay) => olay.haberler.some((h) => D.okunan.has(h.id));
  const yeniMi = (olay) => D.oncekiZiyaret != null && olay.ilk > D.oncekiZiyaret && !okunduMu(olay);

  function kayitliOlaylar() {
    return [...D.kayitli.values()]
      .sort((a, b) => b.kayit - a.kayit)
      .map((kayit) => {
        const olay = olayYap(kayit.id, kayit.haberler);
        olay.p = puanla(olay);
        return olay;
      });
  }

  function sekmeyeUyar(olay, sekme) {
    if (olay.p.haric) return false;
    if (sekme === "onemli") return olay.p.puan >= D.derli.esik;
    if (sekme === "ilgili") return olay.p.puan > 0;
    return true;
  }

  function sekmeOlaylari(sekme) {
    if (sekme === "kayitli") return kayitliOlaylar();
    let liste = D.olaylar.filter((o) => sekmeyeUyar(o, sekme));
    if (D.gorunum.okunanGizle) liste = liste.filter((o) => !okunduMu(o));
    return liste;
  }

  function gorunurOlaylar() {
    const g = D.gorunum;
    let liste = sekmeOlaylari(g.sekme);
    if (g.kaynak) liste = liste.filter((o) => o.kaynaklar.has(g.kaynak));
    if (g.kategori) liste = liste.filter((o) => o.p.etiketler.some((e) => e.kat.id === g.kategori));
    if (D.arama) {
      const terimler = sadelestir(D.arama).split(" ").filter(Boolean);
      liste = liste.filter((o) => terimler.every((t) => o.b.includes(" " + t) || o.o.includes(" " + t)));
    }
    if (g.sekme !== "kayitli") {
      liste.sort(g.sira === "onem" ? (a, b) => b.p.puan - a.p.puan || b.tarih - a.tarih : (a, b) => b.tarih - a.tarih);
    }
    return liste;
  }

  // ---------------------------------------------------------------- çizim

  const kaynakAdi = (id) => (D.veri && D.veri.kaynaklar[id] ? D.veri.kaynaklar[id].ad : id);

  function favicon(id) {
    const kaynak = D.veri && D.veri.kaynaklar[id];
    if (!kaynak || !kaynak.site) return "";
    try {
      const alan = new URL(kaynak.site).hostname;
      return `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${k(alan)}&amp;sz=64" alt="" loading="lazy">`;
    } catch (e) {
      return "";
    }
  }

  const gorselHtml = (url) =>
    `<img src="${k(guvenliLink(url))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;

  function kategoriEtiketleri(p, adet) {
    return p.etiketler.slice(0, adet).map((e) =>
      `<span class="kat" style="--renk:${k(e.kat.renk)}" title="Eşleşen: ${k(e.bulunan.join(", "))} · ${e.p} puan">${k(e.kat.ad)}</span>`).join("");
  }

  function kartHtml(olay) {
    const { ana, p } = olay;
    const okundu = okunduMu(olay);
    const onemli = p.puan >= D.derli.esik;
    const kayitli = D.kayitli.has(olay.id);
    const link = k(guvenliLink(ana.link));

    const ust = [];
    if (onemli) ust.push(`<span class="rozet onem" title="Önem puanı ${p.puan} (eşik ${D.derli.esik})">${p.puan >= D.derli.esik * 2 ? "★★" : "★"} Önemli</span>`);
    if (yeniMi(olay)) ust.push('<span class="rozet yeni">Yeni</span>');
    if (olay.kose) ust.push('<span class="rozet kose">Köşe yazısı</span>');
    ust.push(kategoriEtiketleri(p, 2));

    const digerSayi = olay.haberler.length - 1;
    const digerleri = digerSayi > 0
      ? `<ul class="diger-kaynaklar" hidden>${olay.haberler.map((h) => `
          <li><b>${favicon(h.kaynak)}${k(kaynakAdi(h.kaynak))}</b><a href="${k(guvenliLink(h.link))}" target="_blank" rel="noopener noreferrer" data-oku>${k(h.baslik)}</a><time>${k(saatBicim.format(Date.parse(h.tarih)))}</time></li>`).join("")}
        </ul>`
      : "";
    const kaynakDugmesi = digerSayi > 0
      ? `<button class="kaynak-sayisi" type="button" data-eylem="kaynaklar" aria-expanded="false"><span class="favicon-yigin">${[...olay.kaynaklar].slice(0, 3).map(favicon).join("")}</span>${olay.kaynaklar.size > 1 ? `${olay.kaynaklar.size} kaynakta` : `${olay.haberler.length} haber`}</button>`
      : "";

    const yazar = ana.yazar && olay.kose ? `<span class="ayrac"></span><span>${k(ana.yazar)}</span>` : "";
    return `
      <article class="kart${okundu ? " okundu" : ""}${olay.gorsel ? "" : " gorselsiz"}" data-id="${k(olay.id)}">
        <div class="kart-metin">
          <div class="ust-baslik">${ust.join("")}</div>
          <h2 class="kart-baslik"><a href="${link}" target="_blank" rel="noopener noreferrer" data-oku>${k(ana.baslik)}</a></h2>
          ${olay.ozet ? `<p class="kart-ozet">${k(olay.ozet)}</p>` : ""}
        </div>
        ${olay.gorsel ? `<a class="kart-gorsel" href="${link}" target="_blank" rel="noopener noreferrer" data-oku tabindex="-1" aria-hidden="true">${gorselHtml(olay.gorsel)}</a>` : ""}
        <div class="kart-alt">
          <span class="kaynak-imza">${favicon(ana.kaynak)}${k(kaynakAdi(ana.kaynak))}</span>${yazar}
          <span class="ayrac"></span>
          <time datetime="${k(ana.tarih)}" title="${k(tamBicim.format(olay.tarih))}">${k(goreliZaman(olay.tarih))}</time>
          ${kaynakDugmesi}
          <span class="kart-eylem">
            <button class="ikon-dugme" type="button" data-eylem="kaydet" aria-pressed="${kayitli}" title="${kayitli ? "Kayıtlardan çıkar" : "Sonra okumak için kaydet"}">${kayitli ? IKON.yerImiDolu : IKON.yerImi}</button>
            <button class="ikon-dugme" type="button" data-eylem="okundu" aria-pressed="${okundu}" title="${okundu ? "Okunmadı yap" : "Okundu işaretle"}">${okundu ? IKON.geri : IKON.tik}</button>
          </span>
        </div>
        ${digerleri}
      </article>`;
  }

  function mansetKartHtml(olay) {
    const { ana, p } = olay;
    const ilkEtiket = p.etiketler[0];
    const etiketler = [];
    if (p.puan >= D.derli.esik) etiketler.push('<span class="manset-etiket">Önemli</span>');
    if (ilkEtiket) etiketler.push(`<span class="manset-etiket" style="--renk:${k(ilkEtiket.kat.renk)}">${k(ilkEtiket.kat.ad)}</span>`);
    return `
      <a class="manset-kart" href="${k(guvenliLink(ana.link))}" target="_blank" rel="noopener noreferrer" data-id="${k(olay.id)}">
        ${gorselHtml(olay.gorsel)}
        <div class="manset-icerik">
          ${etiketler.length ? `<div class="manset-ust">${etiketler.join("")}</div>` : ""}
          <h2 class="manset-baslik">${k(ana.baslik)}</h2>
          <div class="manset-alt">${favicon(ana.kaynak)}<span>${k(kaynakAdi(ana.kaynak))}</span><span>·</span><span>${k(goreliZaman(olay.tarih))}</span>${olay.kaynaklar.size > 1 ? `<span>·</span><span>${olay.kaynaklar.size} kaynakta</span>` : ""}</div>
        </div>
      </a>`;
  }

  // Listenin en yeni haberleri arasından fotoğraflı en önemli üçü manşete çıkar.
  function mansetSec(liste) {
    if (D.gorunum.sekme === "kayitli" || D.arama) return [];
    const adaylar = liste.slice(0, 40).filter((o) => o.gorsel && !okunduMu(o) && o.p.puan > 0)
      .sort((a, b) => b.p.puan - a.p.puan || b.tarih - a.tarih)
      .slice(0, 3);
    return adaylar.length === 3 ? adaylar : [];
  }

  function bosMesaj() {
    const g = D.gorunum;
    if (D.arama || g.kaynak || g.kategori) return ["Eşleşen haber yok", "Aramayı ya da seçili süzgeçleri değiştirmeyi deneyin."];
    if (g.sekme === "kayitli") return ["Henüz kaydedilen haber yok", "Bir haberin yer imi düğmesine basınca burada saklanır; kaynak listeden düşse bile kaybolmaz."];
    if (g.okunanGizle && D.olaylar.some((o) => sekmeyeUyar(o, g.sekme) && okunduMu(o))) {
      return ["Hepsini okudunuz", "Yeni haberler geldikçe burada görünecek. Okunanları görmek için “Okunanları gizle”yi kapatın."];
    }
    if (g.sekme === "onemli") return ["Şu an önemli haber yok", "Ayarlar'dan önem eşiğini düşürebilir ya da İlgili sekmesine bakabilirsiniz."];
    return ["Haber bulunamadı", ""];
  }

  let gorunurCache = [];

  function listeyiCiz() {
    gorunurCache = gorunurOlaylar();
    const manset = mansetSec(gorunurCache);
    const mansetKutu = $("#manset");
    mansetKutu.hidden = !manset.length;
    mansetKutu.innerHTML = manset.map(mansetKartHtml).join("");

    const mansetteki = new Set(manset.map((o) => o.id));
    const kalanlar = gorunurCache.filter((o) => !mansetteki.has(o.id));
    const liste = $("#liste");
    if (!gorunurCache.length) {
      const [baslik, metin] = bosMesaj();
      liste.innerHTML = `<p class="bos"><b>${k(baslik)}</b>${k(metin)}</p>`;
    } else {
      liste.innerHTML = kalanlar.slice(0, D.gosterilen).map(kartHtml).join("");
    }
    const kalan = kalanlar.length - D.gosterilen;
    const daha = $("#dahaFazla");
    daha.hidden = kalan <= 0;
    daha.textContent = `Daha fazla göster (${kalan} haber daha)`;
    $("#hepsiOkundu").setAttribute("aria-disabled", String(!gorunurCache.length || D.gorunum.sekme === "kayitli"));
    sayilariCiz();
  }

  function sayilariCiz() {
    for (const dugme of document.querySelectorAll("#sekmeler button")) {
      const sekme = dugme.dataset.sekme;
      dugme.setAttribute("aria-selected", String(sekme === D.gorunum.sekme));
      $(".sayi", dugme).textContent = D.veri || sekme === "kayitli" ? sekmeOlaylari(sekme).length : "";
    }
    ciplerCiz();
  }

  function ciplerCiz() {
    const kenar = $(".kenar");
    kenar.hidden = D.gorunum.sekme === "kayitli" || !D.veri;
    if (kenar.hidden) return;
    const temel = sekmeOlaylari(D.gorunum.sekme);

    const kategoriler = D.derli.kategoriler.map((kat) => {
      const adet = temel.filter((o) => o.p.etiketler.some((e) => e.kat.id === kat.id)).length;
      return `<button class="cip" type="button" data-kategori="${k(kat.id)}" aria-pressed="${D.gorunum.kategori === kat.id}" style="--renk:${k(kat.renk)}"><span class="nokta"></span><span class="ad">${k(kat.ad)}</span><span class="sayi">${adet}</span></button>`;
    });
    $("#kategoriCipleri").innerHTML =
      `<button class="cip" type="button" data-kategori="" aria-pressed="${!D.gorunum.kategori}"><span class="nokta"></span><span class="ad">Tüm kategoriler</span><span class="sayi">${temel.length}</span></button>` + kategoriler.join("");

    const kapali = new Set(D.filtre.kapaliKaynaklar);
    const kaynaklar = Object.keys(D.veri.kaynaklar).filter((id) => !kapali.has(id));
    if (!kaynaklar.includes(D.gorunum.kaynak)) D.gorunum.kaynak = "";
    const satirlar = kaynaklar
      .map((id) => ({ id, adet: temel.filter((o) => o.kaynaklar.has(id)).length }))
      .sort((a, b) => b.adet - a.adet)
      .map(({ id, adet }) => `<button class="cip" type="button" data-kaynak-filtre="${k(id)}" aria-pressed="${D.gorunum.kaynak === id}">${favicon(id)}<span class="ad">${k(kaynakAdi(id))}</span><span class="sayi">${adet}</span></button>`);
    $("#kaynakCipleri").innerHTML =
      `<button class="cip" type="button" data-kaynak-filtre="" aria-pressed="${!D.gorunum.kaynak}"><span class="nokta"></span><span class="ad">Tüm kaynaklar</span><span class="sayi">${temel.length}</span></button>` + satirlar.join("");
  }

  function guncellemeCiz() {
    $("#bugun").textContent = bugunBicim.format(new Date());
    const alan = $("#guncelleme");
    if (!D.veri) return;
    const zaman = Date.parse(D.veri.guncelleme);
    const eski = Date.now() - zaman > ESKI_VERI_SAATI * 3600 * 1000;
    alan.classList.toggle("eski", eski);
    alan.textContent = `Güncellendi ${goreliZaman(zaman)}`;
    alan.title = eski
      ? `Veri ${tamBicim.format(zaman)} tarihinden beri güncellenmedi. GitHub Actions çalışıyor mu?`
      : tamBicim.format(zaman);
  }

  function temaCiz() {
    const tema = depo.oku("tema", "");
    const dugme = $("#temaDugme");
    dugme.innerHTML = tema === "dark" ? IKON.ay : tema === "light" ? IKON.gunes : IKON.sistem;
    dugme.title = `Tema: ${tema === "dark" ? "koyu" : tema === "light" ? "açık" : "sistem"}`;
  }

  let tostZamanlayici;
  function tost(mesaj) {
    const kutu = $("#tost");
    kutu.textContent = mesaj;
    kutu.classList.add("gorunur");
    clearTimeout(tostZamanlayici);
    tostZamanlayici = setTimeout(() => kutu.classList.remove("gorunur"), 2600);
  }

  // ---------------------------------------------------------------- veri

  async function veriGetir() {
    const yanit = await fetch(`veri/haberler.json?t=${Date.now()}`, { cache: "no-store" });
    if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
    return yanit.json();
  }

  function veriyiUygula(veri) {
    D.veri = veri;
    D.bekleyenVeri = null;
    $("#yeniBildirim").hidden = true;
    // Artık listede olmayan haberlerin okundu kaydını temizle.
    const idler = new Set(veri.haberler.map((h) => h.id));
    const once = D.okunan.size;
    for (const id of D.okunan) if (!idler.has(id)) D.okunan.delete(id);
    if (D.okunan.size !== once) okunanKaydet();
    olaylariKur();
    guncellemeCiz();
    listeyiCiz();
  }

  async function ilkYukleme() {
    const dugme = $("#yenileDugme");
    dugme.classList.add("donuyor");
    try {
      veriyiUygula(await veriGetir());
    } catch (hata) {
      $("#liste").innerHTML = `<p class="bos"><b>Haberler yüklenemedi</b>${k(hata.message)}. Site yeni kurulduysa toplayıcının ilk kez çalışmasını bekleyin; bilgisayarda deniyorsanız README'deki yerel çalıştırma adımlarına bakın.</p>`;
    } finally {
      dugme.classList.remove("donuyor");
    }
  }

  let sonKontrol = 0;
  async function yeniVeriKontrol(elle) {
    if (!elle && Date.now() - sonKontrol < 60 * 1000) return;
    sonKontrol = Date.now();
    const dugme = $("#yenileDugme");
    dugme.classList.add("donuyor");
    try {
      // Önce küçük son.json'a bak; büyük dosyayı yalnızca veri değiştiyse indir.
      if (D.veri) {
        const son = await fetch(`veri/son.json?t=${Date.now()}`, { cache: "no-store" }).then((y) => (y.ok ? y.json() : null)).catch(() => null);
        if (son && son.guncelleme === D.veri.guncelleme) {
          if (elle) tost("Liste güncel");
          return;
        }
      }
      const veri = await veriGetir();
      if (!D.veri || veri.guncelleme !== D.veri.guncelleme) {
        const eskiIdler = new Set(D.veri ? D.veri.haberler.map((h) => h.id) : []);
        const yeniSayi = veri.haberler.filter((h) => !eskiIdler.has(h.id)).length;
        if (elle || !D.veri) {
          veriyiUygula(veri);
          tost(yeniSayi ? `${yeniSayi} yeni haber eklendi` : "Liste güncel");
        } else if (yeniSayi) {
          // Okurken liste kaymasın; kullanıcı isteyince göster.
          D.bekleyenVeri = veri;
          const bildirim = $("#yeniBildirim");
          bildirim.textContent = `${yeniSayi} yeni haber geldi · Göster`;
          bildirim.hidden = false;
        } else {
          D.veri.guncelleme = veri.guncelleme;
          D.veri.durum = veri.durum;
        }
      } else if (elle) {
        tost("Liste güncel");
      }
      guncellemeCiz();
    } catch (hata) {
      if (elle) tost("Bağlantı hatası, sonra tekrar deneyin");
    } finally {
      dugme.classList.remove("donuyor");
    }
  }

  // ---------------------------------------------------------------- liste eylemleri

  const olayBul = (id) => D.olaylar.find((o) => o.id === id) || kayitliOlaylar().find((o) => o.id === id);

  function okunduYap(olay, deger) {
    for (const h of olay.haberler) deger ? D.okunan.add(h.id) : D.okunan.delete(h.id);
    // Gruba sonradan katılan haberler de okunmuş sayılsın diye canlı veri üzerinden de işaretle.
    const canli = D.olaylar.find((o) => o.id === olay.id);
    if (canli) for (const h of canli.haberler) deger ? D.okunan.add(h.id) : D.okunan.delete(h.id);
    okunanKaydet();
  }

  function kartiYenile(kart, olay) {
    const yeni = document.createElement("div");
    yeni.innerHTML = kartHtml(olay).trim();
    kart.replaceWith(yeni.firstElementChild);
  }

  function kartiKaldir(kart) {
    kart.classList.add("kayboluyor");
    setTimeout(() => { kart.remove(); if (!$("#liste .kart")) listeyiCiz(); else sayilariCiz(); }, 250);
  }

  function mansetTiklama(olayNesnesi) {
    const kart = olayNesnesi.target.closest(".manset-kart");
    if (!kart || (olayNesnesi.type === "auxclick" && olayNesnesi.button !== 1)) return;
    const olay = olayBul(kart.dataset.id);
    if (olay && !okunduMu(olay)) { okunduYap(olay, true); sayilariCiz(); }
  }

  function listeTiklama(olayNesnesi) {
    const kart = olayNesnesi.target.closest(".kart");
    if (!kart) return;
    const olay = olayBul(kart.dataset.id);
    if (!olay) return;

    if (olayNesnesi.target.closest("a[data-oku]")) {
      if (olayNesnesi.type === "auxclick" && olayNesnesi.button !== 1) return;
      if (!okunduMu(olay)) {
        okunduYap(olay, true);
        // Haber yeni sekmede açılırken kart yerinde kalsın, sadece soluklaşsın.
        kart.classList.add("okundu");
        sayilariCiz();
      }
      return;
    }
    if (olayNesnesi.type !== "click") return;
    const eylem = olayNesnesi.target.closest("[data-eylem]");
    if (!eylem) return;

    if (eylem.dataset.eylem === "kaynaklar") {
      const liste = $(".diger-kaynaklar", kart);
      liste.hidden = !liste.hidden;
      eylem.setAttribute("aria-expanded", String(!liste.hidden));
    } else if (eylem.dataset.eylem === "okundu") {
      const yeniDeger = !okunduMu(olay);
      okunduYap(olay, yeniDeger);
      if (yeniDeger && D.gorunum.okunanGizle && D.gorunum.sekme !== "kayitli") kartiKaldir(kart);
      else { kartiYenile(kart, olay); sayilariCiz(); }
    } else if (eylem.dataset.eylem === "kaydet") {
      if (D.kayitli.has(olay.id)) {
        D.kayitli.delete(olay.id);
        tost("Kayıtlardan çıkarıldı");
      } else {
        const haberler = olay.haberler.map(({ id, kaynak, baslik, ozet, link, tarih, ilk, tur, yazar, gorsel }) => ({ id, kaynak, baslik, ozet, link, tarih, ilk, tur, yazar, gorsel, grup: olay.id }));
        D.kayitli.set(olay.id, { id: olay.id, kayit: Date.now(), haberler });
        tost("Kaydedildi");
      }
      kayitliKaydet();
      if (D.gorunum.sekme === "kayitli" && !D.kayitli.has(olay.id)) kartiKaldir(kart);
      else { kartiYenile(kart, olay); sayilariCiz(); }
    }
  }

  function gorunumDegisti() {
    D.gosterilen = SAYFA_BOYU;
    gorunumKaydet();
    listeyiCiz();
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------- ayarlar

  function depoAdresi() {
    const host = location.hostname;
    if (!host.endsWith(".github.io")) return null;
    const kullanici = host.split(".")[0];
    const ilk = location.pathname.split("/").filter(Boolean)[0];
    const repo = ilk && !ilk.includes(".") ? ilk : host;
    return `https://github.com/${kullanici}/${repo}`;
  }

  function kategoriDuzenleyiciCiz() {
    const kutu = $("#kategoriDuzenleyici");
    kutu.innerHTML = D.filtre.kategoriler.map((kat, i) => `
      <div class="kat-duzen${kat.aktif === false ? " kapali" : ""}" data-i="${i}">
        <div class="kat-satir">
          <input type="color" data-alan="renk" value="${k(kat.renk)}" aria-label="Renk">
          <input type="text" class="kat-ad" data-alan="ad" value="${k(kat.ad)}" aria-label="Kategori adı">
          <select data-alan="agirlik" aria-label="Ağırlık">
            ${[1, 2, 3, 4, 5].map((a) => `<option value="${a}"${Number(kat.agirlik) === a ? " selected" : ""}>Ağırlık ${a}${["", " · düşük", "", " · normal", "", " · çok yüksek"][a]}</option>`).join("")}
          </select>
          <label class="anahtar"><input type="checkbox" data-alan="aktif"${kat.aktif !== false ? " checked" : ""}> Açık</label>
          <button class="metin-dugme tehlike" type="button" data-sil="${i}">Sil</button>
        </div>
        <label>Kelimeler (virgülle ayırın)
          <textarea rows="3" data-alan="kelimeler" spellcheck="false">${k(kat.kelimeler.join(", "))}</textarea>
        </label>
        <p class="kat-bilgi" data-bilgi="${k(kat.id)}"></p>
      </div>`).join("");
    ayarBilgileriniCiz();
  }

  function ayarBilgileriniCiz() {
    for (const kat of D.filtre.kategoriler) {
      const alan = document.querySelector(`[data-bilgi="${CSS.escape(kat.id)}"]`);
      if (!alan) continue;
      if (kat.aktif === false) { alan.textContent = "Kapalı: bu kategori puana katılmıyor."; continue; }
      const adet = D.olaylar.filter((o) => o.p.etiketler.some((e) => e.kat.id === kat.id)).length;
      alan.textContent = `${kat.kelimeler.length} kelime · şu an ${adet} haberle eşleşiyor`;
    }
    const esik = D.derli.esik;
    $("#esik").value = esik;
    $("#esikDeger").textContent = esik;
    const onemli = D.olaylar.filter((o) => !o.p.haric && o.p.puan >= esik).length;
    $("#esikBilgi").textContent = `Şu an ${onemli} haber önemli sayılıyor (toplam ${D.olaylar.length} haber).`;
    const haric = D.olaylar.filter((o) => o.p.haric).length;
    $("#haricBilgi").textContent = `Bu kurallar şu an ${haric} haberi gizliyor.`;
  }

  function kaynakListesiCiz() {
    const kutu = $("#kaynakListesi");
    if (!D.veri) { kutu.innerHTML = '<p class="aciklama">Veri yüklenince kaynaklar burada listelenir.</p>'; return; }
    const kapali = new Set(D.filtre.kapaliKaynaklar);
    kutu.innerHTML = Object.entries(D.veri.kaynaklar).map(([id, kay]) => {
      const durum = (D.veri.durum || {})[id];
      let durumHtml = "";
      if (durum) {
        durumHtml = durum.basarili
          ? `<span class="kaynak-durum" title="${k(durum.hata || "Sorunsuz okundu")}">${durum.hata ? "⚠ " : "✓ "}${durum.adet} haber</span>`
          : `<span class="kaynak-durum hata" title="${k(durum.hata || "")}">✗ okunamadı</span>`;
      }
      return `<div class="kaynak-satir">
          <label class="anahtar"><input type="checkbox" data-kaynak="${k(id)}"${kapali.has(id) ? "" : " checked"}> ${k(kay.ad)}</label>
          ${durumHtml}
        </div>`;
    }).join("");
  }

  function yeniKaynakJsonCiz() {
    const ad = $("#yeniKaynakAd").value.trim() || "Kaynak adı";
    const rss = $("#yeniKaynakRss").value.trim() || "https://www.ornek.com/rss";
    let site = "";
    try { site = new URL(rss).origin; } catch (e) { site = "https://www.ornek.com"; }
    const id = sadelestir(ad).replace(/ /g, "-") || "yeni-kaynak";
    const json = JSON.stringify({ id, ad, site, rss: [rss] }, null, 2);
    $("#yeniKaynakJson").textContent = json.replace(/^/gm, "    ") + ",";
    const repo = depoAdresi();
    const link = $("#githubDuzenle");
    if (repo) {
      link.href = `${repo}/edit/main/kaynaklar.json`;
      link.removeAttribute("aria-disabled");
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.title = "Site GitHub Pages'te yayınlanınca bu düğme çalışır.";
    }
  }

  function ayarlariAc() {
    kategoriDuzenleyiciCiz();
    $("#haricKelimeler").value = D.filtre.haric.join(", ");
    kaynakListesiCiz();
    yeniKaynakJsonCiz();
    $("#ayarlar").showModal();
  }

  function filtreDegisti({ kaynaklar = false } = {}) {
    filtreDerle();
    filtreKaydet();
    if (D.veri) {
      if (kaynaklar) olaylariKur(); else puanlariHesapla();
    }
    if (D.gorunum.kategori && !D.derli.kategoriler.some((kat) => kat.id === D.gorunum.kategori)) D.gorunum.kategori = "";
    ayarBilgileriniCiz();
    D.gosterilen = SAYFA_BOYU;
    listeyiCiz();
  }

  let yazmaZamanlayici;
  function kategoriAlaniDegisti(hedef) {
    const kutu = hedef.closest(".kat-duzen");
    if (!kutu || !hedef.dataset.alan) return;
    const kat = D.filtre.kategoriler[Number(kutu.dataset.i)];
    const alan = hedef.dataset.alan;
    if (alan === "aktif") { kat.aktif = hedef.checked; kutu.classList.toggle("kapali", !hedef.checked); }
    else if (alan === "agirlik") kat.agirlik = Number(hedef.value);
    else if (alan === "kelimeler") kat.kelimeler = kelimeListesi(hedef.value);
    else kat[alan] = hedef.value;
    clearTimeout(yazmaZamanlayici);
    yazmaZamanlayici = setTimeout(() => filtreDegisti(), alan === "kelimeler" || alan === "ad" ? 400 : 100);
  }

  function disaAktar() {
    const icerik = { uygulama: "NewsESF", surum: 1, tarih: new Date().toISOString(), filtreler: D.filtre, kayitli: [...D.kayitli], okunan: [...D.okunan] };
    const blob = new Blob([JSON.stringify(icerik, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `newsesf-ayarlar-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function iceAktar(dosya) {
    try {
      const icerik = JSON.parse(await dosya.text());
      const filtre = icerik.filtreler || icerik;
      if (!Array.isArray(filtre.kategoriler)) throw new Error("geçersiz dosya");
      D.filtre = filtre;
      if (Array.isArray(icerik.kayitli)) { D.kayitli = new Map([...D.kayitli, ...icerik.kayitli]); kayitliKaydet(); }
      if (Array.isArray(icerik.okunan)) { for (const id of icerik.okunan) D.okunan.add(id); okunanKaydet(); }
      depo.yaz("filtreler", D.filtre);
      filtreDerle();
      filtreDegisti({ kaynaklar: true });
      ayarlariAc();
      tost("Ayarlar içe aktarıldı");
    } catch (hata) {
      tost("Dosya okunamadı: NewsESF yedeği olduğundan emin olun");
    }
  }

  // ---------------------------------------------------------------- olaylar

  function baglantilariKur() {
    $("#yenileDugme").innerHTML = IKON.yenile;
    $("#ayarDugme").innerHTML = IKON.ayar;
    $("#ayarKapat").innerHTML = IKON.kapat;
    temaCiz();

    $("#sekmeler").addEventListener("click", (e) => {
      const dugme = e.target.closest("button[data-sekme]");
      if (!dugme || dugme.dataset.sekme === D.gorunum.sekme) return;
      D.gorunum.sekme = dugme.dataset.sekme;
      gorunumDegisti();
    });
    $("#kategoriCipleri").addEventListener("click", (e) => {
      const cip = e.target.closest("[data-kategori]");
      if (!cip) return;
      D.gorunum.kategori = D.gorunum.kategori === cip.dataset.kategori ? "" : cip.dataset.kategori;
      gorunumDegisti();
    });

    let aramaZamanlayici;
    $("#arama").addEventListener("input", (e) => {
      clearTimeout(aramaZamanlayici);
      aramaZamanlayici = setTimeout(() => { D.arama = e.target.value; gorunumDegisti(); }, 200);
    });
    $("#kaynakCipleri").addEventListener("click", (e) => {
      const cip = e.target.closest("[data-kaynak-filtre]");
      if (!cip) return;
      D.gorunum.kaynak = D.gorunum.kaynak === cip.dataset.kaynakFiltre ? "" : cip.dataset.kaynakFiltre;
      gorunumDegisti();
    });
    $("#manset").addEventListener("click", mansetTiklama);
    $("#manset").addEventListener("auxclick", mansetTiklama);
    // Yüklenemeyen fotoğraf ve logoları gizle; kart fotoğrafsız düzene geçsin.
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const kartGorsel = img.closest(".kart-gorsel");
      if (kartGorsel) { kartGorsel.closest(".kart").classList.add("gorselsiz"); kartGorsel.remove(); }
      else img.remove();
    }, true);
    $("#siraSec").value = D.gorunum.sira;
    $("#siraSec").addEventListener("change", (e) => { D.gorunum.sira = e.target.value; gorunumDegisti(); });
    $("#okunanGizle").checked = D.gorunum.okunanGizle;
    $("#okunanGizle").addEventListener("change", (e) => { D.gorunum.okunanGizle = e.target.checked; gorunumDegisti(); });

    $("#hepsiOkundu").addEventListener("click", () => {
      const liste = gorunurCache.filter((o) => !okunduMu(o));
      if (!liste.length) return;
      if (!confirm(`Bu listedeki ${liste.length} haber okundu olarak işaretlensin mi?`)) return;
      for (const olay of liste) okunduYap(olay, true);
      listeyiCiz();
      tost(`${liste.length} haber okundu sayıldı`);
    });

    const liste = $("#liste");
    liste.addEventListener("click", listeTiklama);
    liste.addEventListener("auxclick", listeTiklama);
    $("#dahaFazla").addEventListener("click", () => { D.gosterilen += SAYFA_BOYU; listeyiCiz(); });
    $("#yeniBildirim").addEventListener("click", () => {
      if (D.bekleyenVeri) veriyiUygula(D.bekleyenVeri);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("#yenileDugme").addEventListener("click", () => yeniVeriKontrol(true));
    $("#temaDugme").addEventListener("click", () => {
      const sira = ["", "light", "dark"];
      const yeni = sira[(sira.indexOf(depo.oku("tema", "")) + 1) % sira.length];
      depo.yaz("tema", yeni);
      if (yeni) document.documentElement.dataset.theme = yeni; else delete document.documentElement.dataset.theme;
      temaCiz();
    });

    // Ayarlar penceresi
    const pencere = $("#ayarlar");
    $("#ayarDugme").addEventListener("click", ayarlariAc);
    $("#ayarKapat").addEventListener("click", () => pencere.close());
    pencere.addEventListener("click", (e) => { if (e.target === pencere) pencere.close(); });

    const duzenleyici = $("#kategoriDuzenleyici");
    duzenleyici.addEventListener("input", (e) => kategoriAlaniDegisti(e.target));
    duzenleyici.addEventListener("change", (e) => kategoriAlaniDegisti(e.target));
    duzenleyici.addEventListener("click", (e) => {
      const sil = e.target.closest("[data-sil]");
      if (!sil) return;
      const kat = D.filtre.kategoriler[Number(sil.dataset.sil)];
      if (!confirm(`“${kat.ad}” kategorisi silinsin mi?`)) return;
      D.filtre.kategoriler.splice(Number(sil.dataset.sil), 1);
      kategoriDuzenleyiciCiz();
      filtreDegisti();
    });
    $("#kategoriEkle").addEventListener("click", () => {
      const sira = D.filtre.kategoriler.length;
      D.filtre.kategoriler.push({ id: `kategori-${Date.now().toString(36)}`, ad: "Yeni kategori", renk: RENKLER[sira % RENKLER.length], agirlik: 2, aktif: true, kelimeler: [] });
      kategoriDuzenleyiciCiz();
      filtreDegisti();
      const son = duzenleyici.lastElementChild;
      son.scrollIntoView({ behavior: "smooth", block: "center" });
      $(".kat-ad", son).select();
    });

    $("#esik").addEventListener("input", (e) => {
      D.filtre.esik = Number(e.target.value);
      $("#esikDeger").textContent = e.target.value;
      clearTimeout(yazmaZamanlayici);
      yazmaZamanlayici = setTimeout(() => filtreDegisti(), 150);
    });
    $("#haricKelimeler").addEventListener("input", (e) => {
      D.filtre.haric = kelimeListesi(e.target.value);
      clearTimeout(yazmaZamanlayici);
      yazmaZamanlayici = setTimeout(() => filtreDegisti(), 400);
    });
    $("#kaynakListesi").addEventListener("change", (e) => {
      const id = e.target.dataset.kaynak;
      if (!id) return;
      const kapali = new Set(D.filtre.kapaliKaynaklar);
      e.target.checked ? kapali.delete(id) : kapali.add(id);
      D.filtre.kapaliKaynaklar = [...kapali];
      filtreDegisti({ kaynaklar: true });
    });

    $("#yeniKaynakAd").addEventListener("input", yeniKaynakJsonCiz);
    $("#yeniKaynakRss").addEventListener("input", yeniKaynakJsonCiz);
    $("#jsonKopyala").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("#yeniKaynakJson").textContent);
        tost("Kopyalandı");
      } catch (e) {
        tost("Kopyalanamadı; metni seçip elle kopyalayın");
      }
    });

    $("#disaAktar").addEventListener("click", disaAktar);
    $("#iceAktar").addEventListener("change", (e) => { if (e.target.files[0]) iceAktar(e.target.files[0]); e.target.value = ""; });
    $("#varsayilanaDon").addEventListener("click", () => {
      if (!confirm("Filtreleriniz varsayılan Siyaset Bilimi ve Kamu Yönetimi filtreleriyle değiştirilsin mi?")) return;
      D.filtre = kopya(VARSAYILAN_FILTRELER);
      depo.yaz("filtreler", D.filtre);
      filtreDegisti({ kaynaklar: true });
      ayarlariAc();
      tost("Varsayılan filtreler yüklendi");
    });
    $("#okunanSifirla").addEventListener("click", () => {
      if (!confirm("Tüm okundu işaretleri silinsin mi?")) return;
      D.okunan.clear();
      okunanKaydet();
      listeyiCiz();
      tost("Okunma geçmişi silindi");
    });

    // Sekme arka plandayken de yeni veri kontrolü sürsün; geri dönünce hemen bak.
    setInterval(() => yeniVeriKontrol(false), KONTROL_ARALIGI);
    setInterval(guncellemeCiz, 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) yeniVeriKontrol(false); });
  }

  filtreYukle();
  baglantilariKur();
  guncellemeCiz();
  sayilariCiz();
  ilkYukleme();
})();
