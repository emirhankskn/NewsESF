"""NewsESF push bildirimleri.

topla.py'den sonra çalışır: bu çalışmada ilk kez görülen olayları, aboneler.txt'deki
her abonenin kendi filtreleri ve bildirim kurallarıyla süzer ve Web Push gönderir.
Puanlama site/uygulama.js içindeki puanla() ile aynı sonucu vermelidir.

Gerekli ortam değişkenleri:
  VAPID_PRIVATE_KEY  GitHub secret olarak saklanan özel anahtar
  SITE_ADRESI        Sitenin adresi (bildirim özetine tıklanınca açılır)
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from pywebpush import WebPushException, webpush

from topla import CIKTI_DOSYASI, KOK, iso_oku, log, sadelestir

ABONE_DOSYASI = os.path.join(KOK, "aboneler.txt")
VAPID_OZEL = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
SITE_ADRESI = os.environ.get("SITE_ADRESI", "").rstrip("/") + "/"
_site = urlsplit(SITE_ADRESI)
ILETISIM = f"https://{_site.netloc}" if _site.scheme == "https" else "https://github.com"

TEK_TEK_SINIRI = 3              # Bundan fazla haber varsa tek bir özet bildirimi gönderilir
ILK_CALISMA_SINIRI = 150        # Bu kadar çok "yeni" olay varsa ilk çalışmadır, bildirim gönderme
EN_ESKI = timedelta(hours=6)    # Yeni keşfedilen ama eski tarihli haberler için bildirim gönderme


# ---------------------------------------------------------------- puanlama (uygulama.js ile aynı)

def turkce_buyuk(metin):
    return metin.replace("i", "İ").replace("ı", "I").upper()


def kelime_derle(ham):
    metin = str(ham).strip()
    tam = False
    tirnak = re.match(r'^["“”\'‘’](.+)["“”\'‘’]$', metin)
    if tirnak:
        metin, tam = tirnak.group(1), True
    sade = sadelestir(metin)
    if not sade:
        return None
    if (not tam and len(sade) <= 3 and " " not in sade
            and any(c.isupper() for c in metin) and metin == turkce_buyuk(metin)):
        tam = True
    return " " + sade + (" " if tam else "")


def filtre_derle(filtre):
    def liste(kelimeler):
        return [a for a in map(kelime_derle, kelimeler) if a]
    return {
        "esik": float(filtre.get("esik") or 15),
        "haric": liste(filtre.get("haric", [])),
        "kapali": set(filtre.get("kapaliKaynaklar", [])),
        "kategoriler": [
            {"id": kat["id"], "ad": kat["ad"], "agirlik": float(kat.get("agirlik") or 1), "kelimeler": liste(kat["kelimeler"])}
            for kat in filtre.get("kategoriler", []) if kat.get("aktif", True) is not False
        ],
    }


def puanla(olay, F):
    if any(k in olay["b"] for k in F["haric"]):
        return None
    puan, etiketler = 0, []
    for kat in F["kategoriler"]:
        ham = sum(3 if k in olay["b"] else 1 if k in olay["o"] else 0 for k in kat["kelimeler"])
        if ham:
            p = min(ham, 6) * kat["agirlik"]
            puan += p
            etiketler.append((p, kat))
    if puan > 0:
        puan += min(len(olay["kaynaklar"]) - 1, 3) * 3
    etiketler.sort(key=lambda e: -e[0])
    return {"puan": puan, "kategoriler": [kat for _, kat in etiketler]}


def kurala_uyar(olay, sonuc, kural, F):
    mod = kural.get("mod", "kapali")
    if mod == "tum":
        return True
    onemli = sonuc["puan"] >= F["esik"]
    if mod == "onemli":
        return onemli
    if mod == "secili":
        kategori_idleri = {kat["id"] for kat in sonuc["kategoriler"]}
        return ((kural.get("onemli") and onemli)
                or bool(kategori_idleri & set(kural.get("kategoriler", [])))
                or bool(olay["kaynaklar"] & set(kural.get("kaynaklar", []))))
    return False


# ---------------------------------------------------------------- veri

def yeni_gruplar(veri):
    """Bu çalışmada ilk kez görülen olaylar (gruba sonradan katılan haberler bildirim üretmez)."""
    gruplar = defaultdict(list)
    for h in veri["haberler"]:
        gruplar[h["grup"]].append(h)
    sinir = datetime.now(timezone.utc) - EN_ESKI
    yeniler = {}
    for grup, haberler in gruplar.items():
        haberler.sort(key=lambda h: h["tarih"])
        if min(h.get("ilk", "") for h in haberler) == veri["guncelleme"] and iso_oku(haberler[0]["tarih"]) >= sinir:
            yeniler[grup] = haberler
    return yeniler


def olay_yap(grup, haberler):
    return {
        "id": grup,
        "haberler": haberler,
        "kaynaklar": {h["kaynak"] for h in haberler},
        "b": " " + "  ".join(sadelestir(h["baslik"]) for h in haberler) + " ",
        "o": " " + "  ".join(sadelestir(h.get("ozet", "")) for h in haberler) + " ",
    }


def aboneleri_oku():
    """aboneler.txt: her satır bir abonelik kodu (JSON). # ile başlayan satırlar yorumdur.

    Aynı cihazdan (aynı endpoint) gelen sonraki satır öncekinin yerine geçer.
    """
    if not os.path.exists(ABONE_DOSYASI):
        return []
    aboneler = {}
    with open(ABONE_DOSYASI, encoding="utf-8") as dosya:
        for no, satir in enumerate(dosya, 1):
            satir = satir.strip()
            if not satir or satir.startswith("#"):
                continue
            try:
                abone = json.loads(satir)
                aboneler[abone["abonelik"]["endpoint"]] = abone
            except (ValueError, KeyError, TypeError) as hata:
                log(f"✗ aboneler.txt satır {no} okunamadı: {hata}")
    return list(aboneler.values())


# ---------------------------------------------------------------- gönderme

def bildirim_yukleri(eslesenler, kaynak_adlari):
    if len(eslesenler) > TEK_TEK_SINIRI:
        basliklar = "\n".join(f"• {olay['haberler'][0]['baslik']}" for olay, _ in eslesenler[:3])
        return [{
            "baslik": f"NewsESF: {len(eslesenler)} yeni haber",
            "govde": basliklar[:400],
            "url": SITE_ADRESI,
            "etiket": "newsesf-ozet",
        }]
    yukler = []
    for olay, sonuc in eslesenler:
        ana = olay["haberler"][0]
        alt = [kaynak_adlari.get(ana["kaynak"], ana["kaynak"])]
        if sonuc["kategoriler"]:
            alt.append(sonuc["kategoriler"][0]["ad"])
        if len(olay["kaynaklar"]) > 1:
            alt.append(f"{len(olay['kaynaklar'])} kaynakta")
        yukler.append({
            "baslik": ana["baslik"][:150],
            "govde": " · ".join(alt),
            "url": ana["link"],
            "etiket": olay["id"],
            "gorsel": next((h["gorsel"] for h in olay["haberler"] if h.get("gorsel")), ""),
        })
    return yukler


def gonder(abone, yuk):
    webpush(
        subscription_info=abone["abonelik"],
        data=json.dumps(yuk, ensure_ascii=False),
        vapid_private_key=VAPID_OZEL,
        # pywebpush bu sözlüğe hedef sunucuyu yazar; her gönderimde yeni sözlük verilmeli.
        # "sub" yalnızca alan adı olabilir (yolsuz https adresi), Apple da bunu kabul ediyor.
        vapid_claims={"sub": ILETISIM},
        ttl=6 * 3600,
        timeout=20,
    )


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    aboneler = aboneleri_oku()
    if not aboneler:
        log("Bildirim abonesi yok.")
        return
    if not VAPID_OZEL:
        log("VAPID_PRIVATE_KEY tanımlı değil; bildirim gönderilemiyor (README → Bildirimler).")
        return

    with open(CIKTI_DOSYASI, encoding="utf-8") as dosya:
        veri = json.load(dosya)
    gruplar = yeni_gruplar(veri)
    if len(gruplar) > ILK_CALISMA_SINIRI:
        log(f"{len(gruplar)} yeni olay var; ilk çalışma sayılıp bildirim gönderilmiyor.")
        return
    kaynak_adlari = {k: v["ad"] for k, v in veri["kaynaklar"].items()}
    log(f"{len(gruplar)} yeni olay, {len(aboneler)} abone.")

    for abone in aboneler:
        ad = abone.get("ad") or "adsız abone"
        kural = abone.get("kural", {})
        if kural.get("mod", "kapali") == "kapali":
            continue
        F = filtre_derle(abone.get("filtre", {}))
        eslesenler = []
        for grup, haberler in gruplar.items():
            # Sitedeki gibi: kapatılan kaynakların haberleri olaydan çıkarılır.
            haberler = [h for h in haberler if h["kaynak"] not in F["kapali"]]
            if not haberler:
                continue
            olay = olay_yap(grup, haberler)
            sonuc = puanla(olay, F)
            if sonuc and kurala_uyar(olay, sonuc, kural, F):
                eslesenler.append((olay, sonuc))
        eslesenler.sort(key=lambda e: -e[1]["puan"])
        if not eslesenler:
            log(f"  {ad}: uygun yeni haber yok")
            continue
        try:
            yukler = bildirim_yukleri(eslesenler, kaynak_adlari)
            for yuk in yukler:
                gonder(abone, yuk)
            log(f"✓ {ad}: {len(eslesenler)} haber, {len(yukler)} bildirim gönderildi")
        except WebPushException as hata:
            durum = hata.response.status_code if hata.response is not None else "?"
            if durum in (404, 410):
                log(f"✗ {ad}: abonelik artık geçerli değil (HTTP {durum}); aboneler.txt'den bu satırı silin.")
            else:
                log(f"✗ {ad}: gönderilemedi (HTTP {durum}): {hata}")
        except Exception as hata:  # noqa: BLE001 - bir abonenin hatası diğerlerini durdurmasın
            log(f"✗ {ad}: gönderilemedi: {hata}")


if __name__ == "__main__":
    main()
