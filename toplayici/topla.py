"""NewsESF haber toplayıcı.

kaynaklar.json'daki RSS beslemelerini ve sayfaları okur, yeni haberleri önceki
verilerle birleştirir, aynı olayı anlatan haberleri gruplar ve
site/veri/haberler.json dosyasını yazar. GitHub Actions bunu her 30 dakikada
bir çalıştırır; elle çalıştırmak için: python toplayici/topla.py
"""

import calendar
import hashlib
import html
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import feedparser
import requests
from bs4 import BeautifulSoup

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KAYNAK_DOSYASI = os.path.join(KOK, "kaynaklar.json")
CIKTI_DOSYASI = os.path.join(KOK, "site", "veri", "haberler.json")

# Bir önceki çalışmanın verisi. GitHub Actions'ta yayındaki sitenin adresi verilir,
# böylece geçmiş haberler repo'ya commit edilmeden korunur.
ONCEKI_VERI_URL = os.environ.get("ONCEKI_VERI_URL")

TURKIYE = timezone(timedelta(hours=3))
OZET_UZUNLUK = 280
SAYFA_BASINA_LINK = 40
DETAY_SINIRI = 60  # Kaynak başına, bir çalışmada açılacak en fazla haber sayfası
EN_FAZLA_HABER = 8000

TARAYICI = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
OKUYUCU = "NewsESF/1.0 (RSS okuyucu)"

OTURUM = requests.Session()
OTURUM.headers.update({"User-Agent": TARAYICI, "Accept-Language": "tr-TR,tr;q=0.9"})

TAKIP_PARAMETRELERI = re.compile(r"^(utm_|fbclid|gclid|ref$|ref_|from$|cmpid|ito$)", re.I)


def log(mesaj):
    print(mesaj, flush=True)


def getir(url, rss=False):
    """Adresi indirir; hata alırsa diğer tarayıcı kimliğiyle bir kez daha dener.

    Bazı siteler (ör. Euronews) tarayıcı kimliğiyle gelen RSS isteklerini reddediyor,
    bazıları da tanımadıkları kimlikleri; bu yüzden iki kimlik sırayla denenir.
    """
    kimlikler = (OKUYUCU, TARAYICI) if rss else (TARAYICI, OKUYUCU)
    tur = "application/rss+xml" if rss else "text/html"
    for deneme, kimlik in enumerate(kimlikler):
        son_deneme = deneme == len(kimlikler) - 1
        try:
            yanit = OTURUM.get(url, headers={"User-Agent": kimlik, "Accept": tur}, timeout=25)
        except requests.RequestException:
            if son_deneme:
                raise
            continue
        if yanit.ok or son_deneme:
            yanit.raise_for_status()
            return yanit


# ---------------------------------------------------------------- metin işleme

