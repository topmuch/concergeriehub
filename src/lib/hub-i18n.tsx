'use client';

// =============================================================
// v4.33 « TRADUCTION INSTANTANÉE IA » — i18n du Hub Invité
// =============================================================
// Demande client : « L'application détecte la langue du smartphone du
// voyageur et traduit instantanément tout le guide de la maison, les
// menus des services et les messages de l'hôte dans sa langue natale ».
//
// Architecture à 2 étages (jamais de page cassée, zéro layout shift) :
//   1. DICTIONNAIRE STATIQUE — les libellés fixes du hub (titres de
//      cartes, sections, bandeaux, boutons) sont traduits en mémoire
//      de façon SYNCHRONE (clé = texte FR exact source).
//   2. TRADUCTION IA — tout texte non couvert (sous-titres interpolés,
//      textes personnalisés de l'hôte) est traduit en ASYNCHRONE par
//      /api/public/translate (LLM serveur), avec cache persistant
//      localStorage — 1 seul appel réseau par texte et par langue.
//
// Le FR reste la langue source : si une traduction manque, le texte
// FR est affiché tel quel (fallback universel).
// =============================================================

import { createContext, useContext, useMemo } from 'react';

export type HubLang = 'fr' | 'en' | 'es' | 'de' | 'zh';

export const HUB_LANGS: { code: HubLang; flag: string; label: string }[] = [
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
];

// v4.76 — les 4 mêmes langues cibles que l'API translate (l'arabe reste
// réservé aux vocaux TTS, pas d'interface traduite).
const LANG_CODES = new Set<HubLang>(['fr', 'en', 'es', 'de', 'zh']);

/** Détecte la langue du smartphone (au premier scan, avant tout choix). */
export function detectLang(): HubLang {
  try {
    for (const nav of [navigator.language, ...(navigator.languages ?? [])]) {
      const base = (nav ?? '').slice(0, 2).toLowerCase();
      if (LANG_CODES.has(base as HubLang)) return base as HubLang;
    }
  } catch {
    /* SSR / user-agent exotique — FR par défaut */
  }
  return 'fr';
}

/** Choix mémorisé par slug de hub (le voyageur peut changer de langue). */
const langKey = (slug: string) => `hub-lang-${slug}`;
export function getStoredLang(slug: string): HubLang | null {
  try {
    const v = localStorage.getItem(langKey(slug));
    return v && LANG_CODES.has(v as HubLang) ? (v as HubLang) : null;
  } catch {
    return null;
  }
}
export function storeLang(slug: string, lang: HubLang): void {
  try {
    localStorage.setItem(langKey(slug), lang);
  } catch {
    /* stockage indisponible (navigation privée) — détection re-faite à chaque scan */
  }
}

