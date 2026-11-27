// Everything the app says aloud or shows, in Marathi, Hindi and English.
// Spoken lines are kept short (one breath, at most ~15 words).

export type Lang = "mr" | "hi" | "en";

export const SPEECH_LANG: Record<Lang, string> = { mr: "mr-IN", hi: "hi-IN", en: "en-IN" };
export const LANG_LABEL: Record<Lang, string> = { mr: "मराठी", hi: "हिंदी", en: "English" };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export interface Phrases {
  ready: string;
  readback: (name: string, w?: number, h?: number, deltaG?: number | null) => string;
  saved: string;
  next: string;
  whichChild: (a: string, b: string) => string;
  notOnList: (spoken: string) => string;
  askField: (field: "weight" | "height" | "name") => string;
  didYouMean: (field: "weight" | "height", said: number, prev: number | undefined, sug: number | undefined) => string;
  forceSaveWarn: string;
  discarded: string;
  sam: (name: string, lostG: number | null) => string;
  mam: (name: string) => string;
  faltering: (name: string) => string;
  pending: (names: string[]) => string;
  nonePending: string;
  undone: (name: string) => string;
  sessionEnd: (done: number, alerts: number) => string;
  notHeard: string;
  tapFallback: string;
  ui: Record<string, string>;
}

const mr: Phrases = {
  ready: "तयार. मुलाचे नाव, वजन आणि उंची सांगा.",
  readback: (n, w, h, d) =>
    `${n}. ${w !== undefined ? `वजन ${fmt(w)} किलो` : ""}${h !== undefined ? `, उंची ${fmt(h)} सेंटीमीटर` : ""}.${d ? ` ${Math.abs(d)} ग्रॅम ${d > 0 ? "वाढ" : "घट"}.` : ""} बरोबर?`,
  saved: "जतन केले.",
  next: "पुढचे मूल.",
  whichChild: (a, b) => `${a} की ${b}?`,
  notOnList: (s) => `${s} हे नाव यादीत नाही. पुन्हा सांगा.`,
  askField: (f) =>
    f === "weight" ? "वजन पुन्हा सांगा." : f === "height" ? "उंची पुन्हा सांगा." : "मुलाचे नाव सांगा.",
  didYouMean: (f, said, prev, sug) => {
    const unit = f === "weight" ? "किलो" : "सेंटीमीटर";
    const p = prev !== undefined ? `मागच्या महिन्यात ${fmt(prev)} ${unit} होते. ` : "";
    return sug !== undefined
      ? `${p}आता ${fmt(said)}? तुम्हाला ${fmt(sug)} म्हणायचे आहे का?`
      : `${p}आता ${fmt(said)}? पुन्हा मोजा.`;
  },
  forceSaveWarn: "हे असामान्य आहे. खात्री असेल तर पुन्हा हो म्हणा.",
  discarded: "रद्द केले. पुन्हा सांगा.",
  sam: (n, g) => `${n} ${g ? `चे वजन ${g} ग्रॅम कमी झाले. ` : ""}तीव्र कुपोषण. रेफरल यादीत जोडले.`,
  mam: (n) => `${n} मध्यम कुपोषित आहे. पोषण सल्ला आणि पाठपुरावा करा.`,
  faltering: (n) => `${n} चे वजन वाढले नाही. घरभेटीत लक्ष द्या.`,
  pending: (names) => `बाकी ${names.length}: ${names.slice(0, 6).join(", ")}`,
  nonePending: "सर्व मुलांचे वजन झाले.",
  undone: (n) => `${n} ची शेवटची नोंद रद्द केली.`,
  sessionEnd: (d, a) => `सत्र संपले. ${d} मुलांचे वजन, ${a} सूचना.`,
  notHeard: "ऐकू आले नाही. पुन्हा सांगा.",
  tapFallback: "आवाज स्पष्ट नाही. आकडे बटणाने भरा.",
  ui: {
    appName: "पोषणवाणी", tagline: "बोला, मोजा, नोंदवा", start: "वजन सुरू करा", listening: "ऐकत आहे…",
    speaking: "बोलत आहे…", tapToSpeak: "बोलण्यासाठी दाबा", weighed: "वजन झाले", of: "पैकी",
    weight: "वजन", height: "उंची", muac: "MUAC", kg: "किलो", cm: "सेमी", confirm: "बरोबर", redo: "पुन्हा",
    children: "मुले", alerts: "सूचना", session: "वजन सत्र", summary: "सारांश", exportCsv: "Poshan Tracker CSV",
    offline: "ऑफलाइन", online: "ऑनलाइन", waitingSync: "नोंदी सिंक बाकी", syncNow: "आता सिंक करा",
    lastMonth: "मागील महिना", normal: "सामान्य", mam: "मध्यम कुपोषण", sam: "तीव्र कुपोषण",
    referral: "रेफरल", share: "WhatsApp वर पाठवा", age: "वय", months: "महिने", heard: "ऐकले",
    endSession: "सत्र संपवा", pendingList: "बाकी मुले", noAlerts: "आज कोणतीही सूचना नाही",
    keypad: "आकडे भरा", save: "जतन करा", cancel: "रद्द", settings: "सेटिंग्ज", language: "भाषा",
    voiceEngine: "आवाज ओळख", keyNotSet: "key not set", handsFree: "हात मोकळे मोड", history: "इतिहास",
    faltering: "वजन वाढले नाही", whichOne: "कोणते मूल?", heardLabel: "ऐकले", understood: "समजले", familyMsg: "कुटुंबासाठी संदेश", play: "ऐकवा", honesty: "डेटा विश्वासार्हता", typedLater: "नंतर टाइप केलेले", spokenLive: "वजनकाट्यावरच बोललेले", digitPref: "अंक-पसंती", copied: "कॉपी केलेली उंची", voiceShare: "आवाजाने नोंद", watchList: "लक्ष ठेवा", speakList: "यादी ऐकवा", race: "टायपिंग विरुद्ध आवाज", typingTime: "टायपिंग", voiceTime: "आवाज", perChild: "प्रति मूल", r_sam: "तीव्र कुपोषण", r_mam: "मध्यम कुपोषण", r_flat2: "दोन महिने वजन वाढले नाही", r_slide: "वजन-उंची घसरत आहे", r_slow: "वजन खूप हळू वाढते", indicative: "अंदाजे", reset: "डेमो डेटा पुन्हा भरा", suggestion: "कदाचित",
  },
};

