// ---------- v1.0.8: Kontakte aus der Apple-Kontakte-App lesen (Mac) ----------
#[derive(serde::Serialize, Default)]
pub struct AppleContact {
    pub name: String,
    pub contact: String,
    pub email: String,
    pub phone: String,
    pub mobile: String,
    pub address: String,
    pub web: String,
    pub birthday: String,
}

#[cfg(target_os = "macos")]
pub mod mac_contacts {
    use super::AppleContact;
    use block2::{RcBlock, StackBlock};
    use objc2::{rc::Retained, runtime::{Bool, ProtocolObject}, AllocAnyThread};
    use objc2_contacts::*;
    use objc2_foundation::{NSArray, NSError, NSString};
    use std::{cell::RefCell, ptr::NonNull, sync::mpsc, time::Duration};

    const DENIED: &str = "Kein Zugriff auf die Kontakte – bitte in den Systemeinstellungen → Datenschutz & Sicherheit → Kontakte bei FinDocu erlauben";
    const UNDEF: isize = isize::MAX; // NSDateComponentUndefined

    fn s(x: &NSString) -> String { x.to_string().trim().to_string() }

    /// Alle Kontakte (inkl. iCloud, Exchange, Google-Konten am Mac). Fragt beim ersten Mal um Erlaubnis.
    pub fn list() -> Result<Vec<AppleContact>, String> {
        unsafe {
            let store = CNContactStore::new();
            let st = CNContactStore::authorizationStatusForEntityType(CNEntityType::Contacts);
            if st == CNAuthorizationStatus::NotDetermined {
                let (tx, rx) = mpsc::channel();
                let cb = RcBlock::new(move |ok: Bool, _e: *mut NSError| { let _ = tx.send(ok.as_bool()); });
                store.requestAccessForEntityType_completionHandler(CNEntityType::Contacts, &cb);
                if !rx.recv_timeout(Duration::from_secs(300)).unwrap_or(false) { return Err(DENIED.into()); }
            } else if st == CNAuthorizationStatus::Denied || st == CNAuthorizationStatus::Restricted {
                return Err(DENIED.into());
            }
            // nur diese Felder lesen (Notizen brauchen eine eigene Apple-Berechtigung und bleiben weg)
            let keys: Vec<&ProtocolObject<dyn CNKeyDescriptor>> = [
                CNContactGivenNameKey, CNContactFamilyNameKey, CNContactOrganizationNameKey, CNContactEmailAddressesKey,
                CNContactPhoneNumbersKey, CNContactPostalAddressesKey, CNContactUrlAddressesKey, CNContactBirthdayKey,
            ].into_iter().map(ProtocolObject::from_ref).collect();
            let keys = NSArray::from_slice(&keys);
            let req = CNContactFetchRequest::initWithKeysToFetch(CNContactFetchRequest::alloc(), &keys);
            let out: RefCell<Vec<AppleContact>> = RefCell::new(Vec::new());
            let blk = StackBlock::new(|c: NonNull<CNContact>, _stop: NonNull<Bool>| {
                let c = c.as_ref();
                let person = [s(&c.givenName()), s(&c.familyName())].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" ");
                let org = s(&c.organizationName());
                let (name, contact) = if !org.is_empty() { (org, person) } else { (person, String::new()) };
                if name.is_empty() { return; }
                let mut ct = AppleContact { name, contact, ..Default::default() };
                if let Some(e) = c.emailAddresses().firstObject() { ct.email = s(&e.value()); }
                for p in c.phoneNumbers().iter() {
                    let num = s(&p.value().stringValue());
                    let mob = p.label().map(|l| l.isEqualToString(CNLabelPhoneNumberMobile) || l.isEqualToString(CNLabelPhoneNumberiPhone)).unwrap_or(false);
                    if mob { if ct.mobile.is_empty() { ct.mobile = num; } } else if ct.phone.is_empty() { ct.phone = num; }
                }
                if let Some(a) = c.postalAddresses().firstObject() {
                    let a = a.value();
                    let city = [s(&a.postalCode()), s(&a.city())].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(" ");
                    ct.address = [s(&a.street()), city, s(&a.country())].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join("\n");
                }
                if let Some(u) = c.urlAddresses().firstObject() { ct.web = s(&u.value()); }
                if let Some(b) = c.birthday() {
                    let (y, m, d) = (b.year(), b.month(), b.day());
                    if m != UNDEF && d != UNDEF { ct.birthday = if y != UNDEF { format!("{y:04}-{m:02}-{d:02}") } else { format!("--{m:02}-{d:02}") }; }
                }
                out.borrow_mut().push(ct);
            });
            let mut err: Option<Retained<NSError>> = None;
            if !store.enumerateContactsWithFetchRequest_error_usingBlock(&req, Some(&mut err), &blk) {
                let why = err.map(|e| e.localizedDescription().to_string()).unwrap_or_default();
                return Err(format!("Kontakte konnten nicht gelesen werden {why}").trim().to_string());
            }
            Ok(out.into_inner())
        }
    }
}


/// Liste aller Kontakte der Apple-Kontakte-App (nur Mac). Läuft im Hintergrund, damit die Erlaubnis-Abfrage das Fenster nicht blockiert.
#[tauri::command]
pub async fn contacts_list() -> Result<Vec<AppleContact>, String> {
    #[cfg(target_os = "macos")]
    { return tauri::async_runtime::spawn_blocking(mac_contacts::list).await.map_err(|e| e.to_string())?; }
    #[allow(unreachable_code)]
    Err("Apple-Kontakte gibt es nur in der Mac-App".into())
}
