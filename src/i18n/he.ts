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
  joinNames,

  common: {
    back: "חזרה",
    close: "סגירה",
    cancel: "ביטול",
    save: "שמירה",
    saving: "שומרים…",
    loading: "טוען…",
    retry: "לנסות שוב",
    edit: "עריכה",
    undo: "ביטול",
    mine: "שלי",
    call: "התקשרות",
    skip: "דילוג לתוכן",
  },

  identity: {
    actingAs: "פועל/ת בתור:",
    viewOnly: "צפייה בלבד",
    joinCta: "מי אתם?",
    settings: "הגדרות",
    chipHint: "לחצו לפרטי המשפחה",
  },

  who: {
    title: "מי אתם?",
    lead: "בחרו את המשפחה שלכם.",
    empty: "עוד אין משפחות בקבוצה.",
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
    meTitle: "המשפחה בטלפון הזה",
    notChosen: "עוד לא בחרתם משפחה בטלפון הזה.",
    choose: "בחירת משפחה",
    switchFamily: "החלפת משפחה",
    editProfile: "עריכת פרטים",
    logout: "התנתקות מהטלפון הזה",
    logoutDone: "הטלפון הזה כבר לא פועל בתור אף משפחה",
    shareTitle: "קישור לקבוצה",
    shareHint: "שלחו רק בקבוצת ההורים.",
    share: "שליחת הקישור ב-WhatsApp",
    linkLabel: "קישור ההזמנה לקבוצה",
    copy: "העתקה",
    copied: "הקישור הועתק",
    waTitle: "קבוצת הוואטסאפ",
    waLinkLabel: "קישור ההזמנה מוואטסאפ",
    waSave: "שמירת הקישור",
    waRemove: "הסרת הקישור",
    waSaved: "הקישור נשמר",
    waRemoved: "הקישור הוסר",
    deleteTitle: "מחיקת הקבוצה",
    deleteOpen: "מחיקת הקבוצה",
    deleteBody: "כל המשפחות, האירועים והתמונות יימחקו לכולם.",
    deleteType: (name: string) => `לאישור, הקלידו את שם הקבוצה: ${name}`,
    deleteYes: "מחיקה",
    deleting: "מוחקים…",
    deleted: "הקבוצה נמחקה",
  },

  /** The optional linked WhatsApp group (create form, settings, group home). */
  waGroup: {
    label: "קישור לקבוצת הוואטסאפ (לא חובה)",
    hint: "קישור הזמנה מהגדרות הקבוצה בוואטסאפ",
    invalid: "זה לא קישור לקבוצת וואטסאפ. הוא מתחיל ב-chat.whatsapp.com/",
    open: "פתיחת קבוצת הוואטסאפ",
  },

  groupGone: {
    title: "הקבוצה נמחקה",
    body: "המשפחות, האירועים והתמונות שלה נמחקו לכולם.",
    home: "לקבוצות שלי",
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
    event_cancelled: "האירוע בוטל, אז ההסעות מוקפאות. אפשר לשחזר אותו מתפריט האירוע.",
    network: "אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.",
    unknown: "משהו השתבש. נסו שוב בעוד רגע.",
  } satisfies Record<ClientErrorCode, string>,

  home: {
    title: "הקבוצות שלי",
    tagline: "מי מסיע את מי, בלי מאה הודעות בקבוצה.",
    emptyHint: "קיבלתם קישור מהורה אחר? פתחו אותו.",
    create: "צור קבוצה חדשה",
    nextEvent: (date: string) => `האירוע הבא: ${date}`,
  },

  newGroup: {
    title: "קבוצה חדשה",
    nameLabel: "שם הקבוצה",
    namePlaceholder: "לדוגמה: כיתה ד׳ 2",
    slugLabel: "שם באנגלית לכתובת",
    slugHint: (url: string) => `הקישור יהיה ${url}`,
    slugInvalid: "רק אותיות אנגליות קטנות, ספרות ומקף, 3–40 תווים, בלי מקף בהתחלה או בסוף.",
    slugTaken: (suggestion?: string) =>
      suggestion ? `הכתובת הזאת כבר תפוסה. אולי ${suggestion}?` : "הכתובת הזאת כבר תפוסה. נסו שם אחר.",
    useSuggestion: (s: string) => `להשתמש ב-${s}`,
    suggestingSlug: "מציע שם…",
    submit: "יצירת הקבוצה",
    createdTitle: "הקבוצה מוכנה!",
    createdBody: "שלחו את הקישור בקבוצת ההורים.",
    share: "שליחה בקבוצת ההורים",
    continue: "המשך להרשמה של המשפחה שלי",
    linkLabel: "קישור ההזמנה",
  },

  join: {
    title: "הצטרפות לקבוצה",
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
    copyFrom: "העתקה מ:",
    copyNone: "בלי העתקה",
  },

  form: {
    familyName: "שם משפחה",
    familyNameHint: (name: string) => `יופיע כ"משפחת ${name}"`,
    parents: "הורים",
    parentName: "שם הורה",
    parentPhone: "טלפון נייד",
    phoneHintRequired: "חובה · לדוגמה 050-1234567",
    phoneHintOptional: "רשות · לדוגמה 050-1234567",
    phoneInvalid: "זה לא נראה כמו נייד ישראלי. לדוגמה 050-1234567",
    addParent: "+ הורה נוסף",
    removeParent: "הסרת ההורה",
    address: "כתובת הבית",
    addressHint: "גלויה לכל המשפחות בקבוצה",
    addressSuggestions: "הצעות כתובת",
    kids: "ילדים",
    kidName: "שם הילד/ה",
    kidPhone: "הטלפון של הילד/ה",
    addKid: "+ ילד/ה",
    kidsPick: "מי מהילדים בקבוצה הזו?",
    kidsPickRequired: "סמנו או הוסיפו לפחות ילד/ה אחד/ת",
    removeKid: "הסרת הילד/ה",
    cars: "רכבים",
    carsHint: "רשות",
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
    empty: "עוד אין אירועים.",
    newEvent: "+ אירוע חדש",
    joinCta: "בחירת משפחה או הרשמה",
    viewOnlyNote: "כדי להושיב ילדים או להציע רכב, בחרו את המשפחה שלכם או הירשמו.",
    myFamily: "המשפחה שלי",
    settings: "הגדרות",
    invite: "הזמנת משפחות לקבוצה",
    familiesCount: (n: number) => (n === 1 ? "משפחה אחת בקבוצה" : `${n} משפחות בקבוצה`),
  },

  newEvent: {
    title: "אירוע חדש",
    drop: "יש לכם הזמנה - הוסיפו תמונה",
    dropParse: "יש לכם הזמנה - הוסיפו תמונה וניקח ממנה את הפרטים",
    dropHint: "לא חובה. אפשר גם לגרור או להדביק תמונה.",
    uploading: "מעלים את התמונה…",
    parsing: "מזהה פרטים…",
    parsed: "זיהינו מההזמנה. בדקו",
    parsedHint: "השדות הצהובים מולאו מההזמנה.",
    parseFailed: "לא הצלחנו לקרוא את ההזמנה. מלאו את הפרטים ידנית.",
    multiTimes: (times: string[]) =>
      `בהזמנה כמה זמנים: ${times.join(", ")}. שמנו את הראשון כהתחלה ואת האחרון כאיסוף לחזור. בדקו.`,
    detected: "זוהה",
    fTitle: "שם האירוע",
    fTitlePlaceholder: "לדוגמה: יום הולדת 12 לתמר",
    fDate: "תאריך",
    datePast: "התאריך כבר עבר. בחרו תאריך מהיום והלאה.",
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
    sendToKid: (kid: string) => `שליחה ל${kid}`,
    sendToKidLabel: (kid: string) => `שליחת פרטי ההסעה והקישור ל${kid} ב-WhatsApp`,
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
  },

  seatSheet: {
    title: "אישור הושבה",
    /** Sentence parts; `{ b }` parts are highlighted. */
    parts: (kid: string, family: string, leg: Leg, time: string): (string | { b: string })[] =>
      ["להושיב את ", { b: kid }, " ברכב של ", { b: family }, `, ${legName[leg]}, `, { b: time }, "?"],
    partsMine: (kid: string, leg: Leg, time: string): (string | { b: string })[] =>
      ["לקחת את ", { b: kid }, ` ברכב שלך, ${legName[leg]}, `, { b: time }, "?"],
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
    arrived: (kid: string) => `סומן: הגעת לאסוף את ${kid}`,
    unarrived: (kid: string) => `בוטל "הגעתי" אצל ${kid}`,
    unpicked: (kid: string) => `${kid} סומן/ה כלא עלה/תה`,
    undone: "בוטל",
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
    setArrived: (kid: string, arrived: boolean) => (arrived ? `הגיעו לאסוף את ${kid}` : `ביטלו "הגעתי" אצל ${kid}`),
    editEvent: "עדכנו את פרטי האירוע",
    editEventChanges: (changes: string[]) => `עדכנו את פרטי האירוע: ${changes.join(", ")}`,
    cancelEvent: "ביטלו את האירוע",
    restoreEvent: "שחזרו את האירוע",
    confirmDeparture: "אישרו את שעת היציאה",
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
    arrived: "הגעתי",
    arrivedOn: "הגעתי ✓",
    arrivedLabel: (kid: string) => `הגעתי לאסוף את ${kid}`,
    pickedBtn: "עלה/תה",
    shareTitle: "שיתוף עם הנוסעים",
    shareHint: "קישור למעקב אחרי ההסעה בזמן אמת",
    shareTo: (kid: string) => `שליחה ל${kid}`,
  },

  profile: {
    title: "המשפחה שלי",
    kidLinks: "קישור אישי לכל ילד/ה",
    sendKidLink: (kid: string) => `שליחת הקישור ל${kid} ב-WhatsApp`,
    saved: "הפרופיל נשמר",
    notRegistered: "עוד לא בחרתם משפחה בטלפון הזה.",
    notYou: "לא אתם?",
    switchFamily: "החלפת משפחה",
  },

  kid: {
    hi: (name: string) => `היי ${name}!`,
    noEvents: "עוד אין הסעות.",
    pickup: (leg: Leg) => (leg === "out" ? "הלוך · אוספים אותך מהבית" : "חזור · איסוף הביתה"),
    notNeeded: "לא צריך הסעה בכיוון הזה",
    noRide: "עוד אין לך הסעה",
    driver: (family: string) => `משפחת ${family} אוספת אותך`,
    at: (t: string) => `יציאה ב-${t}`,
    findCar: "חפשי/חפש את הרכב הזה",
    callDriver: (name: string) => `התקשרות ל${name}`,
    ready: "אני מוכן/ה",
    readyDone: "שלחת \"אני מוכן/ה\" ✓",
    notComing: "סומן שלא מגיע/ה",
    allRides: "כל ההסעות שלי",
    statusLabel: (leg: Leg) => `מצב ההסעה ב${legName[leg]}`,
    status: {
      waiting: "עוד מחפשים לך הסעה",
      onTheWay: (driver: string) => `${driver} יצא/ה לדרך`,
      next: "את/ה הבא/ה בתור",
      nextHint: "תתכוננו, עוד רגע מגיעים",
      arrived: (driver: string) => `${driver} למטה! 🚗`,
      arrivedHint: "צאו לרכב",
      picked: "עלית לרכב ✓",
      done: "ההסעה הזאת הסתיימה",
    },
  },

  invite: {
    title: "ההזמנה",
    none: "אין תמונת הזמנה לאירוע הזה.",
  },

  /* ---------- event tabs, ⋯ menu, editing, cancelling ---------- */
  manage: {
    tabs: "מסכי האירוע",
    details: "פרטים",
    gapLabel: { missing: "חסרים מקומות", unassigned: "ממתינים לשיבוץ", ok: "מסודר", none: "אין צורך" } as Record<"missing" | "unassigned" | "ok" | "none", string>,
    menu: "פעולות לאירוע",
    menuTitle: "האירוע",
    edit: "עריכת פרטים",
    share: "שיתוף לקבוצה",
    cancel: "ביטול אירוע",
    restore: "שחזור",
    restoreLong: "שחזור האירוע",
    editTitle: "עריכת פרטי האירוע",
    coverReplace: "החלפת תמונת ההזמנה",
    coverAdd: "+ תמונת הזמנה",
    noChange: "לא שונה כלום",
    cancelTitle: "ביטול האירוע",
    cancelParts: (title: string): (string | { b: string })[] => ["לבטל את ", { b: title }, "?"],
    cancelNote: "האירוע יסומן כמבוטל וההסעות יוקפאו. אפשר לשחזר הכל אחר כך.",
    cancelYes: "כן, לבטל",
    cancelled: "האירוע בוטל",
    cancelledTag: "בוטל",
    cancelledNote: "ההסעות מוקפאות: אין שיבוץ ואין מצב נהג.",
    shareCancel: "שתף את הביטול לקבוצה",
    updatedTag: "עודכן",
    timeChanged: (from: string, to: string) => `השעה השתנתה מ-${from} ל-${to}`,
    returnChanged: (from: string, to: string) => `שעת האיסוף לחזור השתנתה מ-${from} ל-${to}`,
    dateChanged: (from: string, to: string) => `התאריך השתנה מ-${from} ל-${to}`,
    shareUpdate: "שתף עדכון לקבוצה",
    dismiss: "הסתרת העדכון",
    checkDepart: "בדקו שעת יציאה",
    confirmDepart: "אישור שעה",
    noPhone: (kid: string) => `+ הוספת טלפון ל${kid}`,
    noPhoneOther: (kid: string) => `אין טלפון ל${kid}`,
    fieldChange: (name: string, from: string, to: string) => `${name} מ-${from} ל-${to}`,
    field: { title: "שם", date: "תאריך", start: "שעה", returnTime: "איסוף לחזור", place: "מקום", address: "כתובת", coverImageId: "תמונה" } as Record<string, string>,
    toastEdited: "פרטי האירוע עודכנו",
    toastCancelled: "האירוע בוטל",
    toastRestored: "האירוע שוחזר",
    toastConfirmed: "שעת היציאה אושרה",
    kidCancelled: "האירוע בוטל",
    myKid: (kid: string, out: string, back: string) => `${kid}: הלוך ${out} · חזור ${back}`,
    waUpdate: (p: { title: string; date: string; lines: string[]; url: string }) =>
      `עדכון ל${p.title} (${p.date}): ${p.lines.join(". ")}.\nנהגים, בדקו את שעת היציאה.\n${p.url}`,
    waCancel: (p: { title: string; date: string; url: string }) => `בוטל: ${p.title} (${p.date}). ההסעות מבוטלות.\n${p.url}`,
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
    groupInvite: (group: string, url: string) => `תיאום הסעות ל${group} בטרמפוש 🚗\nנרשמים כאן פעם אחת:\n${url}`,
    ask: (title: string, date: string, missing: number, leg: Leg, url: string) =>
      `${title} (${date}): ${missing > 0 ? missingText(missing, leg) : `חסר נהג ל${legName[leg]}`}. מי יכול/ה להסיע?\n${url}`,
    /** Title line, one line per leg ("הלוך 09:30: לוי (מאיה, נועה) · חסר מקום אחד"), link. Legs with nothing to say are left out. */
    summary: (p: {
      title: string;
      date: string;
      place: string;
      legs: { leg: Leg; time: string; cars: { family: string; departAt: string; kids: string[] }[]; missing: number }[];
      url: string;
    }) => {
      const lines = [`🎈 ${p.title} · ${p.date} · ${p.place}`];
      for (const l of p.legs) {
        const parts = l.cars.map(
          (c) =>
            `${c.family.replace(/^משפחת /, "")}${c.departAt && c.departAt !== l.time ? ` ${c.departAt}` : ""}${c.kids.length ? ` (${c.kids.join(", ")})` : ""}`,
        );
        if (l.missing > 0) parts.push(l.missing === 1 ? "חסר מקום אחד" : `חסרים ${l.missing} מקומות`);
        if (parts.length) lines.push(`${legName[l.leg]} ${l.time}: ${parts.join(" · ")}`);
      }
      return `${lines.join("\n")}\n${p.url}`;
    },
    leftHome: (kids: string[]) => `יצאתי 🚗 אגיע לאסוף את ${joinNames(kids)} בעוד כ-10 דק׳`,
    downstairs: (kid: string) => `${kid}, אני למטה 🚗`,
    downstairsParent: (kid: string) => `אני למטה, מחכה ל${kid} 🚗`,
    /** Per-event message to a kid: event, one line per leg, and the live kid link. */
    kidEvent: (p: { kid: string; title: string; date: string; legs: string[]; url: string }) =>
      `היי ${p.kid} 💛 ${p.title} · ${p.date}\n${p.legs.join("\n")}\n${p.url}`,
    legLine: (leg: Leg, ride: { family: string; departAt: string } | null) =>
      ride ? `${legName[leg]} ${ride.departAt}: ${ride.family}` : `${legName[leg]}: עוד מחפשים הסעה`,
    trackRide: (url: string) => `אני בדרך לאסוף אותך 🚗 רואים כאן איפה אני:\n${url}`,
    kidLink: (kid: string, url: string) => `היי ${kid} 💛 כאן רואים מי אוסף אותך ומתי:\n${url}`,
  },

  feedback: {
    button: "משוב",
    buttonLabel: "שליחת משוב",
    title: "משוב",
    kindLabel: "סוג המשוב",
    improve: "לשיפור",
    keep: "לשימור",
    textLabel: "מה תרצו לספר לנו?",
    placeholderImprove: "מה הפריע, מה לא עבד, מה חסר… (אפשר גם להקליט)",
    placeholderKeep: "מה עבד טוב ושכדאי לשמור… (אפשר גם להקליט)",
    micStart: "הקלטה קולית",
    micStop: "עצירת ההקלטה",
    transcribing: "מתמלל…",
    transcribeFailed: "לא הצלחנו לתמלל, אבל ההקלטה תצורף למשוב.",
    audioAttached: "הקלטה קולית מצורפת",
    micDenied: "אין גישה למיקרופון. אפשר לכתוב במקום.",
    micUnsupported: "הקלטה לא נתמכת בדפדפן הזה. אפשר לכתוב במקום.",
    uploadFailed: "לא הצלחנו להעלות את ההקלטה. נסו שוב או כתבו.",
    shotAlt: "צילום המסך שיצורף",
    shotRemove: "הסר",
    shotRestore: "צרף",
    shotRemoved: "צילום המסך לא יצורף",
    contextNote: "יצורפו צילום מסך ופרטי מכשיר",
    send: "שליחה",
    sending: "שולחים…",
    thanks: "תודה! המשוב נשלח",
    failed: "השליחה נכשלה. נסו שוב בעוד רגע.",
  },
};

export function errorText(code: string): string {
  return (he.errors as Record<string, string>)[code] ?? he.errors.unknown;
}