// ── 1) DICTIONNAIRE STATIQUE — clé = texte FR EXACT (U+2019 inclus) ──
const DICT: Record<string, Partial<Record<Exclude<HubLang, 'fr'>, string>>> = {
  // Squelette du hub
  '👤 Espace Invité': { en: '👤 Guest Hub', es: '👤 Espacio Invitado', de: '👤 Gäste-Bereich', zh: '👤 访客专区' },
  '✨ Expérience RoomScan': { en: '✨ RoomScan Experience', es: '✨ Experiencia RoomScan', de: '✨ RoomScan-Erlebnis', zh: '✨ RoomScan 体验' },
  '✨ Tout votre séjour au même endroit.': { en: '✨ Your whole stay in one place.', es: '✨ Toda tu estancia en un solo lugar.', de: '✨ Ihr ganzer Aufenthalt an einem Ort.', zh: '✨ 您的整个住宿，尽在一处。' },
  '🏠 Votre logement': { en: '🏠 Your place', es: '🏠 Tu alojamiento', de: '🏠 Ihre Unterkunft', zh: '🏠 您的住所' },
  '✨ Pendant votre séjour': { en: '✨ During your stay', es: '✨ Durante tu estancia', de: '✨ Während Ihres Aufenthalts', zh: '✨ 住宿期间' },
  '🆘 Besoin d’aide ?': { en: '🆘 Need help?', es: '🆘 ¿Necesitas ayuda?', de: '🆘 Hilfe benötigt?', zh: '🆘 需要帮助？' },
  '✨ Pour vous': { en: '✨ For you', es: '✨ Para ti', de: '✨ Für Sie', zh: '✨ 为您推荐' },
  'Retour à l’accueil': { en: 'Back to home', es: 'Volver al inicio', de: 'Zurück zur Startseite', zh: '返回首页' },
  'Propulsé par': { en: 'Powered by', es: 'Impulsado por', de: 'Bereitgestellt von', zh: '技术支持' },

  // Cartes — titres & eyebrows
  'Accès & Codes': { en: 'Access & Codes', es: 'Acceso y Códigos', de: 'Zugang & Codes', zh: '门禁与密码' },
  'Trousseau numérique': { en: 'Digital keyring', es: 'Llavero digital', de: 'Digitaler Schlüsselbund', zh: '数字钥匙包' },
  'Guidebook': { en: 'House manual', es: 'Guía de la casa', de: 'Hausbuch', zh: '房屋指南' },
  'Guide de la maison': { en: 'House guide', es: 'Guía de la casa', de: 'Hausführer', zh: '房屋手册' },
  'Accès, équipements, règles & bonnes adresses': { en: 'Access, amenities, rules & local tips', es: 'Acceso, equipamiento, normas y consejos', de: 'Zugang, Ausstattung, Regeln & Tipps', zh: '门禁、设施、守则与好去处' },
  'Votre hôte prépare son guide': { en: 'Your host is preparing the guide', es: 'Tu anfitrión está preparando la guía', de: 'Ihr Gastgeber bereitet das Handbuch vor', zh: '房东正在准备指南' },
  'Arrivée pas à pas': { en: 'Step-by-step arrival', es: 'Llegada paso a paso', de: 'Ankunft Schritt für Schritt', zh: '一步步入住指引' },
  'Arrivée': { en: 'Arrival', es: 'Llegada', de: 'Ankunft', zh: '入住' },
  'Vidéo de bienvenue': { en: 'Welcome video', es: 'Vídeo de bienvenida', de: 'Willkommensvideo', zh: '欢迎视频' },
  'Message de votre hôte': { en: 'A note from your host', es: 'Mensaje de tu anfitrión', de: 'Nachricht Ihres Gastgebers', zh: '房东留言' },
  'Votre hôte vous explique tout en vidéo': { en: 'Your host explains everything on video', es: 'Tu anfitrión te lo explica en vídeo', de: 'Ihr Gastgeber erklärt alles im Video', zh: '房东为您视频讲解' },
  'Guide des appareils': { en: 'Appliance guide', es: 'Guía de aparatos', de: 'Geräteanleitung', zh: '家电使用指南' },
  'Équipements': { en: 'Amenities', es: 'Equipamiento', de: 'Ausstattung', zh: '设施设备' },
  'Kit de survie': { en: 'Survival kit', es: 'Kit de emergencia', de: 'Überlebens-Set', zh: '应急小帮手' },
  'Rangement malin': { en: 'Smart storage', es: 'Almacenamiento útil', de: 'Kluge Aufbewahrung', zh: '贴心收纳' },
  'Départ tardif': { en: 'Late check-out', es: 'Salida tardía', de: 'Später Check-out', zh: '延迟退房' },
  'Extension de séjour': { en: 'Stay extension', es: 'Prórroga de estancia', de: 'Aufenthaltsverlängerung', zh: '延长住宿' },
  'Bonnes adresses': { en: 'Local gems', es: 'Buenas direcciones', de: 'Geheimtipps', zh: '当地好去处' },
  'Carte secrète': { en: 'Secret map', es: 'Mapa secreto', de: 'Geheime Karte', zh: '房东的秘密地图' },
  'Bouclier d’avis': { en: 'Review shield', es: 'Escudo de reseñas', de: 'Bewertungsschutz', zh: '评价保护盾' },
  'SOS & Urgences': { en: 'SOS & Emergency', es: 'SOS y Urgencias', de: 'SOS & Notfall', zh: 'SOS 与紧急求助' },
  'Urgences 24/7': { en: 'Emergency 24/7', es: 'Urgencias 24/7', de: 'Notfall 24/7', zh: '24/7 紧急服务' },
  'Numéros, hôpital, pharmacie de garde': { en: 'Numbers, hospital, night pharmacy', es: 'Teléfonos, hospital, farmacia de guardia', de: 'Nummern, Krankenhaus, Apotheke', zh: '电话、医院、夜间药店' },
  'Numéros d’urgence, hôpital, pharmacie de garde': { en: 'Emergency numbers, hospital, night pharmacy', es: 'Teléfonos de urgencia, hospital, farmacia de guardia', de: 'Notnummern, Krankenhaus, Apotheke', zh: '紧急电话、医院、夜间药店' },
  'Signaler un problème': { en: 'Report an issue', es: 'Informar de un problema', de: 'Problem melden', zh: '报告问题' },
  'Support réactif': { en: 'Responsive support', es: 'Soporte ágil', de: 'Schneller Support', zh: '快速响应' },
  'Fuite, électricité, ménage… avec photos': { en: 'Leak, power, cleaning… with photos', es: 'Fuga, luz, limpieza… con fotos', de: 'Leck, Strom, Reinigung… mit Fotos', zh: '漏水、断电、清洁…可附照片' },
  'Contacter l’hôte': { en: 'Contact your host', es: 'Contacta a tu anfitrión', de: 'Gastgeber kontaktieren', zh: '联系房东' },
  'Votre hôte': { en: 'Your host', es: 'Tu anfitrión', de: 'Ihr Gastgeber', zh: '您的房东' },
  'Wi-Fi': { en: 'Wi-Fi', es: 'Wi-Fi', de: 'WLAN', zh: 'Wi-Fi' },
  'Connexion': { en: 'Connection', es: 'Conexión', de: 'Verbindung', zh: '网络连接' },
  'Informations en cours de préparation': { en: 'Details coming soon', es: 'Información en preparación', de: 'Angaben folgen in Kürze', zh: '信息准备中' },

  // v4.33 — SOS Logement (carte dédiée)
  'SOS Logement': { en: 'SOS Home', es: 'SOS Vivienda', de: 'SOS Wohnung', zh: 'SOS 住房急修' },
  'Urgence en 1 clic': { en: '1-tap emergency', es: 'Emergencia en 1 toque', de: 'Notfall mit 1 Klick', zh: '一键紧急求助' },
  'Fuite, panne, clé bloquée — alerte immédiate': { en: 'Leak, breakdown, stuck key — instant alert', es: 'Fuga, avería, llave atascada — alerta inmediata', de: 'Leck, Defekt, Schlüssel klemmt — sofortiger Alarm', zh: '漏水、故障、钥匙卡住 — 立即告警' },

  // v4.33 — Shop the Stay
  'Shop the Stay': { en: 'Shop the Stay', es: 'Shop the Stay', de: 'Shop the Stay', zh: '民宿好物商店' },
  'Boutique de la maison': { en: 'The home shop', es: 'La tienda de la casa', de: 'Der Home-Shop', zh: '小屋精品店' },
  'Les produits de la maison, livrés chez vous': { en: 'The home’s products, delivered to you', es: 'Los productos de la casa, a tu puerta', de: 'Die Produkte der Wohnung — zu Ihnen geliefert', zh: '屋内好物，直邮到家' },

  // Bandeau « Pour vous » — raisons
  'Vous arrivez aujourd’hui': { en: 'You arrive today', es: 'Llegas hoy', de: 'Sie kommen heute an', zh: '您今天入住' },
  'Portail, serrure, boîte à clés': { en: 'Gate, lock, key box', es: 'Portón, cerradura, caja de llaves', de: 'Tor, Schloss, Schlüsselbox', zh: '大门、门锁、钥匙盒' },
  'Bienvenue chez vous !': { en: 'Welcome home!', es: '¡Bienvenido a casa!', de: 'Willkommen zu Hause!', zh: '欢迎回家！' },
  'Votre départ approche': { en: 'Your departure is approaching', es: 'Tu salida se acerca', de: 'Ihre Abreise rückt näher', zh: '退房时间临近' },
  'Un mot sur votre séjour ?': { en: 'A word about your stay?', es: '¿Un comentario sobre tu estancia?', de: 'Ein Wort zu Ihrem Aufenthalt?', zh: '说说您的住宿体验？' },
  'Installez-vous confortablement': { en: 'Get settled in comfortably', es: 'Instálate con comodidad', de: 'Richten Sie sich bequem ein', zh: '先安顿下来吧' },
  'Une question ce soir ?': { en: 'A question tonight?', es: '¿Una duda esta noche?', de: 'Eine Frage am Abend?', zh: '今晚有问题吗？' },
  'La carte secrète de votre hôte': { en: 'Your host’s secret map', es: 'El mapa secreto de tu anfitrión', de: 'Die geheime Karte Ihres Gastgebers', zh: '房东的秘密地图' },
  'Maîtrisez toute la maison': { en: 'Master the whole place', es: 'Domina toda la casa', de: 'Beherrschen Sie die ganze Wohnung', zh: '玩转整间小屋' },

  // Contact — onglets & canaux
  'Contact': { en: 'Contact', es: 'Contacto', de: 'Kontakt', zh: '联系' },
  'Messages': { en: 'Messages', es: 'Mensajes', de: 'Nachrichten', zh: '消息' },
  'Vos messages': { en: 'Your messages', es: 'Tus mensajes', de: 'Ihre Nachrichten', zh: '您的消息' },
  'Réponses de votre hôte': { en: 'Host replies', es: 'Respuestas de tu anfitrión', de: 'Antworten Ihres Gastgebers', zh: '房东的回复' },
  'En attente': { en: 'Pending', es: 'Pendiente', de: 'Ausstehend', zh: '待处理' },
  'Lu par l’hôte': { en: 'Read by host', es: 'Leído por el anfitrión', de: 'Vom Gastgeber gelesen', zh: '房东已读' },
  'Appel': { en: 'Call', es: 'Llamar', de: 'Anruf', zh: '电话' },
  'Email': { en: 'Email', es: 'Correo', de: 'E-Mail', zh: '邮件' },
  'Vocal': { en: 'Voice', es: 'Voz', de: 'Sprache', zh: '语音' },

  // ── v4.33 SOS Logement — dialog & pill ──
  'Fuite d’eau': { en: 'Water leak', es: 'Fuga de agua', de: 'Wasserleck', zh: '漏水' },
  'Panne de chauffage': { en: 'Heating breakdown', es: 'Avería de calefacción', de: 'Heizungsausfall', zh: '暖气故障' },
  'Clé bloquée ou perdue': { en: 'Stuck or lost key', es: 'Llave atascada o perdida', de: 'Schlüssel klemmt oder verloren', zh: '钥匙卡住或丢失' },
  'Panne d’électricité': { en: 'Power outage', es: 'Corte de luz', de: 'Stromausfall', zh: '停电' },
  'Autre urgence': { en: 'Other emergency', es: 'Otra urgencia', de: 'Anderer Notfall', zh: '其他紧急情况' },
  'Quel est le problème ?': { en: 'What is the problem?', es: '¿Cuál es el problema?', de: 'Was ist das Problem?', zh: '请问是什么问题？' },
  'Précisez si besoin (optionnel)': { en: 'Add details if needed (optional)', es: 'Añade detalles si quieres (opcional)', de: 'Bei Bedarf Details (optional)', zh: '补充说明（可选）' },
  '🚨 Alerte immédiate': { en: '🚨 Instant alert', es: '🚨 Alerta inmediata', de: '🚨 Sofort-Alarm', zh: '🚨 立即告警' },
  'Alerte immédiate': { en: 'Instant alert', es: 'Alerta inmediata', de: 'Sofort-Alarm', zh: '立即告警' },
  'Hôte alerté à': { en: 'Host alerted at', es: 'Anfitrión avisado a las', de: 'Gastgeber informiert um', zh: '已通知房东，时间' },
  'restez sur place si possible.': { en: 'please stay on site if you can.', es: 'quédate en el lugar si es posible.', de: 'bitte bleiben Sie möglichst vor Ort.', zh: '如可能请留在原地。' },
  'Re-signaler': { en: 'Alert again', es: 'Volver a avisar', de: 'Erneut melden', zh: '再次报告' },
  'L’hôte reçoit l’heure et l’adresse de l’appartement': { en: 'Your host gets the time and the apartment address', es: 'Tu anfitrión recibe la hora y la dirección', de: 'Ihr Gastgeber erhält Uhrzeit und Adresse', zh: '房东将收到时间和公寓地址' },
  'En urgence vitale, appelez d’abord les secours (112).': { en: 'For a life-threatening emergency, call 112 first.', es: 'En urgencia vital, llama primero al 112.', de: 'Im lebensbedrohlichen Notfall zuerst 112 anrufen.', zh: '危急情况请先拨打紧急电话 112。' },

  // ── v4.33 Shop the Stay ──
  'reversés à votre hôte': { en: 'goes to your host', es: 'para tu anfitrión', de: 'für Ihren Gastgeber', zh: '归房东所有' },
  'Livrés chez vous': { en: 'Delivered to you', es: 'A tu puerta', de: 'Zu Ihnen geliefert', zh: '直邮到家' },
  'Achetez ce que vous avez aimé pendant votre séjour': { en: 'Buy what you loved during your stay', es: 'Compra lo que te gustó durante tu estancia', de: 'Kaufen Sie, was Ihnen gefallen hat', zh: '把您喜欢的带回家' },
  'du montant sont reversés à votre hôte — partenariat boutique.': { en: 'of the amount goes to your host — shop partnership.', es: 'del importe es para tu anfitrión — alianza con la tienda.', de: 'des Betrags gehen an Ihren Gastgeber — Shop-Partnerschaft.', zh: '的金额归房东所有——商店合作分成。' },
  'Commander': { en: 'Order', es: 'Pedir', de: 'Bestellen', zh: '订购' },
  'Demande envoyée': { en: 'Request sent', es: 'Solicitud enviada', de: 'Anfrage gesendet', zh: '请求已发送' },
  'Voir en ligne': { en: 'See online', es: 'Ver online', de: 'Online ansehen', zh: '在线查看' },
  'Votre hôte reçoit la demande et vous recontacte pour organiser la livraison.': { en: 'Your host gets the request and contacts you to arrange delivery.', es: 'Tu anfitrión recibe la solicitud y te contacta para la entrega.', de: 'Ihr Gastgeber erhält die Anfrage und meldet sich für die Lieferung.', zh: '房东收到请求后会与您联系安排寄送。' },

  // ── v4.33 Compte à rebours check-out ──
  'Jour du départ': { en: 'Departure day', es: 'Día de salida', de: 'Abreisetag', zh: '退房日' },
  'Votre départ est prévu à 11 h': { en: 'Your check-out is scheduled for 11 am', es: 'Tu salida está prevista a las 11 h', de: 'Ihr Check-out ist für 11 Uhr geplant', zh: '您的退房时间为上午 11 点' },
  'L’heure limite de départ est passée': { en: 'The check-out time has passed', es: 'La hora de salida ha pasado', de: 'Die Check-out-Zeit ist vorbei', zh: '退房时间已过' },
  'Merci d’avoir rendu les clés 💙': { en: 'Thank you for handing back the keys 💙', es: 'Gracias por devolver las llaves 💙', de: 'Danke für die Rückgabe der Schlüssel 💙', zh: '感谢您归还钥匙 💙' },
  'Il vous reste': { en: 'You have', es: 'Te quedan', de: 'Ihnen bleiben', zh: '您还有' },
  'Besoin de plus de temps ? Prolongez jusqu’à 14 h': { en: 'Need more time? Extend until 2 pm', es: '¿Necesitas más tiempo? Prolonga hasta las 14 h', de: 'Mehr Zeit nötig? Bis 14 Uhr verlängern', zh: '需要更多时间？延长至 14 点' },
  'Demande envoyée — votre hôte vous confirme.': { en: 'Request sent — your host will confirm.', es: 'Solicitud enviada — tu anfitrión te confirma.', de: 'Anfrage gesendet — Ihr Gastgeber bestätigt.', zh: '请求已发送——房东将与您确认。' },
  '⏰ Départ imminent': { en: '⏰ Check-out soon', es: '⏰ Salida inminente', de: '⏰ Abreise steht bevor', zh: '⏰ 即将退房' },
  '⭐ Ce soir 20 h': { en: '⭐ Tonight from 8 pm', es: '⭐ Esta noche 20 h', de: '⭐ Heute Abend 20 Uhr', zh: '⭐ 今晚 20 点' },

  // ── v4.76 — SMART PROMPTS (titres & actions) ──
  'Petit-déjeuner': { en: 'Breakfast', es: 'Desayuno', de: 'Frühstück', zh: '早餐' },
  'Déjeuner': { en: 'Lunch', es: 'Almuerzo', de: 'Mittagessen', zh: '午餐' },
  'Dîner': { en: 'Dinner', es: 'Cena', de: 'Abendessen', zh: '晚餐' },
  'Souvenirs': { en: 'Souvenirs', es: 'Recuerdos', de: 'Souvenirs', zh: '纪念品' },
  'Souvenirs & cadeaux': { en: 'Souvenirs & gifts', es: 'Recuerdos y regalos', de: 'Souvenirs & Geschenke', zh: '纪念品与礼物' },
  'Voir la boutique': { en: 'Open the shop', es: 'Ver la tienda', de: 'Shop ansehen', zh: '查看商店' },
  'Voir les options': { en: 'See options', es: 'Ver opciones', de: 'Optionen ansehen', zh: '查看选项' },
  'Fermer la notification': { en: 'Dismiss notification', es: 'Cerrar la notificación', de: 'Benachrichtigung schließen', zh: '关闭通知' },

  // ── v4.76 — GUIDEBOOK (universel) ──
  'Guide universel — fourni avec votre séjour': { en: 'Universal guide — included with your stay', es: 'Guía universal — incluida con tu estancia', de: 'Universelles Handbuch — in Ihrem Aufenthalt enthalten', zh: '通用指南——住宿随附' },
  'Guide universel de la maison': { en: 'Universal house guide', es: 'Guía universal de la casa', de: 'Universelles Hausbuch', zh: '房屋通用指南' },
  'Votre hôte peut personnaliser ce guide depuis son espace.': { en: 'Your host can customise this guide from their space.', es: 'Tu anfitrión puede personalizar esta guía desde su espacio.', de: 'Ihr Gastgeber kann dieses Handbuch in seinem Bereich anpassen.', zh: '房东可以在自己的空间中自定义此指南。' },
  "Écouter l'explication de l'hôte": { en: "Listen to your host's explanation", es: 'Escucha la explicación de tu anfitrión', de: 'Erklärung Ihres Gastgebers anhören', zh: '收听房东的讲解' },
  '🗝️ Arrivée': { en: '🗝️ Arrival', es: '🗝️ Llegada', de: '🗝️ Ankunft', zh: '🗝️ 入住' },
  '🛏️ Équipements': { en: '🛏️ Amenities', es: '🛏️ Equipamiento', de: '🛏️ Ausstattung', zh: '🛏️ 设施' },
  '📋 Règles': { en: '📋 Rules', es: '📋 Normas', de: '📋 Regeln', zh: '📋 守则' },
  '🌐 Traduction en cours…': { en: '🌐 Translating…', es: '🌐 Traduciendo…', de: '🌐 Übersetzung läuft…', zh: '🌐 翻译中…' },
};