const hi: Phrases = {
  ready: "तैयार. बच्चे का नाम, वजन और लंबाई बोलिए.",
  readback: (n, w, h, d) =>
    `${n}. ${w !== undefined ? `वजन ${fmt(w)} किलो` : ""}${h !== undefined ? `, लंबाई ${fmt(h)} सेंटीमीटर` : ""}.${d ? ` ${Math.abs(d)} ग्राम ${d > 0 ? "बढ़ा" : "घटा"}.` : ""} सही है?`,
  saved: "सेव हो गया.",
  next: "अगला बच्चा.",
  whichChild: (a, b) => `${a} या ${b}?`,
  notOnList: (s) => `${s} नाम सूची में नहीं है. फिर से बोलिए.`,
  askField: (f) =>
    f === "weight" ? "वजन फिर से बोलिए." : f === "height" ? "लंबाई फिर से बोलिए." : "बच्चे का नाम बोलिए.",
  didYouMean: (f, said, prev, sug) => {
    const unit = f === "weight" ? "किलो" : "सेंटीमीटर";
    const p = prev !== undefined ? `पिछले महीने ${fmt(prev)} ${unit} था. ` : "";
    return sug !== undefined
      ? `${p}अब ${fmt(said)}? क्या आपका मतलब ${fmt(sug)} है?`
      : `${p}अब ${fmt(said)}? दोबारा नापिए.`;
  },
  forceSaveWarn: "यह असामान्य है. पक्का हो तो फिर से हाँ बोलिए.",
  discarded: "रद्द किया. फिर से बोलिए.",
  sam: (n, g) => `${n} ${g ? `का वजन ${g} ग्राम कम हुआ. ` : ""}गंभीर कुपोषण. रेफरल सूची में जोड़ा.`,
  mam: (n) => `${n} मध्यम कुपोषित है. पोषण सलाह और फॉलो-अप करें.`,
  faltering: (n) => `${n} का वजन नहीं बढ़ा. गृह भेंट में ध्यान दें.`,
  pending: (names) => `बाकी ${names.length}: ${names.slice(0, 6).join(", ")}`,
  nonePending: "सभी बच्चों का वजन हो गया.",
  undone: (n) => `${n} की आखिरी एंट्री हटाई.`,
  sessionEnd: (d, a) => `सत्र समाप्त. ${d} बच्चों का वजन, ${a} अलर्ट.`,
  notHeard: "सुनाई नहीं दिया. फिर से बोलिए.",
  tapFallback: "आवाज़ साफ नहीं है. बटन से नंबर भरिए.",
  ui: {
    appName: "पोषणवाणी", tagline: "बोलो, नापो, दर्ज करो", start: "वजन शुरू करें", listening: "सुन रहा है…",
    speaking: "बोल रहा है…", tapToSpeak: "बोलने के लिए दबाएँ", weighed: "वजन हुआ", of: "में से",
    weight: "वजन", height: "लंबाई", muac: "MUAC", kg: "किलो", cm: "सेमी", confirm: "सही", redo: "दोबारा",
    children: "बच्चे", alerts: "अलर्ट", session: "वजन सत्र", summary: "सारांश", exportCsv: "Poshan Tracker CSV",
    offline: "ऑफलाइन", online: "ऑनलाइन", waitingSync: "एंट्री सिंक बाकी", syncNow: "अभी सिंक करें",
    lastMonth: "पिछला महीना", normal: "सामान्य", mam: "मध्यम कुपोषण", sam: "गंभीर कुपोषण",
    referral: "रेफरल", share: "WhatsApp पर भेजें", age: "उम्र", months: "महीने", heard: "सुना",
    endSession: "सत्र खत्म करें", pendingList: "बाकी बच्चे", noAlerts: "आज कोई अलर्ट नहीं",
    keypad: "नंबर भरें", save: "सेव करें", cancel: "रद्द", settings: "सेटिंग्स", language: "भाषा",
    voiceEngine: "आवाज़ पहचान", keyNotSet: "key not set", handsFree: "हैंड्स-फ्री मोड", history: "इतिहास",
    faltering: "वजन नहीं बढ़ा", whichOne: "कौन सा बच्चा?", heardLabel: "सुना", understood: "समझा", familyMsg: "परिवार के लिए संदेश", play: "सुनाएँ", honesty: "डेटा विश्वसनीयता", typedLater: "बाद में टाइप किया", spokenLive: "तराजू पर ही बोला", digitPref: "अंक-पसंद", copied: "कॉपी की गई लंबाई", voiceShare: "आवाज़ से एंट्री", watchList: "ध्यान दें", speakList: "सूची सुनाएँ", race: "टाइपिंग बनाम आवाज़", typingTime: "टाइपिंग", voiceTime: "आवाज़", perChild: "प्रति बच्चा", r_sam: "गंभीर कुपोषण", r_mam: "मध्यम कुपोषण", r_flat2: "दो महीने से वजन नहीं बढ़ा", r_slide: "वजन-लंबाई गिर रही है", r_slow: "वजन बहुत धीरे बढ़ रहा", indicative: "संकेतात्मक", reset: "डेमो डेटा फिर से भरें", suggestion: "शायद",
  },
};

