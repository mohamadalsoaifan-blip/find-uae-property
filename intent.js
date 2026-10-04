// Intent engine for the landing page: one sentence (English or Arabic) → the form answers it implies.
// Deterministic and local: runs in the browser, sends nothing, uses no AI, never guesses. A field is filled only when
// the sentence states it; everything else stays a question. Shared by app.js (browser) and the unit tests (Deno).
(function (root) {
  "use strict";

  var DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," };
  function norm(s) {
    return String(s || "")
      .slice(0, 400)
      .replace(/[٠-٩٫٬]/g, function (c) {
        return DIGITS[c];
      })
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[ً-ْـ]/g, "") // harakat, tatweel
      .replace(/\s+/g, " ")
      .trim();
  }
  // word boundaries that work for Arabic and Latin script
  function has(text, words) {
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var re = new RegExp("(^|[^\\p{L}\\p{N}])(?:[وبلف]|ال|بال|لل|وال)?" + w + "(?=$|[^\\p{L}\\p{N}])", "u");
      if (re.test(text)) return w;
    }
    return null;
  }

  // Dubai / Abu Dhabi communities [emirate, English name, Arabic name, ways people write it]; the area is only filled
  // when the buyer named it (never invented) and is shown in the page language
  var AREAS = [
    ["dubai", "Dubai Silicon Oasis", "واحة دبي للسيليكون", [
      "dubai silicon oasis",
      "silicon oasis",
      "dso",
      "واحه دبي للسيليكون",
      "واحه السيليكون",
    ]],
    ["dubai", "Dubai Marina", "دبي مارينا", ["dubai marina", "marina", "دبي مارينا", "مارينا"]],
    ["dubai", "Downtown Dubai", "وسط مدينة دبي", ["downtown dubai", "downtown", "داون تاون"]],
    ["dubai", "Business Bay", "الخليج التجاري", ["business bay", "الخليج التجاري", "بزنس باي"]],
    ["dubai", "Dubai Hills", "دبي هيلز", ["dubai hills", "دبي هيلز"]],
    ["dubai", "JVC", "قرية جميرا الدائرية", ["jvc", "jumeirah village circle", "قريه جميرا الدائريه"]],
    ["dubai", "JLT", "أبراج بحيرات جميرا", ["jlt", "jumeirah lake towers", "ابراج بحيرات جميرا"]],
    ["dubai", "Palm Jumeirah", "نخلة جميرا", ["palm jumeirah", "the palm", "نخله جميرا"]],
    ["dubai", "Arabian Ranches", "المرابع العربية", ["arabian ranches", "المرابع العربيه"]],
    ["dubai", "Al Barsha", "البرشاء", ["al barsha", "barsha", "البرشاء"]],
    ["dubai", "Mirdif", "مردف", ["mirdif", "مردف"]],
    ["dubai", "Jumeirah", "جميرا", ["jumeirah", "جميرا"]],
    ["abu_dhabi", "Saadiyat Island", "جزيرة السعديات", ["saadiyat", "السعديات"]],
    ["abu_dhabi", "Yas Island", "جزيرة ياس", ["yas island", "yas", "جزيره ياس", "ياس"]],
    ["abu_dhabi", "Al Reem Island", "جزيرة الريم", ["al reem", "reem island", "جزيره الريم", "الريم"]],
  ];
  var EMIRATES = [
    ["dubai", ["dubai", "dxb", "دبي"]],
    ["abu_dhabi", ["abu dhabi", "abudhabi", "ابوظبي", "ابو ظبي"]],
    ["other_uae", [
      "sharjah",
      "ajman",
      "ras al khaimah",
      "rak",
      "fujairah",
      "umm al quwain",
      "الشارقه",
      "عجمان",
      "راس الخيمه",
      "الفجيره",
      "ام القيوين",
    ]],
  ];
  var TYPES = [
    ["townhouse", ["townhouse", "town house", "تاون هاوس", "تاونهاوس"]],
    ["villa", ["villa", "villas", "فيلا", "فلل", "فيلل"]],
    ["apartment", ["apartment", "apartments", "flat", "flats", "studio", "penthouse", "شقه", "شقق", "ستوديو", "بنتهاوس"]],
    ["commercial", ["office", "shop", "retail", "warehouse", "commercial", "مكتب", "محل", "مستودع", "تجاري"]],
  ];
  var PURPOSES = [
    ["relocation", ["moving to", "move to", "relocating", "relocate", "relocation", "انتقل", "الانتقال", "ننتقل", "اسكن في الامارات"]],
    ["investment", [
      "invest",
      "investment",
      "investing",
      "rental income",
      "yield",
      "roi",
      "استثمار",
      "استثماري",
      "استثماريه",
      "استثمر",
      "عائد",
    ]],
    ["residence", [
      "to live",
      "live in",
      "family home",
      "for my family",
      "our home",
      "first home",
      "end user",
      "للسكن",
      "سكن",
      "اسكن",
      "للعائله",
      "لعائلتي",
      "بيت العمر",
    ]],
  ];
  var TIMELINES = [
    ["immediately", ["immediately", "asap", "right now", "urgent", "urgently", "this week", "فورا", "حالا", "مستعجل", "هذا الاسبوع"]],
    ["lt30d", ["this month", "within a month", "within 30 days", "in a month", "next few weeks", "خلال شهر", "هذا الشهر", "خلال 30 يوم"]],
    ["1to3m", [
      "next month",
      "in 2 months",
      "in two months",
      "in 3 months",
      "within 3 months",
      "1-3 months",
      "next quarter",
      "خلال شهرين",
      "خلال 3 اشهر",
      "خلال ثلاث اشهر",
      "الشهر القادم",
    ]],
    ["3to6m", [
      "in 6 months",
      "within 6 months",
      "in six months",
      "later this year",
      "end of the year",
      "خلال 6 اشهر",
      "خلال سته اشهر",
      "اخر السنه",
      "نهايه السنه",
    ]],
    ["exploring", [
      "just looking",
      "just exploring",
      "exploring",
      "researching",
      "browsing",
      "no rush",
      "استكشف",
      "اتصفح",
      "بدون استعجال",
      "مجرد بحث",
    ]],
  ];
  var PAYMENTS = [
    ["mortgage", ["mortgage", "home loan", "bank loan", "financing", "finance", "تمويل", "قرض", "رهن"]],
    ["cash", ["cash", "cash buyer", "نقدا", "نقد", "كاش"]],
  ];
  var RENT = ["rent", "renting", "for rent", "lease", "ايجار", "للايجار", "استاجر", "استئجار"];
  var BUY = ["buy", "buying", "purchase", "own", "شراء", "اشتري", "اشتري", "نشتري", "تملك", "امتلاك"];
  // intentions the platform does not serve yet: recorded (anonymously) so demand for a next vertical is measured
  var OUT_OF_SCOPE = [
    ["company_setup", [
      "company",
      "business setup",
      "trade license",
      "trade licence",
      "free zone",
      "freezone",
      "شركه",
      "رخصه تجاريه",
      "منطقه حره",
      "تاسيس",
    ]],
    ["car", ["car", "cars", "vehicle", "سياره", "سيارات"]],
    ["visa", ["visa", "golden visa", "residency visa", "فيزا", "تاشيره", "اقامه", "الاقامه الذهبيه"]],
    ["job", ["job", "jobs", "work permit", "وظيفه", "عمل"]],
    ["school", ["school", "schools", "مدرسه", "مدارس"]],
  ];

  function first(text, table) {
    for (var i = 0; i < table.length; i++) if (has(text, table[i][1])) return table[i][0];
    return null;
  }

  // ---------------------------------------------------------------- budget: an amount in AED → the form's band
  var WORD_NUM = {
    "نص": 0.5,
    "نصف": 0.5,
    "ربع": 0.25,
    "واحد": 1,
    "مليون": 1,
    "مليونين": 2,
    "ثلاث": 3,
    "ثلاثه": 3,
    "اربع": 4,
    "اربعه": 4,
    "خمس": 5,
    "خمسه": 5,
  };
  function amountAed(t) {
    var m;
    // 1.5m / 1.5 million / 2 mln / 1,5 م / 2 مليون
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m|mn|mln|million|millions|مليون|ملايين|م)(?![\p{L}])/u);
    if (m) return parseFloat(m[1].replace(",", ".")) * 1e6;
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:k|thousand|الف)(?![\p{L}])/u);
    if (m) return parseFloat(m[1].replace(",", ".")) * 1e3;
    if (/مليون ونص|مليون و نص/.test(t)) return 1.5e6;
    if (/مليونين|مليونان/.test(t)) return 2e6;
    m = t.match(/(نص|نصف|ربع|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه)\s*(?:مليون|ملايين)/u);
    if (m) return WORD_NUM[m[1]] * 1e6;
    if (has(t, ["مليون"])) return 1e6;
    m = t.match(/(?:aed|dhs|dh|درهم)?\s*(\d{1,3}(?:,\d{3}){2,}|\d{6,9})\s*(?:aed|dhs|dh|درهم)?/u);
    if (m) return parseInt(m[1].replace(/,/g, ""), 10);
    return null;
  }
  function budgetBand(t) {
    var a = amountAed(t);
    if (a == null || !(a >= 100000 && a <= 1e9)) return null;
    var under = /(under|below|less than|up to|upto|max|maximum|within|not more than|اقل من|حتى|بحد اقصي|لا يزيد|تحت)/u.test(t);
    var edges = [1e6, 2e6, 5e6, 1e7];
    var bands = ["lt1m", "1to2m", "2to5m", "5to10m", "10mplus"];
    for (var i = 0; i < edges.length; i++) {
      if (a < edges[i] || (under && a === edges[i])) return bands[i];
    }
    return bands[4];
  }

  // ---------------------------------------------------------------- cars: what the sentence states about the car
  var CAR_WORDS = [
    "car",
    "cars",
    "vehicle",
    "suv",
    "sedan",
    "saloon",
    "hatchback",
    "pickup",
    "pick up",
    "pick-up",
    "4x4",
    "jeep",
    "minivan",
    "mpv",
    "ev",
    "toyota",
    "nissan",
    "hyundai",
    "kia",
    "lexus",
    "honda",
    "mitsubishi",
    "ford",
    "chevrolet",
    "mazda",
    "bmw",
    "mercedes",
    "audi",
    "volkswagen",
    "tesla",
    "byd",
    "mg",
    "geely",
    "chery",
    "jetour",
    "land cruiser",
    "patrol",
    "prado",
    "camry",
    "corolla",
    "سياره",
    "سيارات",
    "عربيه",
    "جيب",
    "سيدان",
    "بيك اب",
    "دفع رباعي",
    "تويوتا",
    "نيسان",
    "هيونداي",
    "كيا",
    "لكزس",
    "هوندا",
    "ميتسوبيشي",
    "فورد",
    "شيفروليه",
    "مازدا",
    "مرسيدس",
    "تسلا",
    "باترول",
    "لاندكروزر",
    "برادو",
    "كامري",
    "كورولا",
  ];
  var BODIES = [
    ["suv", ["suv", "4x4", "jeep", "crossover", "land cruiser", "patrol", "prado", "جيب", "دفع رباعي", "باترول", "لاندكروزر", "برادو"]],
    ["pickup", ["pickup", "pick up", "pick-up", "بيك اب", "بكب", "ونيت"]],
    ["mpv", ["minivan", "mpv", "van", "people carrier", "فان", "باص"]],
    ["sedan", ["sedan", "saloon", "camry", "corolla", "سيدان", "صالون", "كامري", "كورولا"]],
    ["hatchback", ["hatchback", "هاتشباك"]],
  ];
  var CAR_CONDITION = [
    ["used", ["used", "second hand", "second-hand", "pre-owned", "preowned", "مستعمل", "مستعمله", "استعمال"]],
    ["new", ["new", "brand new", "zero km", "جديد", "جديده", "زيرو", "وكاله"]],
  ];
  var POWER = [
    ["electric", ["electric", "ev", "bev", "كهربائي", "كهربائيه", "كهربا"]],
    ["hybrid", ["hybrid", "plug-in", "phev", "هايبرد", "هجين", "هايبريد"]],
    ["petrol", ["petrol", "gasoline", "بنزين"]],
  ];
  var CAR_PRIORITY = [
    ["reliability", ["reliable", "reliability", "dependable", "موثوق", "موثوقه", "اعتماديه", "يعتمد عليها"]],
    ["warranty", ["warranty", "ضمان"]],
    ["economy", ["economical", "fuel efficient", "fuel economy", "cheap to run", "اقتصادي", "اقتصاديه", "توفير", "استهلاك"]],
    ["space", ["spacious", "space", "big boot", "واسع", "واسعه", "مساحه"]],
    ["performance", ["fast", "sporty", "performance", "powerful", "سريع", "سريعه", "رياضي", "رياضيه", "قوي", "قويه"]],
  ];
  var CAR_PAY = [
    ["finance", ["finance", "financing", "loan", "installments", "instalments", "monthly", "تمويل", "قرض", "اقساط", "تقسيط", "شهري"]],
    ["cash", ["cash", "كاش", "نقدا", "نقد"]],
  ];
  var CAR_EMIRATE = [
    ["dubai", ["dubai", "dxb", "دبي"]],
    ["abu_dhabi", ["abu dhabi", "abudhabi", "ابوظبي", "ابو ظبي"]],
    ["sharjah", ["sharjah", "الشارقه"]],
  ];
  var USAGE = [
    ["offroad", ["off-road", "offroad", "off road", "desert", "dunes", "صحراء", "الصحراء", "طلعات", "تطعيس", "البر"]],
    ["highway", ["highway", "long distance", "commute between", "road trips", "طريق سريع", "مسافات طويله", "سفر"]],
    ["city", ["city", "in town", "school run", "داخل المدينه", "المدينه", "مشاوير"]],
  ];
  var SEAT_WORD = { "خمس": 5, "خمسه": 5, "سبع": 7, "سبعه": 7, "ثمان": 8, "ثمانيه": 8, "ثماني": 8, "تسع": 9 };
  function carSeats(t) {
    var m = t.match(/(\d{1,2})\s*-?\s*(?:seater|seaters|seats|seat|passengers|مقاعد|مقعد|ركاب|راكب)/u) ||
      t.match(/(خمس|خمسه|سبع|سبعه|ثمان|ثمانيه|ثماني|تسع)\s*(?:مقاعد|ركاب|راكب)/u);
    if (!m) return null;
    var n = SEAT_WORD[m[1]] || parseInt(m[1], 10);
    if (!(n >= 2 && n <= 15)) return null;
    return n <= 5 ? "up_to_5" : n <= 7 ? "seven" : "eight_plus";
  }
  function carBudget(t) {
    var a = amountAed(t);
    if (a == null) {
      var k = t.match(/(\d{2,3})\s*(?:الف|ألف)/u);
      var d = t.match(/(\d{4,7})\s*(?:aed|dhs|dh|درهم)/u) || t.match(/(?:aed|dhs|dh|درهم)\s*(\d{4,7})/u);
      a = k ? parseInt(k[1], 10) * 1000 : d ? parseInt(d[1], 10) : null;
    }
    if (a == null || !(a >= 10000 && a <= 5e6)) return null;
    var under = /(under|below|less than|up to|upto|max|maximum|within|not more than|اقل من|حتى|بحد اقصي|لا يزيد|تحت)/u.test(t);
    var edges = [60000, 100000, 150000, 250000];
    var bands = ["lt60k", "60to100k", "100to150k", "150to250k", "250kplus"];
    for (var i = 0; i < edges.length; i++) {
      if (a < edges[i] || (under && a === edges[i])) return bands[i];
    }
    return bands[4];
  }
  /** Car answers the sentence states (keys match the car questions); nothing is guessed. */
  function parseCar(t) {
    var a = {};
    var v;
    if ((v = first(t, BODIES))) a.body = v;
    if ((v = carSeats(t))) a.seats = v;
    if ((v = first(t, CAR_CONDITION))) a.condition = v;
    if ((v = first(t, POWER))) a.powertrain = v;
    if ((v = first(t, CAR_PRIORITY))) a.priority = v;
    if ((v = first(t, USAGE))) a.usage = v;
    if ((v = first(t, CAR_PAY))) a.payment = v;
    if ((v = first(t, CAR_EMIRATE))) a.emirate = v;
    if ((v = carBudget(t))) a.carBudget = v;
    if ((v = first(t, TIMELINES)) && v !== "exploring") a.timeline = v;
    return a;
  }

  /**
   * @param {string} input the buyer's sentence
   * @param {string} [lang] "ar" shows the area name in Arabic
   * @returns {{answers: Object, area: (string|null), scope: string, understood: string[], car: (Object|undefined)}}
   *   scope: "property" | "car" | "rent" | an out-of-scope category | "unclear"; `car` holds the car answers
   */
  function parse(input, lang) {
    var t = norm(input);
    var out = { answers: {}, area: null, scope: "unclear", understood: [] };
    if (t.length < 3) return out;
    var areaHit = null;
    for (var i = 0; i < AREAS.length && !areaHit; i++) if (has(t, AREAS[i][3])) areaHit = AREAS[i];
    var location = first(t, EMIRATES) || (areaHit ? areaHit[0] : null);
    var type = first(t, TYPES);
    var budget = budgetBand(t);
    var a = out.answers;
    if (location) a.location = location;
    if (areaHit && areaHit[0] === location) out.area = lang === "ar" ? areaHit[2] : areaHit[1];
    if (type) a.propertyType = type;
    if (budget) a.budget = budget;
    var purpose = first(t, PURPOSES);
    if (purpose) a.purpose = purpose;
    var timeline = first(t, TIMELINES);
    if (timeline) a.timeline = timeline;
    var payment = first(t, PAYMENTS);
    if (payment) a.payment = payment;
    var propertyWords = type || budget || has(t, ["property", "real estate", "home", "house", "عقار", "بيت", "منزل"]);
    // a car sentence ("family SUV under AED 140K") is a car intent, even though it contains an amount
    if (has(t, CAR_WORDS) && !type && !has(t, ["property", "real estate", "عقار"])) {
      out.scope = "car";
      out.answers = {};
      out.car = parseCar(t);
      out.understood = Object.keys(out.car);
      return out;
    }
    var rent = has(t, RENT) && !has(t, BUY);
    var other = first(t, OUT_OF_SCOPE);
    if (rent && propertyWords) out.scope = "rent";
    else if (propertyWords || location && has(t, BUY)) out.scope = "property";
    else if (other) out.scope = other;
    else if (location || purpose === "relocation") out.scope = "property";
    if (out.scope !== "property") out.answers = {};
    out.understood = Object.keys(out.answers);
    if (out.area) out.understood.push("area");
    return out;
  }

  root.PLHIntent = { parse: parse, normalize: norm };
})(typeof globalThis !== "undefined" ? globalThis : window);
