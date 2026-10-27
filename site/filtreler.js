// NewsESF varsayılan filtreleri: Siyaset Bilimi ve Kamu Yönetimi öğrencisi için.
// Kullanıcı bunları Ayarlar ekranından değiştirir; değişiklikler tarayıcıda saklanır.
//
// Eşleşme kuralları:
//   - Kelimeler kelime başından eşleşir: "seçim" -> "seçimde", "seçimlerin" de yakalanır.
//   - BÜYÜK harfle yazılmış 3 harf ve altındaki kısaltmalar (AB, BM, AYM) ve "tırnak içindekiler"
//     tam eşleşir: "AB" -> "AB'nin" yakalanır ama "ABD" yakalanmaz.
//   - Başlıkta geçen kelime 3, özette geçen 1 puan; kategori puanı en fazla 6 x ağırlık.
//   - Haberi birden çok kaynak verdiyse her ek kaynak için +3 (en fazla +9).

const VARSAYILAN_FILTRELER = {
  surum: 1,
  esik: 15,
  kapaliKaynaklar: [],
  kategoriler: [
    {
      id: "siyaset",
      ad: "Siyaset ve Seçimler",
      renk: "#c2410c",
      agirlik: 3,
      aktif: true,
      kelimeler: [
        "TBMM", "Meclis", "milletvekili", "Genel Kurul", "seçim", "seçmen", "sandık", "YSK",
        "kanun teklifi", "yasa teklifi", "önerge", "muhalefet", "iktidar", "koalisyon", "ittifak",
        "Cumhurbaşkanı", "kabine", "AK Parti", "AKP", "CHP", "MHP", "DEM Parti", "İYİ Parti",
        "Yeniden Refah", "Zafer Partisi", "Saadet Partisi", "DEVA Partisi", "Gelecek Partisi",
        "YENİ Parti", "siyasi parti", "genel başkan", "kurultay", "yeni anayasa", "grup toplantısı",
        "dokunulmazlık", "fezleke", "gensoru", "soru önergesi", "siyaset", "siyasi",
        "Erdoğan", "\"Bahçeli\"", "Özgür Özel", "İmamoğlu", "Kılıçdaroğlu", "Mansur Yavaş",
        "Dervişoğlu", "Babacan", "Davutoğlu", "Erbakan"
      ]
    },
    {
      id: "kamu-yonetimi",
      ad: "Kamu Yönetimi",
      renk: "#1d4ed8",
      agirlik: 3,
      aktif: true,
      kelimeler: [
        "Resmi Gazete", "yönetmelik", "genelge", "tebliğ", "kararname", "Cumhurbaşkanlığı",
        "bakanlık", "bakanı", "bakan yardımcısı", "valilik", "valisi", "kaymakam", "atama",
        "görevden alma", "görevden alındı", "bürokrasi", "bürokrat", "kamu politikası",
        "kamu yönetimi", "kamu personeli", "kamu görevlisi", "kamu hizmeti", "kamu kurum", "memur",
        "KPSS", "Sayıştay", "Devlet Denetleme", "kamu ihale", "idari", "düzenleyici kurum",
        "Rekabet Kurumu", "BDDK", "SPK", "RTÜK", "BTK", "Kamu Denetçiliği", "ombudsman",
        "e-Devlet", "dijital devlet", "yönetişim", "şeffaflık", "hesap verebilirlik", "yıllık program"
      ]
    },
    {
      id: "anayasa-yargi",
      ad: "Anayasa ve Yargı",
      renk: "#7c3aed",
      agirlik: 3,
      aktif: true,
      kelimeler: [
        "Anayasa Mahkemesi", "AYM", "anayasa", "Danıştay", "Yargıtay", "HSK", "Hâkimler ve Savcılar",
        "bireysel başvuru", "AİHM", "Avrupa İnsan Hakları", "iptal davası", "yürütmeyi durdurma",
        "temel hak", "ifade özgürlüğü", "basın özgürlüğü", "hukuk devleti", "yargı paketi",
        "yargı reformu", "infaz düzenlemesi", "genel af", "insan hakları", "siyasi tutuklu",
        "kapatma davası", "erişim engeli", "baro"
      ]
    },
    {
      id: "yerel-yonetimler",
      ad: "Yerel Yönetimler",
      renk: "#0f766e",
      agirlik: 2,
      aktif: true,
      kelimeler: [
        "belediye", "büyükşehir", "kayyum", "kayyım", "il özel idaresi", "muhtar", "yerel seçim",
        "yerel yönetim", "imar planı", "kentsel dönüşüm", "İBB", "ABB"
      ]
    },
    {
      id: "dis-politika",
      ad: "Uluslararası İlişkiler",
      renk: "#0369a1",
      agirlik: 2,
      aktif: true,
      kelimeler: [
        "Dışişleri", "dış politika", "diplomasi", "diplomatik", "büyükelçi", "NATO", "BM",
        "Birleşmiş Milletler", "Avrupa Birliği", "AB", "Güvenlik Konseyi", "Avrupa Konseyi",
        "Avrupa Parlamentosu", "AGİT", "G20", "Şanghay İşbirliği", "Türk Devletleri Teşkilatı",
        "yaptırım", "ateşkes", "barış görüşme", "müzakere", "zirve", "başbakan", "hükümet",
        "Beyaz Saray", "Kremlin", "Brüksel", "işgal"
      ]
    },
    {
      id: "ekonomi-politikasi",
      ad: "Ekonomi Politikası",
      renk: "#b45309",
      agirlik: 2,
      aktif: true,
      kelimeler: [
        "Merkez Bankası", "TCMB", "politika faizi", "faiz kararı", "enflasyon", "TÜİK", "bütçe",
        "Orta Vadeli Program", "OVP", "vergi", "asgari ücret", "emekli maaş", "kamu maliyesi",
        "cari açık", "Hazine", "Maliye", "IMF", "Dünya Bankası", "kredi notu", "işsizlik",
        "istihdam", "para politikası", "büyüme"
      ]
    },
    {
      id: "toplum",
      ad: "Toplum ve Sosyal Politika",
      renk: "#be185d",
      agirlik: 1,
      aktif: true,
      kelimeler: [
        "göç", "mülteci", "sığınmacı", "sosyal politika", "sosyal yardım", "sosyal güvenlik", "SGK",
        "eğitim politikası", "sendika", "grev", "toplu sözleşme", "kadın hakları", "kadına şiddet",
        "sivil toplum", "STK", "eylem", "protesto", "miting", "gazeteci"
      ]
    }
  ],
  // Başlığında bunlardan biri geçen haberler hiç gösterilmez.
  haric: [
    "magazin", "futbol", "Süper Lig", "teknik direktör", "Galatasaray", "Fenerbahçe",
    "Beşiktaş", "Trabzonspor", "basketbol", "voleybol", "NBA", "Şampiyonlar Ligi", "UEFA",
    "Avrupa Ligi", "Konferans Ligi", "derbi", "Ballon d'Or", "burç", "astroloji", "Survivor",
    "MasterChef", "yemek tarifi", "dizi oyuncusu", "şarkıcı", "sevgilisi", "kombin", "hava durumu",
    "Formula 1", "tenis"
  ]
};