const en: Phrases = {
  ready: "Ready. Say the child's name, weight and height.",
  readback: (n, w, h, d) =>
    `${n}. ${w !== undefined ? `${fmt(w)} kilo` : ""}${h !== undefined ? `, ${fmt(h)} centimetre` : ""}.${d ? ` ${d > 0 ? "Up" : "Down"} ${Math.abs(d)} grams.` : ""} Correct?`,
  saved: "Saved.",
  next: "Next child.",
  whichChild: (a, b) => `${a} or ${b}?`,
  notOnList: (s) => `${s} is not on the list. Please say it again.`,
  askField: (f) =>
    f === "weight" ? "Say the weight again." : f === "height" ? "Say the height again." : "Say the child's name.",
  didYouMean: (f, said, prev, sug) => {
    const unit = f === "weight" ? "kilo" : "centimetre";
    const p = prev !== undefined ? `Last month ${fmt(prev)} ${unit}. ` : "";
    return sug !== undefined ? `${p}Now ${fmt(said)}? Did you mean ${fmt(sug)}?` : `${p}Now ${fmt(said)}? Please measure again.`;
  },
  forceSaveWarn: "This looks unusual. Say yes again if you are sure.",
  discarded: "Discarded. Please say it again.",
  sam: (n, g) => `${n}${g ? ` lost ${g} grams. ` : ". "}Severe acute malnutrition. Added to the referral list.`,
  mam: (n) => `${n} has moderate malnutrition. Counsel and follow up.`,
  faltering: (n) => `${n} has not gained weight. Check on the home visit.`,
  pending: (names) => `${names.length} left: ${names.slice(0, 6).join(", ")}`,
  nonePending: "All children are weighed.",
  undone: (n) => `Removed the last entry for ${n}.`,
  sessionEnd: (d, a) => `Session ended. ${d} children weighed, ${a} alerts.`,
  notHeard: "I did not catch that. Please say it again.",
  tapFallback: "Too noisy. Enter the numbers with the keypad.",
  ui: {
    appName: "PoshanVaani", tagline: "Speak, measure, record", start: "Start weighing", listening: "Listening…",
    speaking: "Speaking…", tapToSpeak: "Tap to speak", weighed: "weighed", of: "of",
    weight: "Weight", height: "Height", muac: "MUAC", kg: "kg", cm: "cm", confirm: "Correct", redo: "Redo",
    children: "Children", alerts: "Alerts", session: "Weighing", summary: "Summary", exportCsv: "Poshan Tracker CSV",
    offline: "Offline", online: "Online", waitingSync: "entries waiting to sync", syncNow: "Sync now",
    lastMonth: "Last month", normal: "Normal", mam: "Moderate (MAM)", sam: "Severe (SAM)",
    referral: "Referral", share: "Send on WhatsApp", age: "Age", months: "months", heard: "Heard",
    endSession: "End session", pendingList: "Not weighed yet", noAlerts: "No alerts today",
    keypad: "Enter numbers", save: "Save", cancel: "Cancel", settings: "Settings", language: "Language",
    voiceEngine: "Speech engine", keyNotSet: "key not set", handsFree: "Hands-free mode", history: "History",
    faltering: "No weight gain", whichOne: "Which child?", heardLabel: "Heard", understood: "Understood", familyMsg: "Message for the family", play: "Play aloud", honesty: "Data honesty", typedLater: "Typed in later", spokenLive: "Spoken at the scale", digitPref: "Digit preference", copied: "Heights copied", voiceShare: "Captured by voice", watchList: "Watch list", speakList: "Speak the list", race: "Typing vs voice", typingTime: "Typing", voiceTime: "Voice", perChild: "per child", r_sam: "Severe acute malnutrition", r_mam: "Moderate acute malnutrition", r_flat2: "No weight gain for 2 months", r_slide: "Weight-for-height sliding", r_slow: "Gaining too slowly", indicative: "indicative", reset: "Reload demo data", suggestion: "Maybe",
  },
};

export const PHRASES: Record<Lang, Phrases> = { mr, hi, en };
