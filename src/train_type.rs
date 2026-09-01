fn split_tokens(value: &str) -> Vec<String> {
    value
        .split(|char: char| !char.is_ascii_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(|token| token.to_ascii_uppercase())
        .collect()
}

fn service_label(token: &str) -> Option<&'static str> {
    match token {
        "OUI" | "INOUI" => Some("TGV INOUI"),
        "OGO" => Some("OUIGO Grande Vitesse"),
        "OUIGO" => Some("OUIGO"),
        "TER" | "CTE" => Some("TER"),
        "IC" | "INTERCITE" | "INTERCITES" => Some("INTERCITÉS"),
        "ICN" => Some("INTERCITÉS de nuit"),
        "LYR" | "LYRIA" => Some("TGV Lyria"),
        "ICE" => Some("ICE / DB–SNCF"),
        "TT" => Some("Tram-train"),
        "NAV" | "NAVETTE" | "NAVETTES" => Some("Shuttle"),
        "EUROSTAR" | "THALYS" => Some("Eurostar"),
        _ => None,
    }
}

pub(crate) fn normalized_route_name(value: &str) -> Option<String> {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let meaningful = compact
        .chars()
        .any(|character| character.is_alphanumeric());
    meaningful.then_some(compact)
}

pub(crate) fn infer_train_type(
    route_desc: &str,
    route_short_name: &str,
    route_long_name: &str,
    trip_id: &str,
) -> String {
    let normalized_route = normalized_route_name(route_long_name).unwrap_or_default();
    let route_upper = normalized_route.to_ascii_uppercase();

    // SNCF's per-trip service code is the strongest signal. It distinguishes
    // products that may share the same corridor, such as INOUI and OUIGO.
    for token in split_tokens(trip_id) {
        if token == "TRN" && (route_short_name == "361A" || route_upper == "PARIS - BRUXELLES") {
            return "OUIGO Train Classique".to_string();
        }
        if let Some(label) = service_label(&token) {
            return label.to_string();
        }
    }

    // Some feeds put the rider-facing brand in route metadata instead.
    let metadata = [route_desc, route_short_name, route_long_name];
    if metadata
        .iter()
        .any(|value| value.to_ascii_uppercase().contains("OUIGO TRAIN CLASSIQUE"))
    {
        return "OUIGO Train Classique".to_string();
    }
    for part in metadata {
        for token in split_tokens(part) {
            if let Some(label) = service_label(&token) {
                return label.to_string();
            }
        }
    }

    // These route names describe connections rather than a ticket brand, but
    // they unambiguously identify a shuttle service.
    if route_upper.contains("NAVETTE") {
        return "Shuttle".to_string();
    }

    // A corridor name or a bare TGV suffix cannot reliably distinguish INOUI,
    // OUIGO, or another international product.
    "Unknown".to_string()
}

pub(crate) fn train_number(headsign: &str) -> String {
    split_tokens(headsign)
        .into_iter()
        .find(|token| token.chars().all(|char| char.is_ascii_digit()) && token.len() >= 3)
        .unwrap_or_default()
}


