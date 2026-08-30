'use client';

import { useMemo } from 'react';

// ============================================================
// TRANSLATIONS — 8 languages for public scan pages
// ============================================================

type TranslationKey =
  // Common
  | 'back' | 'close' | 'copy' | 'copied' | 'retry' | 'loading' | 'error' | 'powered_by'
  // WiFi
  | 'guest_wifi' | 'network' | 'security' | 'password' | 'connect_wifi' | 'copy_password'
  | 'hidden_network' | 'connected_count' | 'connect_one_tap' | 'copy_info' | 'open_network'
  // Doorbell
  | 'present' | 'absent' | 'ring' | 'leave_message' | 'send_message' | 'instructions'
  | 'ring_sent' | 'message_sent' | 'notified' | 'notify_me' | 'close_instructions'
  | 'write_your_message' | 'your_message_will_be_sent'
  // Contact
  | 'contact_info' | 'phone' | 'email' | 'name' | 'address' | 'no_contact_info'
  // Guestbook
  | 'guestbook' | 'write_message' | 'messages' | 'submit' | 'your_name' | 'your_message'
  | 'enter_your_name' | 'write_a_message' | 'message_added'
  | 'send_error'
  // Note
  | 'note' | 'shopping_list' | 'checklist' | 'no_content_configured'
  // Platform
  | 'scan_to_access'
  ;

type TranslationMap = Record<TranslationKey, string>;