/** Traduction statique (0 ms, 0 requête). Retourne le FR si absente. */
export function translateText(fr: string, lang: HubLang): string {
  if (lang === 'fr') return fr;
  return DICT[fr]?.[lang] ?? fr;
}

// ── 2) CACHE IA persistant (localStorage) ─────────────────────
const CACHE_KEY = 'hub-i18n-ai-v1';
const CACHE_MAX = 600;

type AiCache = Record<string, string>; // key = `${lang} ${frText}`

function cacheRead(): AiCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as AiCache;
  } catch {
    return {};
  }
}

function cacheWrite(cache: AiCache): void {
  try {
    // FIFO simple : on garde les dernières entrées.
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota plein — le cache mémoire de session suffit */
  }
}

const sessionCache = new Map<string, string>();

/** Traduit un lot de textes FR via /api/public/translate (LLM serveur).
 *  Retourne { frText → traduction } ; ne jette jamais (fallback FR). */
export async function translateBatchAi(
  texts: string[],
  lang: HubLang,
): Promise<Record<string, string>> {
  const langSafe = LANG_CODES.has(lang) ? lang : 'fr';
  if (langSafe === 'fr' || texts.length === 0) return {};
  const out: Record<string, string> = {};
  const cache = cacheRead();
  const missing: string[] = [];
  for (const t of texts) {
    const key = `${langSafe} ${t}`;
    const hit = sessionCache.get(key) ?? cache[key];
    if (hit) out[t] = hit;
    else missing.push(t);
  }
  if (missing.length === 0) return out;
  try {
    // v4.76 — l'API valide 1..12 textes / requête : les manquants partent
    // PAR LOTS DE 12 (avant : tout en une requête → 400 zod dès 13 textes,
    // et TOUT le lot échouait d'un bloc).
    for (let i = 0; i < missing.length; i += 12) {
      const batch = missing.slice(i, i + 12);
      const res = await fetch('/api/public/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch, lang: langSafe }),
      });
      if (!res.ok) continue; // lot refusé → repli FR pour ce lot seulement
      const data = (await res.json().catch(() => null)) as { translations?: Record<string, string> | null } | null;
      const tr = data?.translations;
      if (tr && typeof tr === 'object') {
        for (const [fr, val] of Object.entries(tr)) {
          if (typeof val === 'string' && val.trim()) {
            out[fr] = val;
            sessionCache.set(`${langSafe} ${fr}`, val);
            cache[`${langSafe} ${fr}`] = val;
          }
        }
      }
    }
    cacheWrite(cache);
  } catch {
    /* réseau indisponible — le FR reste affiché */
  }
  return out;
}