def sadelestir(metin):
    """Karşılaştırma için metni küçük harfe çevirir, Türkçe karakterleri sadeleştirir.

    site/uygulama.js içindeki sadelestir() ile aynı sonucu vermelidir.
    """
    metin = (metin or "").replace("İ", "i").replace("I", "ı").lower().replace("ı", "i")
    metin = unicodedata.normalize("NFKD", metin)
    metin = "".join(c for c in metin if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", metin).strip()


def temiz_metin(metin):
    if not metin:
        return ""
    if "<" in metin:
        metin = BeautifulSoup(metin, "html.parser").get_text(" ")
    metin = html.unescape(html.unescape(metin))
    return re.sub(r"\s+", " ", metin).strip()


def ozet_hazirla(ham, baslik):
    ozet = temiz_metin(ham)
    if not ozet or sadelestir(ozet).startswith(sadelestir(baslik)):
        return ""
    if len(ozet) > OZET_UZUNLUK:
        ozet = ozet[:OZET_UZUNLUK].rsplit(" ", 1)[0].rstrip(",;:.-") + "…"
    return ozet


def url_normallestir(url):
    parca = urlsplit(url.strip())
    sorgu = [(k, v) for k, v in parse_qsl(parca.query, keep_blank_values=True)
             if not TAKIP_PARAMETRELERI.match(k)]
    host = parca.netloc.lower().removeprefix("www.")
    yol = parca.path.rstrip("/") or "/"
    return urlunsplit(("https", host, yol, urlencode(sorgu), ""))


def haber_kimligi(url):
    return hashlib.sha1(url_normallestir(url).encode()).hexdigest()[:12]


def iso(zaman):
    return zaman.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_oku(metin):
    try:
        zaman = datetime.fromisoformat(metin.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return zaman if zaman.tzinfo else zaman.replace(tzinfo=TURKIYE)


# ---------------------------------------------------------------- okuyucular

def rss_oku(url):
    besleme = feedparser.parse(getir(url, rss=True).content)
    if not besleme.entries:
        hata = getattr(besleme, "bozo_exception", None)
        raise ValueError(f"RSS boş ya da okunamadı{f': {hata}' if hata else ''}")
    for e in besleme.entries:
        link, baslik = e.get("link"), temiz_metin(e.get("title"))
        if not link or not baslik:
            continue
        zaman = e.get("published_parsed") or e.get("updated_parsed")
        yield {
            "link": link,
            "baslik": baslik,
            "ozet": ozet_hazirla(e.get("summary") or e.get("description"), baslik),
            "tarih": datetime.fromtimestamp(calendar.timegm(zaman), timezone.utc) if zaman else None,
            "yazar": temiz_metin(e.get("author")),
        }


def sayfa_oku(sayfa):
    """Bir haber listesi sayfasından link deseniyle eşleşen haberleri toplar."""
    yanit = getir(sayfa["url"])
    soup = BeautifulSoup(yanit.text, "html.parser")
    desen = re.compile(sayfa["link_deseni"])
    bulunan = {}
    for a in soup.find_all("a", href=True):
        link = urljoin(yanit.url, a["href"]).split("#")[0]
        if not desen.search(link):
            continue
        baslik = temiz_metin(a.get("title") or a.get_text(" "))
        baslik = re.sub(r"^\d{1,2}:\d{2}\s*", "", baslik)  # T24 başlıkların önüne saat koyuyor
        if link not in bulunan:
            if len(bulunan) >= sayfa.get("en_fazla", SAYFA_BASINA_LINK):
                continue
            bulunan[link] = baslik
        elif len(baslik) > len(bulunan[link]):
            bulunan[link] = baslik
    return [{"link": link, "baslik": baslik} for link, baslik in bulunan.items()]


def detay_oku(link):
    """Haber sayfasının meta etiketlerinden başlık, özet, tarih ve yazarı okur."""
    soup = BeautifulSoup(getir(link).text, "html.parser")

    def meta(*adlar):
        for ad in adlar:
            for nitelik in ("property", "name", "itemprop"):
                etiket = soup.find("meta", attrs={nitelik: ad})
                if etiket and etiket.get("content", "").strip():
                    return etiket["content"].strip()
        return ""

    yazar = meta("author", "article:author")
    if not yazar:
        for betik in soup.find_all("script", type="application/ld+json"):
            bulunan = re.search(r'"author"\s*:\s*(?:\[\s*)?\{[^}]*?"name"\s*:\s*"([^"]+)"', betik.string or "")
            if bulunan:
                yazar = bulunan.group(1)
                break
    yazar = "" if yazar.startswith("http") else ad_duzelt(temiz_metin(yazar))

    # "Yazar | Başlık | Site" gibi başlıklardan yazar ve site adını ayıkla.
    baslik = temiz_metin(meta("og:title", "twitter:title") or (soup.title.string if soup.title else ""))
    parcalar = [p for p in re.split(r"\s+[|–]\s+", baslik) if ad_duzelt(p) != yazar]
    if len(parcalar) > 1 and len(parcalar[-1]) <= 25:
        parcalar.pop()
    return {
        "baslik": " | ".join(parcalar),
        "ozet_ham": meta("og:description", "description"),
        "tarih": iso_oku(meta("article:published_time", "datePublished", "pubdate")),
        "yazar": yazar,
    }


def ad_duzelt(ad):
    """'Mete BELOVACIKLI' -> 'Mete Belovacıklı' (Türkçe büyük/küçük harf kurallarıyla)."""
    def kelime(k):
        if len(k) < 2 or not k.isupper():
            return k
        kucuk = k.replace("I", "ı").replace("İ", "i").lower()
        return kucuk[0].replace("i", "İ").upper() + kucuk[1:]
    return " ".join(kelime(k) for k in ad.split())


# ---------------------------------------------------------------- toplama

def kaynagi_topla(kaynak, onceki, simdi):
    """Bir kaynağın tüm beslemelerini ve sayfalarını okur.

    Dönüş: ({kimlik: haber}, durum)
    """
    kose = re.compile(kaynak["kose_deseni"]) if kaynak.get("kose_deseni") else None
    haric = re.compile(kaynak["haric_deseni"]) if kaynak.get("haric_deseni") else None
    haberler, hatalar, okunan_adres = {}, [], 0

    def ekle(ham, detay_gerekli=False):
        link = ham["link"]
        if not link.startswith("http") or (haric and haric.search(link)):
            return
        kimlik = haber_kimligi(link)
        if kimlik in haberler:
            return
        tarih = ham.get("tarih") or simdi
        haberler[kimlik] = {
            "id": kimlik,
            "kaynak": kaynak["id"],
            "baslik": ham["baslik"],
            "ozet": ham.get("ozet", ""),
            "link": link,
            "tarih": iso(min(tarih, simdi)),
            "tur": "kose" if kose and kose.search(link) else "haber",
            **({"yazar": ham["yazar"]} if ham.get("yazar") else {}),
            **({"eksik": True} if detay_gerekli else {}),
        }

    for url in kaynak.get("rss", []):
        try:
            for ham in rss_oku(url):
                ekle(ham)
            okunan_adres += 1
        except Exception as hata:  # noqa: BLE001 - bir beslemenin hatası diğerlerini durdurmasın
            hatalar.append(f"{url}: {hata}")

    for sayfa in kaynak.get("sayfalar", []):
        try:
            for ham in sayfa_oku(sayfa):
                kimlik = haber_kimligi(ham["link"])
                eski = onceki.get(kimlik)
                if eski and not eski.get("eksik"):
                    continue
                ekle(ham, detay_gerekli=True)
            okunan_adres += 1
        except Exception as hata:  # noqa: BLE001
            hatalar.append(f"{sayfa['url']}: {hata}")

    # Sayfadan gelen haberlerin özetini ve tarihini haber sayfasından tamamla.
    # Önceki çalışmalarda tamamlanamayanlar da burada tekrar denenir.
    eksikler = [h for h in haberler.values() if h.get("eksik")]
    eksikler += [h for h in onceki.values()
                 if h["kaynak"] == kaynak["id"] and h.get("eksik") and h["id"] not in haberler]
    eksikler = eksikler[:DETAY_SINIRI]

    def tamamla(haber):
        try:
            return haber, detay_oku(haber["link"])
        except Exception:  # noqa: BLE001
            return haber, None

    with ThreadPoolExecutor(6) as havuz:
        for haber, detay in havuz.map(tamamla, eksikler):
            if not detay:
                continue
            haber = haberler.setdefault(haber["id"], dict(haber))
            haber["baslik"] = haber["baslik"] or detay["baslik"]
            haber["ozet"] = ozet_hazirla(detay["ozet_ham"], haber["baslik"])
            if detay["tarih"]:
                haber["tarih"] = iso(min(detay["tarih"], simdi))
            if detay["yazar"]:
                haber["yazar"] = detay["yazar"]
            haber.pop("eksik", None)

    for kimlik in [k for k, h in haberler.items() if not h["baslik"]]:
        del haberler[kimlik]

    toplam_adres = len(kaynak.get("rss", [])) + len(kaynak.get("sayfalar", []))
    durum = {
        "ad": kaynak["ad"],
        "basarili": okunan_adres > 0,
        "adet": len(haberler),
        "okunan": f"{okunan_adres}/{toplam_adres}",
        "zaman": iso(simdi),
        **({"hata": " | ".join(hatalar)[:500]} if hatalar else {}),
    }
    return haberler, durum


# ---------------------------------------------------------------- gruplama

DURAK_KELIMELER = set(sadelestir(
    "ve ile bir bu şu o da de ki mi mı mu mü için gibi ne nasıl neden niye daha en çok "
    "olarak olan oldu olduğu son dakika işte sonra önce kadar ya veya ama ancak her tüm "
    "yeni ilk iki üç yıl gün açıkladı açıklama dedi var yok sözleri hakkında"
).split())


def kelime_kokleri(baslik):
    """Başlığı karşılaştırılabilir kelime köklerine ayırır (ilk 5 harf kaba bir köktür)."""
    return {k[:5] for k in sadelestir(baslik).split() if len(k) > 1 and k not in DURAK_KELIMELER}


def benzerlik_olcer(tum_kokler):
    """Kelimeleri ne kadar nadir olduklarına göre ağırlıklandıran bir benzerlik testi döndürür.

    "operasyon", "belediye" gibi her gün geçen kelimeler az, "Bakırköy" gibi
    nadir kelimeler çok sayılır.
    """
    sayac = Counter(k for kokler in tum_kokler for k in kokler)
    n = len(tum_kokler) + 1
    agirlik = {k: math.log(n / adet) for k, adet in sayac.items()}

    def benzer_mi(a, b):
        ortak = a & b
        if len(ortak) < 2:
            return False
        w_ortak = sum(agirlik[k] for k in ortak)
        jaccard = w_ortak / sum(agirlik[k] for k in a | b)
        if jaccard < 0.6:
            # İki başlığın da ortak kelimelerden daha ayırt edici, eşleşmeyen bir
            # kelimesi varsa (ör. "Bakırköy" / "Merkezefendi") farklı olaylardır.
            en_ayirt_edici = max(agirlik[k] for k in ortak)
            if (any(agirlik[k] > en_ayirt_edici for k in a - b)
                    and any(agirlik[k] > en_ayirt_edici for k in b - a)):
                return False
        if jaccard >= 0.35:
            return True
        kucuk = min(sum(agirlik[k] for k in a), sum(agirlik[k] for k in b))
        return len(ortak) >= 3 and w_ortak / kucuk >= 0.65

    return benzer_mi


def grupla(haberler):
    """Aynı olayı anlatan haberlere ortak bir 'grup' kimliği verir."""
    sirali = sorted(haberler, key=lambda h: h["tarih"])
    tum_kokler = [kelime_kokleri(h["baslik"]) for h in sirali]
    benzer_mi = benzerlik_olcer(tum_kokler)
    gruplar = []  # [{"id", "uyeler": [kökler], "son": datetime}]
    dizin = {}    # kök -> grup sıra numaraları
    pencere = timedelta(hours=36)

    for haber, kokler in zip(sirali, tum_kokler):
        zaman = iso_oku(haber["tarih"])
        adaylar = Counter(g for k in kokler for g in dizin.get(k, ()))
        secilen = None
        for sira, ortak in adaylar.most_common():
            if ortak < 2:
                break
            grup = gruplar[sira]
            if zaman - grup["son"] <= pencere and any(benzer_mi(kokler, u) for u in grup["uyeler"]):
                secilen = sira
                break
        if secilen is None:
            secilen = len(gruplar)
            gruplar.append({"id": haber["id"], "uyeler": [], "son": zaman})
        grup = gruplar[secilen]
        grup["uyeler"].append(kokler)
        grup["son"] = max(grup["son"], zaman)
        for k in kokler:
            dizin.setdefault(k, set()).add(secilen)
        haber["grup"] = grup["id"]


# ---------------------------------------------------------------- ana akış

def onceki_veriyi_yukle():
    if ONCEKI_VERI_URL:
        try:
            yanit = OTURUM.get(ONCEKI_VERI_URL, params={"t": int(datetime.now().timestamp())}, timeout=30)
        except requests.RequestException as hata:
            sys.exit(f"Önceki veri indirilemedi, geçmiş silinmesin diye durduruluyor: {hata}")
        if yanit.status_code == 404:
            log("Yayında önceki veri yok, sıfırdan başlanıyor.")
            return {}
        if not yanit.ok:
            sys.exit(f"Önceki veri indirilemedi (HTTP {yanit.status_code}), durduruluyor.")
        return yanit.json()
    if os.path.exists(CIKTI_DOSYASI):
        with open(CIKTI_DOSYASI, encoding="utf-8") as dosya:
            return json.load(dosya)
    return {}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    with open(KAYNAK_DOSYASI, encoding="utf-8") as dosya:
        ayar = json.load(dosya)
    simdi = datetime.now(timezone.utc)
    kaynaklar = [k for k in ayar["kaynaklar"] if k.get("aktif", True)]
    aktif_idler = {k["id"] for k in kaynaklar}

    onceki = onceki_veriyi_yukle()
    haberler = {h["id"]: h for h in onceki.get("haberler", []) if h["kaynak"] in aktif_idler}
    log(f"Önceki veri: {len(haberler)} haber")

    with ThreadPoolExecutor(len(kaynaklar)) as havuz:
        sonuclar = list(havuz.map(lambda k: kaynagi_topla(k, haberler, simdi), kaynaklar))

    durum, yeni_sayisi = {}, 0
    for kaynak, (gelenler, kaynak_durumu) in zip(kaynaklar, sonuclar):
        durum[kaynak["id"]] = kaynak_durumu
        isaret = "✓" if kaynak_durumu["basarili"] else "✗"
        log(f"{isaret} {kaynak['ad']}: {len(gelenler)} haber ({kaynak_durumu['okunan']} adres)"
            + (f" — {kaynak_durumu['hata']}" if kaynak_durumu.get("hata") else ""))
        for kimlik, gelen in gelenler.items():
            eski = haberler.get(kimlik)
            if eski is None:
                gelen["ilk"] = iso(simdi)
                haberler[kimlik] = gelen
                yeni_sayisi += 1
            elif eski.get("eksik") and not gelen.get("eksik"):
                eski.update({k: v for k, v in gelen.items() if k != "eksik"})
                eski.pop("eksik", None)
            elif not eski.get("ozet") and gelen.get("ozet"):
                eski["ozet"] = gelen["ozet"]

    if not any(d["basarili"] for d in durum.values()):
        sys.exit("Hiçbir kaynak okunamadı; mevcut veri korunuyor.")

    sinir = iso(simdi - timedelta(days=ayar.get("saklama_gun", 7)))
    kalanlar = sorted((h for h in haberler.values() if h["tarih"] >= sinir),
                      key=lambda h: h["tarih"], reverse=True)[:EN_FAZLA_HABER]
    grupla(kalanlar)

    cikti = {
        "surum": 1,
        "guncelleme": iso(simdi),
        "kaynaklar": {k["id"]: {"ad": k["ad"], "site": k.get("site", "")} for k in kaynaklar},
        "durum": durum,
        "haberler": kalanlar,
    }
    os.makedirs(os.path.dirname(CIKTI_DOSYASI), exist_ok=True)
    with open(CIKTI_DOSYASI, "w", encoding="utf-8") as dosya:
        json.dump(cikti, dosya, ensure_ascii=False, separators=(",", ":"))
    # Site, büyük dosyayı indirmeden önce bu küçük dosyadan yeni veri olup olmadığına bakar.
    with open(os.path.join(os.path.dirname(CIKTI_DOSYASI), "son.json"), "w", encoding="utf-8") as dosya:
        json.dump({"guncelleme": cikti["guncelleme"], "adet": len(kalanlar)}, dosya)

    grup_sayisi = len({h["grup"] for h in kalanlar})
    log(f"Bitti: {yeni_sayisi} yeni, toplam {len(kalanlar)} haber, {grup_sayisi} olay.")


if __name__ == "__main__":
    main()