const TRANSLATIONS: Record<string, TranslationMap> = {
  fr: {
    // Common
    back: 'Retour',
    close: 'Fermer',
    copy: 'Copier',
    copied: 'Copié !',
    retry: 'Réessayer',
    loading: 'Chargement...',
    error: 'Erreur',
    powered_by: 'Propulsé par QR Domotik',
    scan_to_access: 'Scannez le QR pour accéder',
    // WiFi
    guest_wifi: 'Wi-Fi Invités',
    network: 'Réseau',
    security: 'Sécurité',
    password: 'Mot de passe',
    connect_wifi: 'Se connecter au Wi-Fi',
    copy_password: 'Copier le mot de passe',
    hidden_network: 'Réseau masqué',
    connected_count: 'personnes ont scanné ce QR',
    connect_one_tap: 'Se connecter en 1 tap',
    copy_info: 'Copier les informations',
    open_network: 'Ouvert',
    // Doorbell
    present: 'Présent',
    absent: 'Absent',
    ring: 'Sonner',
    leave_message: 'Laisser un message',
    send_message: 'Envoyer le message',
    instructions: 'Consignes',
    ring_sent: 'Sonnette envoyée !',
    message_sent: 'Message envoyé !',
    notified: "L'habitant a été notifié de votre passage.",
    notify_me: 'Me notifier',
    close_instructions: 'Fermer les consignes',
    write_your_message: 'Laisser un message',
    your_message_will_be_sent: 'Votre message sera envoyé à l\'habitant',
    // Contact
    contact_info: 'Informations de contact',
    phone: 'Téléphone',
    email: 'E-mail',
    name: 'Contact',
    address: 'Adresse',
    no_contact_info: 'Aucune information de contact disponible.',
    // Guestbook
    guestbook: "Livre d'or",
    write_message: 'Laisser un message',
    messages: 'messages',
    submit: 'Envoyer',
    your_name: 'Votre nom',
    your_message: 'Votre message...',
    enter_your_name: 'Veuillez entrer votre nom',
    write_a_message: "Veuillez écrire un message",
    message_added: 'Message ajouté !',
    send_error: "Erreur lors de l'envoi, veuillez réessayer",
    // Note
    note: 'Note',
    shopping_list: 'Liste de courses',
    checklist: 'Liste de vérification',
    no_content_configured: 'Aucun contenu configuré',
  },
  en: {
    back: 'Back',
    close: 'Close',
    copy: 'Copy',
    copied: 'Copied!',
    retry: 'Retry',
    loading: 'Loading...',
    error: 'Error',
    powered_by: 'Powered by QR Domotik',
    scan_to_access: 'Scan the QR to access',
    // WiFi
    guest_wifi: 'Guest Wi-Fi',
    network: 'Network',
    security: 'Security',
    password: 'Password',
    connect_wifi: 'Connect to Wi-Fi',
    copy_password: 'Copy password',
    hidden_network: 'Hidden network',
    connected_count: 'people have scanned this QR',
    connect_one_tap: 'Connect in 1 tap',
    copy_info: 'Copy information',
    open_network: 'Open',
    // Doorbell
    present: 'Present',
    absent: 'Absent',
    ring: 'Ring',
    leave_message: 'Leave a message',
    send_message: 'Send message',
    instructions: 'Instructions',
    ring_sent: 'Doorbell sent!',
    message_sent: 'Message sent!',
    notified: 'The resident has been notified of your visit.',
    notify_me: 'Notify me',
    close_instructions: 'Close instructions',
    write_your_message: 'Leave a message',
    your_message_will_be_sent: 'Your message will be sent to the resident',
    // Contact
    contact_info: 'Contact information',
    phone: 'Phone',
    email: 'Email',
    name: 'Contact',
    address: 'Address',
    no_contact_info: 'No contact information available.',
    // Guestbook
    guestbook: 'Guestbook',
    write_message: 'Leave a message',
    messages: 'messages',
    submit: 'Submit',
    your_name: 'Your name',
    your_message: 'Your message...',
    enter_your_name: 'Please enter your name',
    write_a_message: 'Please write a message',
    message_added: 'Message added!',
    send_error: 'Error sending, please try again',
    // Note
    note: 'Note',
    shopping_list: 'Shopping list',
    checklist: 'Checklist',
    no_content_configured: 'No content configured',
  },
  es: {
    back: 'Volver',
    close: 'Cerrar',
    copy: 'Copiar',
    copied: '¡Copiado!',
    retry: 'Reintentar',
    loading: 'Cargando...',
    error: 'Error',
    powered_by: 'Desarrollado por QR Domotik',
    scan_to_access: 'Escanea el QR para acceder',
    // WiFi
    guest_wifi: 'Wi-Fi Invitados',
    network: 'Red',
    security: 'Seguridad',
    password: 'Contraseña',
    connect_wifi: 'Conectar al Wi-Fi',
    copy_password: 'Copiar contraseña',
    hidden_network: 'Red oculta',
    connected_count: 'personas han escaneado este QR',
    connect_one_tap: 'Conectar en 1 toque',
    copy_info: 'Copiar información',
    open_network: 'Abierta',
    // Doorbell
    present: 'Presente',
    absent: 'Ausente',
    ring: 'Timbrar',
    leave_message: 'Dejar un mensaje',
    send_message: 'Enviar mensaje',
    instructions: 'Instrucciones',
    ring_sent: '¡Timbre enviado!',
    message_sent: '¡Mensaje enviado!',
    notified: 'El residente ha sido notificado de su visita.',
    notify_me: 'Notificarme',
    close_instructions: 'Cerrar instrucciones',
    write_your_message: 'Dejar un mensaje',
    your_message_will_be_sent: 'Su mensaje será enviado al residente',
    // Contact
    contact_info: 'Información de contacto',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    name: 'Contacto',
    address: 'Dirección',
    no_contact_info: 'No hay información de contacto disponible.',
    // Guestbook
    guestbook: 'Libro de visitas',
    write_message: 'Dejar un mensaje',
    messages: 'mensajes',
    submit: 'Enviar',
    your_name: 'Tu nombre',
    your_message: 'Tu mensaje...',
    enter_your_name: 'Por favor, ingresa tu nombre',
    write_a_message: 'Por favor, escribe un mensaje',
    message_added: '¡Mensaje añadido!',
    send_error: 'Error al enviar, por favor reinténtalo',
    // Note
    note: 'Nota',
    shopping_list: 'Lista de compras',
    checklist: 'Lista de verificación',
    no_content_configured: 'Sin contenido configurado',
  },
  de: {
    back: 'Zurück',
    close: 'Schließen',
    copy: 'Kopieren',
    copied: 'Kopiert!',
    retry: 'Erneut versuchen',
    loading: 'Laden...',
    error: 'Fehler',
    powered_by: 'Angetrieben von QR Domotik',
    scan_to_access: 'QR scannen für Zugriff',
    // WiFi
    guest_wifi: 'Gäste-WLAN',
    network: 'Netzwerk',
    security: 'Sicherheit',
    password: 'Passwort',
    connect_wifi: 'Mit WLAN verbinden',
    copy_password: 'Passwort kopieren',
    hidden_network: 'Verstecktes Netzwerk',
    connected_count: 'Personen haben diesen QR gescannt',
    connect_one_tap: 'Mit 1 Tippen verbinden',
    copy_info: 'Informationen kopieren',
    open_network: 'Offen',
    // Doorbell
    present: 'Anwesend',
    absent: 'Abwesend',
    ring: 'Klingeln',
    leave_message: 'Nachricht hinterlassen',
    send_message: 'Nachricht senden',
    instructions: 'Anweisungen',
    ring_sent: 'Klingel gesendet!',
    message_sent: 'Nachricht gesendet!',
    notified: 'Der Bewohner wurde über Ihren Besuch benachrichtigt.',
    notify_me: 'Mich benachrichtigen',
    close_instructions: 'Anweisungen schließen',
    write_your_message: 'Nachricht hinterlassen',
    your_message_will_be_sent: 'Ihre Nachricht wird an den Bewohner gesendet',
    // Contact
    contact_info: 'Kontaktinformationen',
    phone: 'Telefon',
    email: 'E-Mail',
    name: 'Kontakt',
    address: 'Adresse',
    no_contact_info: 'Keine Kontaktinformationen verfügbar.',
    // Guestbook
    guestbook: 'Gästebuch',
    write_message: 'Nachricht hinterlassen',
    messages: 'Nachrichten',
    submit: 'Absenden',
    your_name: 'Ihr Name',
    your_message: 'Ihre Nachricht...',
    enter_your_name: 'Bitte geben Sie Ihren Namen ein',
    write_a_message: 'Bitte schreiben Sie eine Nachricht',
    message_added: 'Nachricht hinzugefügt!',
    send_error: 'Fehler beim Senden, bitte versuchen Sie es erneut',
    // Note
    note: 'Notiz',
    shopping_list: 'Einkaufsliste',
    checklist: 'Checkliste',
    no_content_configured: 'Kein Inhalt konfiguriert',
  },
  nl: {
    back: 'Terug',
    close: 'Sluiten',
    copy: 'Kopiëren',
    copied: 'Gekopieerd!',
    retry: 'Opnieuw proberen',
    loading: 'Laden...',
    error: 'Fout',
    powered_by: 'Aangedreven door QR Domotik',
    scan_to_access: 'Scan de QR voor toegang',
    // WiFi
    guest_wifi: 'Gasten-WiFi',
    network: 'Netwerk',
    security: 'Beveiliging',
    password: 'Wachtwoord',
    connect_wifi: 'Verbinden met WiFi',
    copy_password: 'Wachtwoord kopiëren',
    hidden_network: 'Verborgen netwerk',
    connected_count: 'personen hebben deze QR gescand',
    connect_one_tap: 'Verbinden met 1 tik',
    copy_info: 'Informatie kopiëren',
    open_network: 'Open',
    // Doorbell
    present: 'Aanwezig',
    absent: 'Afwezig',
    ring: 'Bellen',
    leave_message: 'Bericht achterlaten',
    send_message: 'Bericht verzenden',
    instructions: 'Instructies',
    ring_sent: 'Bel gestuurd!',
    message_sent: 'Bericht verzonden!',
    notified: 'De bewoner is op de hoogte gesteld van uw bezoek.',
    notify_me: 'Stel me op de hoogte',
    close_instructions: 'Instructies sluiten',
    write_your_message: 'Bericht achterlaten',
    your_message_will_be_sent: 'Uw bericht wordt naar de bewoner gestuurd',
    // Contact
    contact_info: 'Contactgegevens',
    phone: 'Telefoon',
    email: 'E-mail',
    name: 'Contact',
    address: 'Adres',
    no_contact_info: 'Geen contactgegevens beschikbaar.',
    // Guestbook
    guestbook: 'Gastenboek',
    write_message: 'Bericht achterlaten',
    messages: 'berichten',
    submit: 'Verzenden',
    your_name: 'Uw naam',
    your_message: 'Uw bericht...',
    enter_your_name: 'Vul uw naam in',
    write_a_message: 'Schrijf een bericht',
    message_added: 'Bericht toegevoegd!',
    send_error: 'Fout bij verzenden, probeer opnieuw',
    // Note
    note: 'Notitie',
    shopping_list: 'Boodschappenlijst',
    checklist: 'Checklist',
    no_content_configured: 'Geen inhoud geconfigureerd',
  },
  it: {
    back: 'Indietro',
    close: 'Chiudi',
    copy: 'Copia',
    copied: 'Copiato!',
    retry: 'Riprova',
    loading: 'Caricamento...',
    error: 'Errore',
    powered_by: 'Alimentato da QR Domotik',
    scan_to_access: 'Scansiona il QR per accedere',
    // WiFi
    guest_wifi: 'Wi-Fi Ospiti',
    network: 'Rete',
    security: 'Sicurezza',
    password: 'Password',
    connect_wifi: 'Connetti al Wi-Fi',
    copy_password: 'Copia password',
    hidden_network: 'Rete nascosta',
    connected_count: 'persone hanno scansionato questo QR',
    connect_one_tap: 'Connetti con 1 tocco',
    copy_info: 'Copia informazioni',
    open_network: 'Aperta',
    // Doorbell
    present: 'Presente',
    absent: 'Assente',
    ring: 'Suona',
    leave_message: 'Lascia un messaggio',
    send_message: 'Invia messaggio',
    instructions: 'Istruzioni',
    ring_sent: 'Campanello inviato!',
    message_sent: 'Messaggio inviato!',
    notified: "L'abitante è stato notificato della tua visita.",
    notify_me: 'Notificami',
    close_instructions: 'Chiudi istruzioni',
    write_your_message: 'Lascia un messaggio',
    your_message_will_be_sent: "Il tuo messaggio sarà inviato all'abitante",
    // Contact
    contact_info: 'Informazioni di contatto',
    phone: 'Telefono',
    email: 'E-mail',
    name: 'Contatto',
    address: 'Indirizzo',
    no_contact_info: 'Nessuna informazione di contatto disponibile.',
    // Guestbook
    guestbook: 'Libro degli ospiti',
    write_message: 'Lascia un messaggio',
    messages: 'messaggi',
    submit: 'Invia',
    your_name: 'Il tuo nome',
    your_message: 'Il tuo messaggio...',
    enter_your_name: 'Inserisci il tuo nome',
    write_a_message: 'Scrivi un messaggio',
    message_added: 'Messaggio aggiunto!',
    send_error: "Errore nell'invio, riprova",
    // Note
    note: 'Nota',
    shopping_list: 'Lista della spesa',
    checklist: 'Lista di controllo',
    no_content_configured: 'Nessun contenuto configurato',
  },
  pt: {
    back: 'Voltar',
    close: 'Fechar',
    copy: 'Copiar',
    copied: 'Copiado!',
    retry: 'Tentar novamente',
    loading: 'Carregando...',
    error: 'Erro',
    powered_by: 'Desenvolvido por QR Domotik',
    scan_to_access: 'Escaneie o QR para acessar',
    // WiFi
    guest_wifi: 'Wi-Fi para Convidados',
    network: 'Rede',
    security: 'Segurança',
    password: 'Senha',
    connect_wifi: 'Conectar ao Wi-Fi',
    copy_password: 'Copiar senha',
    hidden_network: 'Rede oculta',
    connected_count: 'pessoas escanearam este QR',
    connect_one_tap: 'Conectar em 1 toque',
    copy_info: 'Copiar informações',
    open_network: 'Aberta',
    // Doorbell
    present: 'Presente',
    absent: 'Ausente',
    ring: 'Tocar',
    leave_message: 'Deixar uma mensagem',
    send_message: 'Enviar mensagem',
    instructions: 'Instruções',
    ring_sent: 'Campainha enviada!',
    message_sent: 'Mensagem enviada!',
    notified: 'O morador foi notificado da sua visita.',
    notify_me: 'Notificar-me',
    close_instructions: 'Fechar instruções',
    write_your_message: 'Deixar uma mensagem',
    your_message_will_be_sent: 'Sua mensagem será enviada ao morador',
    // Contact
    contact_info: 'Informações de contato',
    phone: 'Telefone',
    email: 'E-mail',
    name: 'Contato',
    address: 'Endereço',
    no_contact_info: 'Nenhuma informação de contato disponível.',
    // Guestbook
    guestbook: 'Livro de visitas',
    write_message: 'Deixar uma mensagem',
    messages: 'mensagens',
    submit: 'Enviar',
    your_name: 'Seu nome',
    your_message: 'Sua mensagem...',
    enter_your_name: 'Por favor, insira seu nome',
    write_a_message: 'Por favor, escreva uma mensagem',
    message_added: 'Mensagem adicionada!',
    send_error: 'Erro ao enviar, tente novamente',
    // Note
    note: 'Nota',
    shopping_list: 'Lista de compras',
    checklist: 'Lista de verificação',
    no_content_configured: 'Nenhum conteúdo configurado',
  },
  ar: {
    back: 'رجوع',
    close: 'إغلاق',
    copy: 'نسخ',
    copied: 'تم النسخ!',
    retry: 'إعادة المحاولة',
    loading: 'جارٍ التحميل...',
    error: 'خطأ',
    powered_by: 'مدعوم بواسطة QR Domotik',
    scan_to_access: 'امسح QR للوصول',
    // WiFi
    guest_wifi: 'واي فاي الضيوف',
    network: 'الشبكة',
    security: 'الأمان',
    password: 'كلمة المرور',
    connect_wifi: 'الاتصال بالواي فاي',
    copy_password: 'نسخ كلمة المرور',
    hidden_network: 'شبكة مخفية',
    connected_count: 'شخص قاموا بمسح هذا QR',
    connect_one_tap: 'اتصال بنقرة واحدة',
    copy_info: 'نسخ المعلومات',
    open_network: 'مفتوحة',
    // Doorbell
    present: 'حاضر',
    absent: 'غائب',
    ring: 'رنين',
    leave_message: 'ترك رسالة',
    send_message: 'إرسال رسالة',
    instructions: 'تعليمات',
    ring_sent: 'تم إرسال الجرس!',
    message_sent: 'تم إرسال الرسالة!',
    notified: 'تم إبلاغ الساكن بزيارتك.',
    notify_me: 'أبلغني',
    close_instructions: 'إغلاق التعليمات',
    write_your_message: 'ترك رسالة',
    your_message_will_be_sent: 'سيتم إرسال رسالتك إلى الساكن',
    // Contact
    contact_info: 'معلومات الاتصال',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني',
    name: 'جهة اتصال',
    address: 'العنوان',
    no_contact_info: 'لا توجد معلومات اتصال متاحة.',
    // Guestbook
    guestbook: 'سجل الزوار',
    write_message: 'ترك رسالة',
    messages: 'رسائل',
    submit: 'إرسال',
    your_name: 'اسمك',
    your_message: 'رسالتك...',
    enter_your_name: 'يرجى إدخال اسمك',
    write_a_message: 'يرجى كتابة رسالة',
    message_added: 'تمت إضافة الرسالة!',
    send_error: 'خطأ في الإرسال، يرجى المحاولة مرة أخرى',
    // Note
    note: 'ملاحظة',
    shopping_list: 'قائمة التسوق',
    checklist: 'قائمة التحقق',
    no_content_configured: 'لم يتم تكوين أي محتوى',
  },
};