// ── 2 bis) v4.76 — TEXTES LONGS (corps du guidebook) ─────────
// /api/public/translate valide 1..12 textes de 1..500 chars : un corps
// de section plus long est DÉCOUPÉ en morceaux ≤ 480 chars (aux fins de
// phrase / retours à la ligne quand possible), traduit par lots de 12,
// puis réassemblé. Chaque morceau est caché (localStorage + mémoire)
// comme les autres textes — coût réseau une seule fois par langue.

const AI_CHUNK_MAX = 480;

function splitLong(text: string, max = AI_CHUNK_MAX): string[] {
  const clean = text.trim();
  if (clean.length <= max) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    // Meilleure coupe < max : saut de ligne → fin de phrase → espace.
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.4) cut = rest.lastIndexOf('. ', max) + 1; // garde le point
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.4 || cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.trim()) chunks.push(rest.trim());
  return chunks.filter(Boolean);
}

/**
 * Traduit des textes FR de TOUTE LONGUEUR (guidebook, messages hôte).
 * Les textes ≤ 480 chars partent tels quels ; les plus longs sont
 * découpés (splitLong), traduits par lots ≤ 12, puis réassemblés.
 * Chaque morceau est caché (localStorage + mémoire) — coût réseau une
 * seule fois par langue. Ne jette jamais — repli FR garanti.
 */
