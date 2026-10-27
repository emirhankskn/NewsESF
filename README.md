# NewsESF

Siyaset Bilimi ve Kamu Yönetimi öğrencileri için **filtrelenmiş haber takibi**. NewsESF haber yayınlamaz:
Türk haber sitelerinden güncel haberleri toplar, aynı olayı anlatan haberleri tek kartta birleştirir, sizin
belirlediğiniz filtrelere göre puanlar ve önemli olanları öne çıkarır.

- Sunucu ve veritabanı yok, ücret yok: tamamen **GitHub Pages + GitHub Actions** üzerinde çalışır.
- Haberler **her 30 dakikada** bir otomatik güncellenir.
- Filtreler, okunanlar ve kaydedilenler **sizin tarayıcınızda** saklanır; siteyi kullanan herkesin ayarı kendinedir.

## Nasıl çalışır?

```
GitHub Actions (her 30 dk)
  └─ toplayici/topla.py
       1. kaynaklar.json'daki RSS beslemelerini ve sayfaları okur
       2. Yeni haberleri önceki haberlerle birleştirir (aynı link iki kez girmez)
       3. Haber fotoğraflarını bulur (RSS'ten ya da haber sayfasının kapak görselinden)
       4. Aynı olayı anlatan haberleri gruplar ("5 kaynakta")
       5. site/veri/haberler.json dosyasını yazar ve siteyi yayınlar

GitHub Pages (site/ klasörü)
  └─ Tarayıcı haberler.json'u indirir, filtreleri uygular, puanlar ve listeler
```

Geçmiş haberler repo'ya commit edilmez. Her çalışmada yayındaki sitenin kendi `haberler.json` dosyası okunur,
yeni haberler eklenir ve son 7 gün saklanır. Böylece repo büyümez.

## Kaynaklar

| Kaynak | Yöntem |
|---|---|
| Anadolu Ajansı, BBC Türkçe, DW Türkçe, Euronews Türkçe, NTV, Bianet, Habertürk, Cumhuriyet | RSS |
| Ekonomim | RSS + Gündem, Ekonomi ve Yazarlar sayfalarının kazınması (köşe yazıları dahil) |
| T24 | RSS'i olmadığı için Politika, Gündem, ana sayfa ve Son Yazılar sayfalarının kazınması |

Her kaynağın son okuma durumu sitede **Ayarlar → Kaynaklar** bölümünde görünür (✓ sorunsuz, ⚠ kısmen, ✗ okunamadı).

## Kurulum (bir kerelik, ~5 dakika)

1. GitHub'da yeni bir **public** repo oluşturun, örneğin `NewsESF`. README, .gitignore vb. **eklemeyin**.
2. Bu klasörde terminali açıp kodu gönderin (`KULLANICI` yerine GitHub kullanıcı adınızı yazın):
   ```bash
   git remote add origin https://github.com/KULLANICI/NewsESF.git
   git push -u origin main
   ```