// ============================================================
// SUPPORTED LOCALES & RTL DETECTION
// ============================================================

const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'nl', 'it', 'pt', 'ar'];
const RTL_LOCALES = ['ar'];

/**
 * Detect the best matching locale from a browser language string.
 * e.g. 'en-US' → 'en', 'ar-SA' → 'ar', 'zh-CN' → 'fr' (fallback)
 */
function detectLocale(lang: string | undefined): string {
  if (!lang) return 'fr';
  const code = lang.split('-')[0].toLowerCase();
  if (SUPPORTED_LOCALES.includes(code)) return code;
  return 'fr'; // French fallback
}

// ============================================================
// HOOK: useTranslation
// ============================================================

export function useTranslation() {
  const locale = useMemo(() => {
    return detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined);
  }, []);

  const dir = RTL_LOCALES.includes(locale) ? 'rtl' as const : 'ltr' as const;

  const t = useMemo(() => {
    const translations = TRANSLATIONS[locale] || TRANSLATIONS['fr'];
    return (key: string): string => {
      return (translations as Record<string, string>)[key] || TRANSLATIONS['fr'][key as TranslationKey] || key;
    };
  }, [locale]);

  return { t, locale, dir };
}

// ============================================================
// UTILITY: getTranslation (non-hook, for server or direct use)
// ============================================================

export function getTranslation(locale: string, key: string): string {
  const translations = TRANSLATIONS[locale] || TRANSLATIONS['fr'];
  return (translations as Record<string, string>)[key] || TRANSLATIONS['fr'][key as TranslationKey] || key;
}
