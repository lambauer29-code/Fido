// v0.99.58: einheitliche Symbole – Emoji → Linien-Icon (Tabler Icons, MIT-Lizenz)
import React from "react";
import { IconReceipt, IconFileText, IconShield, IconBuildingBank, IconBuildingCommunity, IconBriefcase, IconStethoscope, IconCar, IconHome, IconShoppingCart, IconMovie, IconMail, IconTag, IconFolder,
  IconCash, IconMoneybag, IconArrowsExchange, IconCreditCard, IconWorld, IconPigMoney, IconChartLine, IconGasStation, IconBolt, IconRoute, IconAlarm, IconTool, IconTools, IconWheel, IconShieldCheck,
  IconCircleCheck, IconParking, IconSparkles, IconBox, IconUrgent, IconDiamond, IconCurrencyBitcoin, IconOld, IconDeviceLaptop, IconToolsKitchen2, IconSofa, IconBallFootball, IconPlant2, IconDiamonds,
  IconPackage, IconDeviceMobile, IconBarbell, IconFile, IconFlag, IconDownload, IconUpload, IconPencil, IconClipboardList, IconDeviceFloppy, IconRefresh, IconRepeat, IconNotes, IconCoin, IconWallet,
  IconCalendar, IconUser, IconUsers, IconGift, IconPlane, IconPaw, IconSchool, IconBabyCarriage, IconPill, IconHeart, IconBus, IconTrain, IconBike, IconPhone, IconWifi, IconDroplet, IconFlame, IconBook,
  IconMusic, IconDeviceTv, IconGlass, IconCoffee, IconPizza, IconShirt, IconScissors, IconStar, IconLock, IconKey, IconTrophy, IconBulb, IconPlug, IconTruck, IconMapPin, IconChecklist, IconPercentage,
  IconScale, IconBuildingStore, IconHammer, IconFileInvoice, IconCertificate, IconTrendingUp, IconCashBanknote, IconBuilding, IconSearch, IconPhoto, IconCamera, IconPaperclip, IconBell } from "@tabler/icons-react";

const E = {
  "🧾": IconReceipt, "📑": IconFileText, "🛡": IconShield, "🏦": IconBuildingBank, "🏛": IconBuildingCommunity, "💼": IconBriefcase, "🩺": IconStethoscope, "🚗": IconCar, "🚙": IconCar, "🏠": IconHome, "🏡": IconHome,
  "🛒": IconShoppingCart, "🎬": IconMovie, "📮": IconMail, "✉": IconMail, "📧": IconMail, "🏷": IconTag, "📁": IconFolder, "📂": IconFolder, "🗂": IconFolder, "💶": IconCash, "💵": IconCash, "💴": IconCash, "💷": IconCash,
  "💰": IconMoneybag, "🔁": IconArrowsExchange, "🔄": IconRefresh, "💳": IconCreditCard, "🌐": IconWorld, "🐷": IconPigMoney, "📈": IconChartLine, "📊": IconChartLine, "📉": IconTrendingUp,
  "⛽": IconGasStation, "⚡": IconBolt, "🔌": IconPlug, "🛣": IconRoute, "⏰": IconAlarm, "⏱": IconAlarm, "🔧": IconTool, "🛠": IconTools, "🧰": IconTools, "🛞": IconWheel, "✅": IconCircleCheck, "☑": IconCircleCheck,
  "🅿": IconParking, "🧽": IconSparkles, "✨": IconSparkles, "🚨": IconUrgent, "💎": IconDiamond, "₿": IconCurrencyBitcoin, "🪙": IconCoin, "🧓": IconOld, "💻": IconDeviceLaptop, "🖥": IconDeviceLaptop,
  "🍳": IconToolsKitchen2, "🍽": IconToolsKitchen2, "🛋": IconSofa, "⚽": IconBallFootball, "🌿": IconPlant2, "🌱": IconPlant2, "💍": IconDiamonds, "📦": IconPackage, "📱": IconDeviceMobile, "🏋": IconBarbell,
  "📄": IconFile, "📃": IconFile, "🏁": IconFlag, "📥": IconDownload, "📤": IconUpload, "✏": IconPencil, "✍": IconPencil, "📝": IconNotes, "📋": IconClipboardList, "💾": IconDeviceFloppy, "🔂": IconRepeat,
  "👛": IconWallet, "👝": IconWallet, "📅": IconCalendar, "🗓": IconCalendar, "📆": IconCalendar, "👤": IconUser, "👥": IconUsers, "🎁": IconGift, "✈": IconPlane, "🐾": IconPaw, "🐶": IconPaw, "🐱": IconPaw,
  "🎓": IconSchool, "🏫": IconSchool, "👶": IconBabyCarriage, "💊": IconPill, "❤": IconHeart, "🚌": IconBus, "🚆": IconTrain, "🚇": IconTrain, "🚲": IconBike, "📞": IconPhone, "☎": IconPhone, "📶": IconWifi,
  "💧": IconDroplet, "🔥": IconFlame, "📚": IconBook, "📖": IconBook, "🎵": IconMusic, "🎧": IconMusic, "📺": IconDeviceTv, "🍷": IconGlass, "🍺": IconGlass, "☕": IconCoffee, "🍕": IconPizza, "👕": IconShirt,
  "✂": IconScissors, "⭐": IconStar, "🔒": IconLock, "🔑": IconKey, "🏆": IconTrophy, "💡": IconBulb, "🚚": IconTruck, "📍": IconMapPin, "🗒": IconChecklist, "％": IconPercentage, "⚖": IconScale,
  "🏪": IconBuildingStore, "🏬": IconBuildingStore, "🔨": IconHammer, "🧮": IconFileInvoice, "📜": IconCertificate, "🎫": IconTag, "🏢": IconBuilding, "🔎": IconSearch, "🔍": IconSearch, "🖼": IconPhoto,
  "📷": IconCamera, "📸": IconCamera, "📎": IconPaperclip, "🔔": IconBell, "💸": IconCashBanknote, "⇄": IconArrowsExchange, "↔": IconArrowsExchange, "⇆": IconArrowsExchange, "↹": IconArrowsExchange };
const norm = (e) => String(e).replace(/[️‍]/g, "").trim();
export const glyphFor = (e) => (typeof e === "string" ? E[norm(e)] || null : null);
// Glyph: Linien-Icon + Emoji – welches sichtbar ist, entscheidet die Klasse am <html> (ics-a/b/c/d)
export function Glyph({ e }) {
  if (e == null || e === "") return null;
  const I = glyphFor(e);
  if (!I) return <span className="gle solo">{e}</span>;
  return <span className="glw"><I className="gll" stroke={1.75} aria-hidden="true" /><span className="gle">{e}</span></span>;
}
