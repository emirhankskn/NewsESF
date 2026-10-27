"""NewsESF özel mesaj: sitedeki özel mesaj panelinden gönderilen bildirimi seçilen cihazlara iletir.

.github/workflows/ozel-mesaj.yml tarafından çalıştırılır. Başlık, mesaj ve alıcı cihaz adları
workflow_dispatch girdilerinden gelir. Girdiler ortam değişkeniyle değil olay dosyasından okunur;
böylece public repo'nun Actions loglarında mesajın içeriği görünmez.
"""

import json
import os
import sys
import time

from bildir import VAPID_OZEL, SITE_ADRESI, aboneleri_oku, gonder
from topla import log


def girdileri_oku():
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as dosya:
        girdiler = json.load(dosya).get("inputs") or {}
    baslik = (girdiler.get("baslik") or "").strip()
    mesaj = (girdiler.get("mesaj") or "").strip()
    # Olur da bir yerde yazdırılırsa loglarda maskelensin.
    for satir in (baslik + "\n" + mesaj).splitlines():
        if satir.strip():
            print(f"::add-mask::{satir.strip()}", flush=True)
    try:
        alicilar = json.loads(girdiler.get("alicilar") or "[]")
    except ValueError:
        alicilar = []
    return baslik, mesaj, [a for a in alicilar if isinstance(a, str) and a.strip()]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    baslik, mesaj, alicilar = girdileri_oku()
    if not baslik:
        sys.exit("Başlık boş.")
    if not alicilar:
        sys.exit("Alıcı seçilmedi; kimseye gönderilmedi.")
    if not VAPID_OZEL:
        sys.exit("VAPID_PRIVATE_KEY secret'ı tanımlı değil.")

    aboneler = aboneleri_oku()
    hedefler = [a for a in aboneler if a.get("ad") in alicilar]
    if not hedefler:
        adlar = sorted({a.get("ad", "") for a in aboneler})
        sys.exit(f"Seçilen alıcılar aboneler.txt'de bulunamadı. Mevcut cihazlar: {', '.join(adlar) or 'yok'}")

    yuk = {
        "baslik": baslik[:150],
        "govde": mesaj[:1000],
        "url": SITE_ADRESI,
        # Her mesaj ayrı etiket alsın ki birbirinin yerine geçmesin.
        "etiket": f"ozel-{int(time.time())}",
    }
    basarili = 0
    for abone in hedefler:
        try:
            gonder(abone, yuk)
            basarili += 1
            log(f"✓ {abone.get('ad')}: gönderildi")
        except Exception as hata:  # noqa: BLE001
            durum = getattr(getattr(hata, "response", None), "status_code", "?")
            log(f"✗ {abone.get('ad')}: gönderilemedi (HTTP {durum})")
    if not basarili:
        sys.exit("Hiçbir cihaza gönderilemedi.")


if __name__ == "__main__":
    main()