export async function translateAiSmart(
  texts: string[],
  lang: HubLang,
): Promise<Record<string, string>> {
  const langSafe = LANG_CODES.has(lang) ? lang : 'fr';
  if (langSafe === 'fr' || texts.length === 0) return {};
  // 1) Sépare : courts (envoyés tels quels) vs longs (découpés d'abord —
  //    un texte > 500 chars ferait refuser son lot entier par l'API).
  const shorts: string[] = [];
  const chunks: string[] = [];
  for (const t of texts) {
    if (t.trim().length <= AI_CHUNK_MAX) shorts.push(t);
    else chunks.push(...splitLong(t));
  }
  // 2) Traduction (translateBatchAi gère le cache + les lots de 12).
  const out = await translateBatchAi(shorts, langSafe);
  const chunkTr = await translateBatchAi(chunks, langSafe);
  // 3) Réassemblage des longs (repli : le morceau FR reste affiché).
  for (const t of texts) {
    if (out[t]) continue;
    out[t] = splitLong(t)
      .map((p) => chunkTr[p] ?? p)
      .join(' ');
  }
  return out;
}

// ── 3) React Context + hook ──────────────────────────────────
export const HubLangContext = createContext<HubLang>('fr');

export function useHubLang(): { lang: HubLang; t: (fr: string) => string } {
  const lang = useContext(HubLangContext);
  return useMemo(() => ({ lang, t: (fr: string) => translateText(fr, lang) }), [lang]);
}