3. Repo'da **Settings → Pages → Build and deployment → Source** alanını **GitHub Actions** yapın.
4. **Actions** sekmesine gidin, soldan **Haberleri topla ve yayınla** iş akışını seçip **Run workflow** düğmesine basın.
   (Adım 2'deki push iş akışını zaten başlatmış ve Pages henüz açık olmadığı için hata vermiş olabilir; bu normaldir.)
5. Yaklaşık 1–2 dakika sonra site şu adreste açılır: `https://KULLANICI.github.io/NewsESF/`

Bundan sonra hiçbir şey yapmanıza gerek yok. Haberler her 30 dakikada bir kendiliğinden güncellenir.

> **Not:** GitHub, 60 gün boyunca hiç commit almayan public repolarda zamanlanmış işleri durdurur. İş akışı bunu
> önlemek için gerektiğinde `.github/canli-tut.txt` dosyasına küçük bir commit atar. Yine de iş akışı bir gün
> durursa Actions sekmesinden tekrar etkinleştirmeniz yeterlidir.

## Kullanım

- **Önemli:** puanı önem eşiğini geçen haberler (varsayılan eşik 15).
- **İlgili:** en az bir filtre kategorisiyle eşleşen tüm haberler.
- **Tümü:** hariç tutulanlar dışındaki her şey.
- Liste fotoğraflı en önemli üç haberle (manşet) başlar; masaüstünde sağdaki kenar çubuğundan kategoriye ve kaynağa göre süzebilirsiniz.
- **Kaydedilenler:** yer imi düğmesiyle sakladıklarınız. Haber 7 gün sonra listeden düşse bile burada kalır.

Bir habere tıkladığınızda ya da ✓ düğmesine bastığınızda haber **okundu** sayılır ve (“Okunanları gizle” açıksa)
bir daha karşınıza çıkmaz. Aynı olayı sonradan başka bir site verirse o da gelmez, çünkü olay zaten okunmuştur.
Son ziyaretinizden beri gelen haberlerde **YENİ** etiketi görünür. Sayfa açıkken yeni haberler gelirse üstte
“N yeni haber geldi · Göster” bildirimi çıkar.

Etiketlerin üzerine gelince o haberin hangi kelimelerle eşleştiğini ve kaç puan aldığını görebilirsiniz.

### Filtreler

Sağ üstteki **Ayarlar** düğmesinden:

- Kategorileri açıp kapatabilir, ağırlıklarını (1–5) değiştirebilir, kelime ekleyip çıkarabilir, yeni kategori ekleyebilirsiniz.
- **Önem eşiğini** ayarlayabilirsiniz. Ekranda o eşikte kaç haberin önemli sayılacağı anında görünür.
- **Hariç tutulan kelimeleri** düzenleyebilirsiniz. Başlığında bunlardan biri geçen haber hiç gösterilmez.
- İstemediğiniz kaynakları kapatabilirsiniz.

**Puanlama:** Başlıkta geçen her kelime 3, özette geçen 1 puan getirir. Bir kategorinin puanı en fazla
6 × ağırlıktır. Haberi birden çok kaynak verdiyse her ek kaynak için +3 (en fazla +9) eklenir.

**Eşleşme kuralları:**

| Yazım | Anlamı | Örnek |
|---|---|---|
| `seçim` | Kelime başından eşleşir | “seçimde”, “seçimlerin” yakalanır |
| `kanun teklifi` | Kelime öbeği | “kanun teklifini” yakalanır |
| `AB` | Büyük harfli kısa kısaltma, tam eşleşir | “AB'nin” yakalanır, “ABD” yakalanmaz |
| `"Bahçeli"` | Tırnak içi, tam eşleşir | “Bahçeli'nin” yakalanır, “Bahçelievler” yakalanmaz |

Büyük/küçük harf ve Türkçe karakter farkı önemsizdir (`Resmî Gazete` = `resmi gazete`).

### Bildirimler

Üst şeritteki **zil** düğmesinden (ya da **Ayarlar → Bildirimler**) hangi haberler için bildirim almak istediğinizi seçin:

| Seçenek | Bildirim gelir |
|---|---|
| Önemli haberler | Önem eşiğini geçen yeni haberler |
| Seçtiklerim | İşaretlediğiniz kategorilerden ya da kaynaklardan **herhangi birine** uyan (isterseniz önemli olanlar da) |
| Tüm yeni haberler | Hariç tutulanlar dışındaki her yeni haber |

Aynı olay için ikinci bildirim gelmez. Bir seferde 3'ten fazla haber varsa tek bir özet bildirim gelir.

**Site açıkken:** “Bildirimlere izin ver” demeniz yeterli. Sekme arka planda olsa bile yeni haberler için
bildirim çıkar.

**Site kapalıyken (telefon dahil):** Bildirimleri GitHub Actions 30 dakikada bir gönderir. Sunucu filtrelerinizi
bilmediği için her cihazın bir **abonelik kodu** repo'daki `aboneler.txt` dosyasına eklenir.

Bir kerelik kurulum (repo sahibi yapar):

1. Bilgisayardaki `.gizli/vapid-ozel-anahtar.txt` dosyasının içeriğini kopyalayın. Bu dosya git'e gönderilmez;
   güvenli bir yere yedekleyin.
2. GitHub'da **Settings → Secrets and variables → Actions → New repository secret**:
   Name `VAPID_PRIVATE_KEY`, Secret olarak kopyaladığınız metin.

Her cihaz için:

1. **iPhone:** Siteyi Safari'de açın → **Paylaş → Ana Ekrana Ekle**, ardından siteyi ana ekrandaki NewsESF
   simgesinden açın (iOS 16.4+). Android ve bilgisayarda bu adım gerekmez.
2. Zil düğmesi → bildirim türünü seçin → izin verin → cihaza bir ad yazıp **Abonelik kodu oluştur**.
3. **Kodu kopyala** ya da **Paylaş** (ör. WhatsApp ile repo sahibine gönderin).
4. GitHub'da `aboneler.txt` dosyasının sonuna **yeni bir satır** olarak yapıştırıp kaydedin. Kod `NEWSESF1.` ile
   başlayan uzun, tek parça bir metindir; yalnızca `https://...` ile başlayan bir adres geldiyse kod eksik kopyalanmıştır.
   En geç 30 dakika
   içinde bildirimler başlar.

Bildirim ayarlarını ya da filtreleri sonradan değiştirirseniz site “Yeni kodu aboneler.txt'ye eklemeniz
gerekiyor” uyarısı gösterir; yeni kodu yine yeni satır olarak ekleyin, aynı cihazın eski satırının yerine geçer.
Bir cihaza bildirim gitmesini durdurmak için o cihazın satırlarını silin.

> Abonelik kodu filtrelerinizi ve cihazın push adresini içerir; repo public olduğu için görülebilir. Push adresi
> tek başına bildirim göndermeye yaramaz, gönderim için sizdeki özel anahtar gerekir. Actions çıktısında
> “abonelik artık geçerli değil” yazarsa o cihazın satırını silin.

### Özel mesaj

Bildirimler bölümünün altındaki **privateKey** alanına repo sahibinin GitHub erişim anahtarı girilirse özel mesaj
paneli açılır. Buradan yazılan başlık ve mesaj, yalnızca işaretlenen cihazlara (`aboneler.txt`'deki cihaz adları)
bildirim olarak gider. Varsayılan olarak hiçbir cihaz seçili değildir. Mesaj yaklaşık 1 dakikada ulaşır.

Anahtarı oluşturmak (bir kerelik):

1. GitHub → sağ üstte profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**.
2. **Repository access:** *Only select repositories* → `NewsESF`.
3. **Permissions → Repository permissions:** **Actions: Read and write**, **Contents: Read-only**.
4. Oluşan anahtarı (`github_pat_...`) sitedeki privateKey alanına yapıştırıp **Aç**'a basın. Anahtar yalnızca o
   tarayıcıda saklanır; **Kilitle** ile silinir.

Anahtar yalnızca bu repodaki iş akışlarını tetikleyebilir; kodu değiştiremez. Kaybolursa ya da sızarsa GitHub'dan
silip yenisini oluşturun. Mesajın içeriği Actions loglarında görünmez.

Haber bildirimi istemeyen biri de “Kapalı” seçiliyken abonelik kodu oluşturabilir; o cihaz yalnızca özel mesajları alır.

### Başka bir cihaza taşıma

Ayarlar her tarayıcıda ayrı saklanır. **Ayarlar → Yedekleme → Dışa aktar** ile bir dosya indirip diğer cihazda
**İçe aktar** ile yükleyin. Filtreler, kaydedilenler ve okunanlar birlikte taşınır.

## Yeni kaynak eklemek

Kaynaklar `kaynaklar.json` dosyasındadır ve tüm kullanıcılar için ortaktır. GitHub'da dosyayı açıp kalem
simgesine tıklayın, `kaynaklar` listesine yeni bir öğe ekleyip **Commit changes** deyin. Sitedeki
**Ayarlar → Yeni kaynak ekle** bölümü sizin için hazır metni üretir ve GitHub'daki düzenleme sayfasını açar.

### RSS'i olan site

```json
{
  "id": "ornek-haber",
  "ad": "Örnek Haber",
  "site": "https://www.ornekhaber.com",
  "rss": ["https://www.ornekhaber.com/rss"]
}
```

RSS adresini bulmak için genellikle sitenin altında “RSS” bağlantısı olur ya da `site.com/rss` denenebilir.

### RSS'i olmayan site (sayfa kazıma)

Haber listesi olan sayfaların adresini ve haber linklerinin biçimini (düzenli ifade olarak) verirsiniz. Toplayıcı
o sayfadaki eşleşen linkleri toplar, her haberin sayfasını açıp başlık, özet, tarih ve yazarı okur.

```json
{
  "id": "t24",
  "ad": "T24",
  "site": "https://t24.com.tr",
  "kose_deseni": "/yazarlar/",
  "haric_deseni": "/(foto-haber|video|spor)/",
  "sayfalar": [
    { "url": "https://t24.com.tr/politika", "link_deseni": "^https://t24\\.com\\.tr/[a-z-]+/[^/]+,\\d{5,}$" }
  ]
}
```

| Alan | Açıklama |
|---|---|
| `rss` | RSS adresleri listesi (isteğe bağlı) |
| `sayfalar` | Kazınacak sayfalar. `link_deseni` haber linklerini seçen düzenli ifadedir; `en_fazla` (varsayılan 40) sayfa başına alınacak link sayısı |
| `kose_deseni` | Linki bu desene uyan haberler “Köşe yazısı” olarak işaretlenir |
| `haric_deseni` | Linki bu desene uyan haberler hiç alınmaz (galeri, video vb.) |
| `aktif` | `false` yapılırsa kaynak geçici olarak kapanır |

Kaydettikten sonra Actions sekmesinden iş akışını elle çalıştırıp çıktıda kaynağın kaç haber getirdiğine bakabilirsiniz.

## Bilgisayarda çalıştırma

Python 3.11+ gerekir.

```bash
pip install -r toplayici/requirements.txt
python toplayici/topla.py              # site/veri/haberler.json oluşur
python -m http.server 8000 -d site     # http://localhost:8000 adresinden açın
```

Toplayıcıyı tekrar çalıştırdığınızda yerel `haberler.json` önceki veri olarak kullanılır.

## Dosya yapısı

```
kaynaklar.json                    Haber kaynakları
aboneler.txt                      Push bildirimi alacak cihazların abonelik kodları
toplayici/topla.py                Haberleri toplayan, gruplayan Python betiği
toplayici/bildir.py               Yeni haberler için abonelere push bildirimi gönderen betik
toplayici/ozel_mesaj.py           Özel mesajı seçilen cihazlara gönderen betik
site/sw.js                        Site kapalıyken bildirimleri gösteren servis çalışanı
site/index.html, stil.css         Arayüz
site/uygulama.js                  Filtreleme, puanlama, okundu takibi, ayarlar
site/filtreler.js                 Varsayılan filtreler (Siyaset Bilimi ve Kamu Yönetimi)
.github/workflows/topla.yml       30 dakikada bir çalışan GitHub Actions iş akışı
.github/workflows/ozel-mesaj.yml  Sitedeki özel mesaj panelinin tetiklediği iş akışı
```

## Sınırlamalar

- Güncelleme anlık değildir. GitHub zamanlanmış işleri birkaç dakika geciktirebilir.
- Bir site tasarımını değiştirirse o sitenin kazıma ayarı (`link_deseni`) güncellenmelidir. RSS kaynakları bundan etkilenmez.
- Haber listesi herkese açıktır (zaten herkese açık haberlerdir). Kişisel ayarlar yalnızca sizin tarayıcınızda durur.
