/** All user-facing Hebrew strings. Code, keys and routes stay English. */
import type { ErrorCode, Leg } from "../../shared/types.ts";
import type { FamilyLabelParts } from "../../shared/familyLabel.ts";

export type ClientErrorCode = ErrorCode | "network" | "unknown";

const legName: Record<Leg, string> = { out: "הלוך", back: "חזור" };

const seatsText = (n: number) => (n === 1 ? "מקום אחד" : `${n} מקומות`);
const missingText = (n: number, leg: Leg) =>
  n === 1 ? `חסר מקום אחד ב${legName[leg]}` : `חסרים ${n} מקומות ב${legName[leg]}`;
const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;

export const he = {
  appName: "טרמפוש",
  legName,
  family: (name: string) => `משפחת ${name}`,
  /** "משפחת כהן", "משפחת כהן (נועה, טל)" or "משפחת כהן 2" (see shared/familyLabel.ts). */
  familyLabel: (p: FamilyLabelParts) =>
    p.ordinal ? `משפחת ${p.name.trim()} ${p.ordinal}` : p.extra?.length ? `משפחת ${p.name.trim()} (${p.extra.join(", ")})` : `משפחת ${p.name.trim()}`,
  seats: seatsText,
  joinNames,

  common: {
    back: "חזרה",
    close: "סגירה",
    cancel: "ביטול",
    save: "שמירה",
    saving: "שומרים…",
    loading: "טוען…",
    yes: "כן",
    no: "לא",
    optional: "רשות",
    required: "חובה",
    retry: "לנסות שוב",
    copy: "העתקה",
    copied: "הועתק",
    edit: "עריכה",
    remove: "הסרה",
    undo: "ביטול",
    mine: "שלי",
    whatsapp: "WhatsApp",
    call: "התקשרות",
    skip: "דילוג לתוכן",
  },

  identity: {
    actingAs: "פועל/ת בתור:",
    viewOnly: "צפייה בלבד",
    joinCta: "מי אתם?",
    settings: "הגדרות",
    chipHint: "לחצו להגדרות או להחלפת משפחה",
  },

  who: {
    title: "מי אתם?",
    lead: "בחרו את המשפחה שלכם. הבחירה נשמרת בטלפון הזה.",
    empty: "עוד אין משפחות בקבוצה. הירשמו ראשונים.",
    newFamily: "משפחה חדשה — הרשמה",
    justLook: "רק להסתכל",
    confirmTitle: "אישור משפחה",
    confirmParts: (label: string): (string | { b: string })[] => ["אתם ", { b: label }, "?"],
    confirmNote: "תמיד אפשר לשנות בהגדרות.",
    confirm: "כן, זו אנחנו",
    noKids: "בלי ילדים רשומים",
  },

  settings: {
    title: "הגדרות",
    actingAs: (label: string) => `את/ה פועל/ת בתור ${label}`,
    notChosen: "עוד לא בחרתם משפחה בטלפון הזה.",
    choose: "בחירת משפחה",
    switchFamily: "החלפת משפחה",
    editProfile: "עריכת פרטי המשפחה",
    logout: "התנתקות מהטלפון הזה",
    logoutDone: "הטלפון הזה כבר לא פועל בתור אף משפחה",
    shareTitle: "קישור לקבוצה",
    shareHint: "כל מי שיש לו את הקישור יכול לצפות ולפעול בקבוצה. שלחו אותו רק בקבוצת ההורים.",
    share: "שליחת הקישור ב-WhatsApp",
    linkLabel: "קישור ההזמנה לקבוצה",
  },

  errors: {
    forbidden: "אין לך הרשאה לפעולה הזאת. אפשר לשנות רק את המשפחה שלך, או ילדים ברכב שלך.",
    not_found: "לא מצאנו את מה שחיפשת. ייתכן שהקישור שגוי או שהפריט נמחק.",
    invalid: "חלק מהפרטים לא תקינים. בדקו את השדות ונסו שוב.",
    seat_taken: "מישהו כבר הושיב את הילד/ה הזה/ו בכיוון הזה. רעננו ובחרו שוב.",
    car_full: "הרכב התמלא ברגע זה. בחרו רכב אחר או בקשו מהנהג/ת להוסיף מקום.",
    stale: "בדיוק היה עדכון של מישהו אחר. טענו מחדש את הנתונים, נסו שוב.",
    feature_off: "האפשרות הזאת לא פעילה כרגע. אפשר להמשיך ידנית.",
    too_large: "התמונה גדולה מדי. נסו תמונה אחרת או צלמו מחדש.",
    undo_expired: "עברו יותר משתי דקות, אז כבר אי אפשר לבטל. אפשר לתקן ידנית.",
    slug_taken: "הכתובת הזאת כבר תפוסה. בחרו שם אחר באנגלית.",
    network: "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.",
    unknown: "משהו השתבש. נסו שוב בעוד רגע.",
  } satisfies Record<ClientErrorCode, string>,

  home: {
    title: "הקבוצות שלי",
    emptyTitle: "הסעות משותפות בלי בלגן",
    emptyBody:
      "טרמפוש מסדר מי מסיע את מי לאירועים של הילדים. פותחים קבוצה לכיתה או לחוג, שולחים קישור בקבוצת ההורים, וכל משפחה נרשמת פעם אחת.",
    emptyHint: "קיבלתם קישור מהורה אחר? פשוט פתחו אותו.",
    create: "צור קבוצה חדשה",
    open: "פתיחה",
  },

  newGroup: {
    title: "קבוצה חדשה",
    nameLabel: "שם הקבוצה",
    namePlaceholder: "לדוגמה: כיתה ד׳ 2",
    nameHint: "השם שההורים יראו בהזמנה.",
    slugLabel: "שם באנגלית לכתובת",
    slugHint: (url: string) => `הקישור יהיה ${url}`,
    slugInvalid: "רק אותיות אנגליות קטנות, ספרות ומקף, 3–40 תווים, בלי מקף בהתחלה או בסוף.",
    slugTaken: (suggestion?: string) =>
      suggestion ? `הכתובת הזאת כבר תפוסה. אולי ${suggestion}?` : "הכתובת הזאת כבר תפוסה. נסו שם אחר.",
    useSuggestion: (s: string) => `להשתמש ב-${s}`,
    submit: "יצירת הקבוצה",
    createdTitle: "הקבוצה מוכנה!",
    createdBody: "שלחו את הקישור בקבוצת ההורים. כל משפחה נרשמת פעם אחת.",
    share: "שליחה בקבוצת ההורים",
    continue: "המשך להרשמה של המשפחה שלי",
    linkLabel: "קישור ההזמנה",
  },

  join: {
    invited: "קיבלתם קישור בקבוצת ההורים",
    title: (group: string) => `הוזמנתם לקבוצה ${group}`,
    lead: "פעם אחת: שם המשפחה, הורים וטלפונים, כתובת, ילדים ורכב. בלי סיסמה ובלי אפליקציה להתקין.",
    submit: "שמירה והצטרפות",
    pickExisting: "המשפחה שלכם כבר רשומה? בחרו אותה",
    already: (family: string) => `הטלפון הזה כבר פועל בקבוצה בתור ${family}.`,
    toGroup: "לקבוצה",
    dupTitle: "זו המשפחה שלכם?",
    dupText: (family: string, kids: string[]) =>
      `יש כבר ${family} בקבוצה${kids.length ? ` (${kids.join(", ")})` : ""}. זו המשפחה שלכם?`,
    dupTextMany: (name: string, n: number) => `יש כבר ${n} משפחות בשם ${name} בקבוצה. אחת מהן שלכם?`,
    dupYes: "כן, זו אנחנו",
    dupYesOf: (label: string) => `כן, אנחנו ${label}`,
    dupNo: "לא, משפחה אחרת",
    savedPhotosLater: "התמונות של הרכב יעלו מיד אחרי ההרשמה.",
  },

  form: {
    familyName: "שם משפחה",
    familyNameHint: "יופיע כ\"משפחת …\"",
    parents: "הורים",
    parentName: "שם הורה",
    parentPhone: "טלפון נייד",
    phoneHintRequired: "חובה · לדוגמה 050-1234567",
    phoneHintOptional: "רשות · לדוגמה 050-1234567",
    phoneInvalid: "זה לא נראה כמו נייד ישראלי. לדוגמה 050-1234567",
    addParent: "+ הורה נוסף",
    removeParent: "הסרת ההורה",
    address: "כתובת הבית",
    addressHint: "לאיסוף. כל המשפחות בקבוצה רואות אותה.",
    addressSuggestions: "הצעות כתובת",
    kids: "ילדים",
    kidsHint: "טלפון לילד/ה הוא רשות",
    kidName: "שם הילד/ה",
    kidPhone: "הטלפון של הילד/ה",
    addKid: "+ ילד/ה",
    removeKid: "הסרת הילד/ה",
    cars: "רכבים",
    carsHint: "רשות. בלי רכב אפשר עדיין להושיב את הילדים אצל אחרים.",
    carLabel: "איזה רכב?",
    carLabelPlaceholder: "לדוגמה: מאזדה אדומה",
    carSeats: "מקומות לילדים",
    carSeatsHint: "בלי הנהג/ת",
    carColor: "צבע (רשות)",
    carPlate: "3 ספרות אחרונות (רשות)",
    carPhoto: "+ תמונת הרכב (רשות)",
    carPhotoReplace: "החלפת תמונת הרכב",
    carPhotoRemove: "הסרת התמונה",
    addCar: "+ רכב",
    removeCar: "הסרת הרכב",
    fixErrors: "יש שדות שצריך לתקן (מסומנים באדום).",
    requiredField: "שדה חובה",
    plateInvalid: "עד 3 ספרות",
    less: "פחות",
    more: "יותר",
  },

  group: {
    upcoming: "אירועים קרובים",
    past: "אירועים שעברו",
    empty: "עוד אין אירועים. הוסיפו את הראשון, מתחילים מתמונת ההזמנה.",
    newEvent: "+ אירוע חדש",
    joinCta: "בחירת משפחה או הרשמה",
    viewOnlyNote: "אתם צופים בקבוצה בלי לבחור משפחה. כדי להושיב ילדים או להציע רכב, בחרו את המשפחה שלכם או הירשמו.",
    myFamily: "המשפחה שלי",
    settings: "הגדרות",
    invite: "הזמנת משפחות לקבוצה",
    familiesCount: (n: number) => (n === 1 ? "משפחה אחת בקבוצה" : `${n} משפחות בקבוצה`),
  },

  newEvent: {
    title: "אירוע חדש",
    lead: "מתחילים מתמונת ההזמנה שקיבלתם.",
    leadParse: "מתחילים מתמונת ההזמנה שקיבלתם. נזהה את הפרטים ונמלא את הטופס בשבילכם.",
    drop: "גררו לכאן את ההזמנה",
    or: "או",
    pick: "בחר/י הזמנה מהגלריה",
    manual: "בלי הזמנה: מילוי ידני",
    uploading: "מעלים את התמונה…",
    parsing: "מזהה פרטים…",
    parsed: "זיהינו מההזמנה. בדקו",
    parsedHint: "השדות הצהובים מולאו אוטומטית. אפשר לשנות הכל, וכלום לא נשמר עד \"צור אירוע\".",
    parseFailed: "לא הצלחנו לקרוא את ההזמנה. מלאו את הפרטים ידנית, התמונה תישאר כעטיפה.",
    multiTimes: (times: string[]) =>
      `בהזמנה כמה זמנים: ${times.join(", ")}. שמנו את הראשון כהתחלה ואת האחרון כאיסוף לחזור. בדקו.`,
    detected: "זוהה",
    fTitle: "שם האירוע",
    fTitlePlaceholder: "לדוגמה: יום הולדת 12 לתמר",
    fDate: "תאריך",
    fStart: "שעת התחלה",
    fReturn: "איסוף לחזור",
    fReturnHint: "מתי אוספים את הילדים בסוף",
    fPlace: "מקום",
    fPlacePlaceholder: "לדוגמה: פארק הירקון",
    fAddress: "כתובת",
    fSlugWord: "מילה באנגלית לכתובת (לא חובה)",
    fSlugWordHint: (slug: string) => `הכתובת תהיה …/e/${slug}`,
    cover: "תמונת ההזמנה",
    removeCover: "הסרת התמונה",
    submit: "צור אירוע",
  },

  event: {
    returnAt: (t: string) => `איסוף לחזור: ${t}`,
    inviteFull: "ההזמנה במסך מלא",
    myKids: "הילדים שלי",
    noKids: "אין ילדים בפרופיל. הוסיפו ילדים ב\"המשפחה שלי\".",
    coming: "מגיע/ה",
    out: "הלוך",
    back: "חזור",
    notAnswered: "עוד לא עניתם",
    notComing: "לא מגיע/ה",
    legs: "הסעות",
    toBoard: "לשיבוץ",
    driveMode: "מצב נהג",
    share: "שתף סיכום לקבוצה",
    joinToRsvp: "כדי לרשום את הילדים, בחרו את המשפחה שלכם או הירשמו.",
    savedPlan: (kid: string) => `עודכן: ${kid}`,
  },

  gap: {
    missing: missingText,
    unassigned: (waiting: number) => `יש מקום לכולם · ${waiting} ממתינים לשיבוץ`,
    ok: (leg: Leg) => `כולם מסודרים ב${legName[leg]} ✓`,
    none: (leg: Leg) => `עוד אין צורך בהסעה ב${legName[leg]}`,
    progress: (seated: number, need: number) => `${seated}/${need} שובצו`,
    shortMissing: (n: number, leg: Leg) => (n === 1 ? `חסר 1 · ${legName[leg]}` : `חסרים ${n} · ${legName[leg]}`),
    shortWaiting: (n: number, leg: Leg) => `${n} ממתינים · ${legName[leg]}`,
    shortOk: (leg: Leg) => `${legName[leg]}: מסודר ✓`,
    shortNone: (leg: Leg) => `${legName[leg]}: אין צורך`,
    ask: "בקש מהקבוצה",
  },

  board: {
    tabs: "כיוון",
    waiting: (leg: Leg) => `ממתינים להסעה ב${legName[leg]}`,
    noneWaiting: "אין ממתינים ✓",
    pickHint: "בחרו ילד/ה, ואז מושב פנוי",
    seatHint: (kid: string) => `עכשיו לחצו על מושב מקווקו בשביל ${kid}`,
    take: "אני לוקח/ת",
    cars: "רכבים",
    noCars: "עוד אין רכבים בכיוון הזה.",
    offer: (leg: Leg) => `+ אני נוהג/ת ב${legName[leg]}`,
    noCarInProfile: "כדי להציע הסעה, הוסיפו רכב בפרופיל המשפחה.",
    toProfile: "להוספת רכב",
    history: "היסטוריה",
    noHistory: "עוד לא היו פעולות.",
    departs: (t: string) => `יציאה ${t}`,
    seatCount: (used: number, total: number) => `${used}/${total}`,
    emptySeat: (family: string) => `מושב פנוי ברכב של ${family}`,
    seatedKid: (kid: string) => `${kid}, לחצו לאפשרויות`,
    // friendly refusals
    whyViewOnly: "כדי לשבץ צריך לבחור את המשפחה שלכם (או להירשם).",
    whyNotMyKid: (kid: string) =>
      `אפשר להושיב רק את הילדים שלך, או ילדים ברכב שלך. ${kid} לא שלך, ואין לך רכב בכיוון הזה.`,
    whySeatNotAllowed: (kid: string, family: string) =>
      `${kid} לא מהמשפחה שלך והרכב של ${family}, אז רק הם יכולים להושיב אותו/ה כאן.`,
    whyPickFirst: "בחרו קודם ילד/ה מהממתינים, ואז לחצו על מושב פנוי.",
    whyNoWaiting: "אין ילדים שממתינים בכיוון הזה.",
    whyUnseat: (kid: string) => `רק הנהג/ת או המשפחה של ${kid} יכולים להוריד אותו/ה מהרכב.`,
    whyFull: "הרכב הזה מלא.",
  },

  seatSheet: {
    title: "אישור הושבה",
    /** Sentence parts; `{ b }` parts are highlighted. */
    parts: (kid: string, family: string, leg: Leg, time: string): (string | { b: string })[] =>
      ["להושיב את ", { b: kid }, " ברכב של ", { b: family }, `, ${legName[leg]}, `, { b: time }, "?"],
    partsMine: (kid: string, leg: Leg, time: string): (string | { b: string })[] =>
      ["לקחת את ", { b: kid }, ` ברכב שלך, ${legName[leg]}, `, { b: time }, "?"],
    notice: "הם יראו את זה מיד, עם השם שלך.",
    confirm: "כן, להושיב",
    confirmTake: "כן, אני לוקח/ת",
  },

  unseatSheet: {
    title: "הורדה מהרכב",
    sentence: (kid: string, family: string, leg: Leg) =>
      `להוריד את ${kid} מהרכב של ${family} ב${legName[leg]}? ${kid} יחזור/תחזור לממתינים.`,
    confirm: "כן, להוריד",
  },

  carSheet: {
    titleNew: (leg: Leg) => `אני נוהג/ת ב${legName[leg]}`,
    titleEdit: "עריכת ההצעה",
    car: "רכב",
    seats: "מקומות לילדים",
    seatsMin: (n: number) => `כבר יושבים ${n}, אי אפשר פחות מזה`,
    depart: "שעת יציאה",
    submit: "פרסום ההצעה",
    save: "שמירת השינויים",
    remove: "הסרת ההצעה",
    removeConfirm: "בטוח? הילדים שברכב יחזרו לממתינים.",
    removeYes: "כן, להסיר",
  },

  toast: {
    seated: (kid: string, family: string) => `${kid} הושב/ה ברכב של ${family}`,
    took: (kid: string) => `${kid} ברכב שלך`,
    unseated: (kid: string) => `${kid} חזר/ה לממתינים`,
    offered: (leg: Leg) => `ההצעה שלך ב${legName[leg]} פורסמה`,
    offerUpdated: "ההצעה עודכנה",
    offerRemoved: "ההצעה הוסרה",
    planSaved: (kid: string) => `עודכן: ${kid}`,
    started: "סימנו שיצאת",
    picked: (kid: string) => `${kid} עלה/תה`,
    unpicked: (kid: string) => `${kid} סומן/ה כלא עלה/תה`,
    undone: "בוטל",
    saved: "נשמר",
    copied: "הועתק",
    undoIn: (s: number) => `${s} שנ׳`,
  },

  log: {
    title: "היסטוריה",
    undone: "(בוטל)",
    line: (family: string, text: string) => `${family}: ${text}`,
    setKidPlan: (kid: string, rsvp: "yes" | "no", out: boolean, back: boolean) =>
      rsvp === "no"
        ? `סימנו ש${kid} לא מגיע/ה`
        : `רשמו את ${kid}${out && back ? ", הלוך וחזור" : out ? ", הלוך בלבד" : back ? ", חזור בלבד" : ", בלי הסעה"}`,
    offerCar: (leg: Leg, seats: number) => `הציעו רכב ב${legName[leg]} · ${seatsText(seats)}`,
    updateOffer: "עדכנו את ההצעה",
    removeOffer: "הסירו את ההצעה",
    seatKid: (kid: string, family: string) => `הושיבו את ${kid} ברכב של ${family}`,
    unseatKid: (kid: string) => `הורידו את ${kid} מהרכב`,
    startRun: "יצאו לדרך",
    setPicked: (kid: string, picked: boolean) => (picked ? `${kid} עלה/תה לרכב` : `ביטלו איסוף של ${kid}`),
    setKidReady: (kid: string) => `${kid} מוכן/ה`,
    editEvent: "עדכנו את פרטי האירוע",
    undo: "ביטלו פעולה",
    other: "פעולה",
  },

  drive: {
    title: (leg: Leg) => `מצב נהג · ${legName[leg]}`,
    noOffer: "אין לך הצעה בכיוון הזה.",
    toBoard: "ללוח השיבוץ",
    start: "יצאתי",
    onTheWay: "בדרך",
    notifyTitle: "הודיעו להורים שיצאת",
    notifyNoPhone: "אין טלפון גלוי",
    checklist: "רשימת איסוף",
    noKids: "עוד אין ילדים ברכב.",
    allIn: (n: number) => `כולם עלו · ${n}/${n}`,
    ready: "מוכן/ה ✓",
    callKid: (kid: string) => `התקשרות ל${kid}`,
    callParent: (name: string) => `התקשרות ל${name}`,
    waKid: (kid: string) => `WhatsApp ל${kid}`,
    waParent: (name: string) => `WhatsApp ל${name}`,
    kidPhone: "טלפון הילד/ה",
    parentPhone: (name: string) => `טלפון של ${name}`,
    nav: "ניווט",
    maps: "Google Maps · כל העצירות",
    waze: "Waze לעצירה הבאה",
    tooMany: "יש יותר מ-8 עצירות, Maps יציג את 8 הראשונות.",
    noAddress: "אין כתובות גלויות לניווט.",
  },

  profile: {
    title: "המשפחה שלי",
    kidLinks: "קישור אישי לכל ילד/ה",
    kidLinksHint: "הקישור לקריאה בלבד, אפשר לשלוח לטלפון של הילד/ה.",
    sendKidLink: (kid: string) => `שליחת הקישור ל${kid} ב-WhatsApp`,
    saved: "הפרופיל נשמר",
    notRegistered: "עוד לא בחרתם משפחה בטלפון הזה.",
  },

  kid: {
    hi: (name: string) => `היי ${name}!`,
    lead: "זה הקישור שלך. כאן רואים מי אוסף אותך ומתי.",
    noEvents: "עוד אין הסעות. כשההורים ירשמו אותך לאירוע, הוא יופיע כאן.",
    tip: "טיפ: שמרו את הדף במסך הבית של הטלפון.",
    pickup: (leg: Leg) => (leg === "out" ? "הלוך · אוספים אותך מהבית" : "חזור · איסוף הביתה"),
    notNeeded: "לא צריך הסעה בכיוון הזה",
    searching: "עוד מחפשים לך הסעה",
    noRide: "עוד אין לך הסעה",
    searchingHint: "ההורים שלך יקבלו עדכון",
    driver: (family: string) => `משפחת ${family} אוספת אותך`,
    at: (t: string) => `יציאה ב-${t}`,
    findCar: "חפשי/חפש את הרכב הזה",
    callDriver: (name: string) => `התקשרות ל${name}`,
    ready: "אני מוכן/ה",
    readyDone: "שלחת \"אני מוכן/ה\" ✓",
    onTheWay: "בדרך אליך",
    pickedUp: "עלית לרכב ✓",
    notComing: "סומן שלא מגיע/ה",
  },

  invite: {
    title: "ההזמנה",
    none: "אין תמונת הזמנה לאירוע הזה.",
  },

  notFound: {
    title: "הדף לא נמצא",
    body: "ייתכן שהקישור חסר או שגוי.",
    home: "לדף הבית",
  },

  image: {
    processing: "מכינים את התמונה…",
    failed: "לא הצלחנו לקרוא את התמונה. נסו קובץ אחר (JPG או PNG).",
    tooBig: "גם אחרי הקטנה התמונה גדולה מדי. נסו תמונה אחרת.",
  },

  /* ---------- WhatsApp templates ---------- */
  wa: {
    groupInvite: (group: string, url: string) =>
      `היי לכולם 👋\nפתחתי קבוצה בטרמפוש לתיאום הסעות של ${group}.\nכל משפחה נרשמת פעם אחת (דקה):\n${url}`,
    ask: (title: string, date: string, missing: number, leg: Leg, url: string) =>
      `היי לכולם 👋\nל${title} (${date}) ${missing > 0 ? missingText(missing, leg) : `חסר נהג ל${legName[leg]}`}.\nמי יכול/ה להסיע? נרשמים כאן:\n${url}`,
    summary: (p: {
      title: string;
      date: string;
      place: string;
      legs: { leg: Leg; time: string; cars: { family: string; departAt: string; kids: string[] }[]; missing: number }[];
      url: string;
    }) => {
      let t = `🎈 ${p.title} · ${p.date}\n📍 ${p.place}\n`;
      for (const l of p.legs) {
        t += `\n${legName[l.leg]} (${l.time}):\n`;
        if (l.cars.length === 0) t += "עוד אין רכבים\n";
        for (const c of l.cars) t += `🚗 ${c.family} ${c.departAt}: ${c.kids.length ? c.kids.join(", ") : "עוד אין ילדים"}\n`;
        if (l.missing > 0) t += `⚠️ ${missingText(l.missing, l.leg)}\n`;
      }
      return `${t}\nפרטים והרשמה: ${p.url}`;
    },
    leftHome: (kids: string[]) => `היי, יצאתי 🚗 אגיע לאסוף את ${joinNames(kids)} בעוד ~10 דק׳`,
    downstairs: (kid: string) => `היי ${kid}, אני למטה 🚗`,
    downstairsParent: (kid: string) => `היי, אני למטה עם הרכב, מחכה ל${kid} 🚗`,
    kidLink: (kid: string, url: string) =>
      `היי ${kid} 💛 זה הקישור שלך לטרמפוש. שם רואים מי אוסף אותך ומתי:\n${url}`,
  },
};

export function errorText(code: string): string {
  return (he.errors as Record<string, string>)[code] ?? he.errors.unknown;
}
