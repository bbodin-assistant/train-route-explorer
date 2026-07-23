use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::io::{Cursor, Read};
use wasm_bindgen::prelude::*;
use zip::ZipArchive;

const SERVICE_DAY_MINUTES: i32 = 24 * 60;
const MAX_ITINERARY_RECORDS: usize = 2_000;

type CsvRow = HashMap<String, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildConfig {
    local_origins: Vec<String>,
    connection_stations: Vec<String>,
    side_b_destinations: Vec<String>,
    train_types: Vec<String>,
    max_transfer_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RouteRequest {
    selected_day: Option<String>,
    min_transfer_minutes: i32,
    max_transfer_minutes: i32,
    max_transfer_count: usize,
    max_journey_duration_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coverage {
    first_service_date: Option<String>,
    last_service_date: Option<String>,
    service_day_count: usize,
    label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StopPoint {
    stop_name: String,
    arrival_time: String,
    departure_time: String,
    arrival_minutes: i32,
    departure_minutes: i32,
    lat: f64,
    lon: f64,
    in_segment: bool,
}

#[derive(Debug, Clone)]
struct EnrichedStop {
    service_id: String,
    route_id: String,
    train_type: String,
    train_number: String,
    stop_name: String,
    arrival_time: String,
    departure_time: String,
    arrival_minutes: i32,
    departure_minutes: i32,
    stop_sequence: i32,
    lat: f64,
    lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Segment {
    trip_id: String,
    service_id: String,
    route_id: String,
    train_type: String,
    train_number: String,
    departure_stop: String,
    destination_stop: String,
    departure_time: String,
    arrival_time: String,
    departure_minutes: i32,
    arrival_minutes: i32,
    path: Vec<StopPoint>,
    journey_path: Vec<StopPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Leg {
    trip_id: String,
    service_id: String,
    route_id: String,
    train_type: String,
    train_number: String,
    departure_stop: String,
    destination_stop: String,
    departure_time: String,
    arrival_time: String,
    departure_minutes: i32,
    arrival_minutes: i32,
    path: Vec<StopPoint>,
    journey_path: Vec<StopPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Transfer {
    station: String,
    arrival_time: String,
    departure_time: String,
    arrival_minutes: i32,
    departure_minutes: i32,
    wait_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Itinerary {
    trip_id: String,
    date: String,
    direction: String,
    departure_stop: String,
    destination_stop: String,
    departure_time: String,
    arrival_time: String,
    departure_minutes: i32,
    arrival_minutes: i32,
    total_duration_minutes: i32,
    transfer_wait_minutes: i32,
    transfer_count: usize,
    train_type: String,
    legs: Vec<Leg>,
    transfers: Vec<Transfer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RouteResult {
    selected_day: Option<String>,
    outward: Vec<Itinerary>,
    returns: Vec<Itinerary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RouteContext {
    coverage: Coverage,
    available_days: Vec<String>,
    station_names: Vec<String>,
    train_types: Vec<String>,
    service_days: BTreeMap<String, Vec<String>>,
    local_to_connection: Vec<Segment>,
    local_to_side_b: Vec<Segment>,
    connection_to_side_b: Vec<Segment>,
    connection_to_connection: Vec<Segment>,
    side_b_to_local: Vec<Segment>,
    side_b_to_connection: Vec<Segment>,
    connection_to_local: Vec<Segment>,
}

#[derive(Debug, Clone)]
struct StopMeta {
    name: String,
    lat: f64,
    lon: f64,
}

#[derive(Debug, Clone)]
struct TripMeta {
    route_id: String,
    service_id: String,
    train_type: String,
    train_number: String,
}

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|error| js_error(error.to_string()))
}

fn from_js<T: for<'de> Deserialize<'de>>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|error| js_error(error.to_string()))
}

fn read_zip_csv(bytes: &[u8], filename: &str) -> Result<Vec<CsvRow>, String> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|error| format!("Invalid GTFS zip: {error}"))?;
    let mut file = archive
        .by_name(filename)
        .map_err(|_| format!("Missing GTFS file in archive: {filename}"))?;
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|error| format!("Cannot read {filename}: {error}"))?;
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(content.as_bytes());
    let headers = reader
        .headers()
        .map_err(|error| format!("Cannot read {filename} headers: {error}"))?
        .iter()
        .map(|header| header.to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|error| format!("Cannot parse {filename}: {error}"))?;
        let mut row = HashMap::new();
        for (index, value) in record.iter().enumerate() {
            if let Some(header) = headers.get(index) {
                row.insert(header.clone(), value.to_string());
            }
        }
        rows.push(row);
    }
    Ok(rows)
}

fn require_columns(rows: &[CsvRow], filename: &str, columns: &[&str]) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }
    let first = &rows[0];
    let missing = columns
        .iter()
        .filter(|column| !first.contains_key(**column))
        .map(|column| column.to_string())
        .collect::<Vec<_>>();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!("{filename} is missing required columns: {missing:?}"))
    }
}

fn field(row: &CsvRow, key: &str) -> String {
    row.get(key).cloned().unwrap_or_default()
}

fn parse_minutes(value: &str) -> Option<i32> {
    let parts = value.split(':').collect::<Vec<_>>();
    if parts.len() != 3 {
        return None;
    }
    let hours = parts[0].parse::<i32>().ok()?;
    let minutes = parts[1].parse::<i32>().ok()?;
    let seconds = parts[2].parse::<i32>().ok()?;
    Some(hours * 60 + minutes + if seconds >= 30 { 1 } else { 0 })
}

fn format_gtfs_date(value: &str) -> String {
    if value.len() == 8 && value.chars().all(|char| char.is_ascii_digit()) {
        format!("{}-{}-{}", &value[0..4], &value[4..6], &value[6..8])
    } else {
        value.to_string()
    }
}

fn minutes_to_duration(minutes: i32) -> String {
    let hours = minutes / 60;
    let mins = minutes % 60;
    if hours > 0 {
        format!("{hours}h{mins:02}")
    } else {
        format!("{mins}m")
    }
}

fn split_tokens(value: &str) -> Vec<String> {
    value
        .split(|char: char| !char.is_ascii_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(|token| token.to_ascii_uppercase())
        .collect()
}

fn product_label(token: &str) -> Option<&'static str> {
    match token {
        "OUI" | "INOUI" => Some("INOUI"),
        "OGO" | "OUIGO" => Some("OUIGO"),
        "TER" | "CTE" => Some("TER"),
        "IC" | "INTERCITE" | "INTERCITES" => Some("INTERCITE"),
        _ => None,
    }
}

fn is_operational_code(value: &str) -> bool {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.is_empty() || chars.iter().all(|char| char.is_ascii_digit()) {
        return true;
    }
    let mut seen_digit = false;
    let mut letter_count = 0;
    for char in chars {
        if char.is_ascii_uppercase() && !seen_digit {
            letter_count += 1;
            continue;
        }
        if char.is_ascii_digit() {
            seen_digit = true;
            continue;
        }
        if char.is_ascii_uppercase() && seen_digit {
            continue;
        }
        return false;
    }
    seen_digit && (1..=3).contains(&letter_count)
}

fn infer_train_type(parts: &[String]) -> String {
    for part in parts {
        for token in split_tokens(part) {
            if let Some(label) = product_label(&token) {
                return label.to_string();
            }
        }
    }
    for part in parts {
        let text = part.trim();
        if text.is_empty() || text.eq_ignore_ascii_case("nan") {
            continue;
        }
        let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
        let upper = compact.to_ascii_uppercase();
        if is_operational_code(&upper) || upper.contains('-') || upper.contains(" TO ") {
            continue;
        }
        let acronyms = split_tokens(&compact)
            .into_iter()
            .filter(|token| token.len() > 1)
            .collect::<Vec<_>>();
        if let Some(first) = acronyms.first() {
            if !matches!(first.as_str(), "BUS" | "CAR" | "CARS" | "TRAIN" | "TGV" | "TRAM" | "METRO") {
                return first.clone();
            }
        }
    }
    "Train".to_string()
}

fn train_number(headsign: &str) -> String {
    split_tokens(headsign)
        .into_iter()
        .find(|token| token.chars().all(|char| char.is_ascii_digit()) && token.len() >= 3)
        .unwrap_or_default()
}

fn load_service_days(rows: &[CsvRow]) -> BTreeMap<String, Vec<String>> {
    let mut map: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for row in rows {
        if field(row, "exception_type") != "1" {
            continue;
        }
        let service = field(row, "service_id");
        let day = field(row, "date");
        if !service.is_empty() && !day.is_empty() {
            map.entry(day).or_default().insert(service);
        }
    }
    map.into_iter()
        .map(|(day, services)| (day, services.into_iter().collect()))
        .collect()
}

fn coverage_from_service_days(service_days: &BTreeMap<String, Vec<String>>) -> Coverage {
    let first = service_days.keys().next().cloned();
    let last = service_days.keys().next_back().cloned();
    let label = match (&first, &last) {
        (Some(start), Some(end)) => format!("{} to {}", format_gtfs_date(start), format_gtfs_date(end)),
        _ => "no active service dates".to_string(),
    };
    Coverage {
        first_service_date: first,
        last_service_date: last,
        service_day_count: service_days.len(),
        label,
    }
}

fn selected_train_types(config: &BuildConfig) -> Option<HashSet<String>> {
    let values = config
        .train_types
        .iter()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .collect::<HashSet<_>>();
    if values.is_empty() { None } else { Some(values) }
}

fn stop_point(row: &EnrichedStop, in_segment: bool) -> StopPoint {
    StopPoint {
        stop_name: row.stop_name.clone(),
        arrival_time: row.arrival_time.clone(),
        departure_time: row.departure_time.clone(),
        arrival_minutes: row.arrival_minutes,
        departure_minutes: row.departure_minutes,
        lat: row.lat,
        lon: row.lon,
        in_segment,
    }
}

fn find_trip_segments(
    trips: &HashMap<String, Vec<EnrichedStop>>,
    start_stations: &[String],
    end_stations: &[String],
    train_types: &Option<HashSet<String>>,
) -> Vec<Segment> {
    let start_set = start_stations.iter().cloned().collect::<HashSet<_>>();
    let end_set = end_stations.iter().cloned().collect::<HashSet<_>>();
    let mut segments = Vec::new();

    for (trip_id, rows) in trips {
        if rows.is_empty() {
            continue;
        }
        if let Some(types) = train_types {
            if !types.contains(&rows[0].train_type) {
                continue;
            }
        }
        let start_indexes = rows
            .iter()
            .enumerate()
            .filter_map(|(index, row)| start_set.contains(&row.stop_name).then_some(index))
            .collect::<Vec<_>>();
        let end_indexes = rows
            .iter()
            .enumerate()
            .filter_map(|(index, row)| end_set.contains(&row.stop_name).then_some(index))
            .collect::<Vec<_>>();
        for start_index in &start_indexes {
            for end_index in &end_indexes {
                if end_index <= start_index {
                    continue;
                }
                let first = &rows[*start_index];
                let last = &rows[*end_index];
                let path = rows[*start_index..=*end_index]
                    .iter()
                    .map(|row| stop_point(row, true))
                    .collect::<Vec<_>>();
                let journey_path = rows
                    .iter()
                    .enumerate()
                    .map(|(index, row)| stop_point(row, index >= *start_index && index <= *end_index))
                    .collect::<Vec<_>>();
                segments.push(Segment {
                    trip_id: trip_id.clone(),
                    service_id: first.service_id.clone(),
                    route_id: first.route_id.clone(),
                    train_type: first.train_type.clone(),
                    train_number: first.train_number.clone(),
                    departure_stop: first.stop_name.clone(),
                    destination_stop: last.stop_name.clone(),
                    departure_time: first.departure_time.clone(),
                    arrival_time: last.arrival_time.clone(),
                    departure_minutes: first.departure_minutes,
                    arrival_minutes: last.arrival_minutes,
                    path,
                    journey_path,
                });
            }
        }
    }
    segments.sort_by(|left, right| {
        (
            left.departure_stop.as_str(),
            left.departure_minutes,
            left.arrival_minutes,
            left.destination_stop.as_str(),
            left.train_type.as_str(),
        )
            .cmp(&(
                right.departure_stop.as_str(),
                right.departure_minutes,
                right.arrival_minutes,
                right.destination_stop.as_str(),
                right.train_type.as_str(),
            ))
    });
    segments
}

fn active_segments(segments: &[Segment], service_days: &BTreeMap<String, Vec<String>>, day: &str) -> Vec<Segment> {
    let active = service_days
        .get(day)
        .map(|services| services.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default();
    segments
        .iter()
        .filter(|segment| active.contains(&segment.service_id))
        .cloned()
        .collect()
}

fn segment_to_leg(segment: &Segment) -> Leg {
    Leg {
        trip_id: segment.trip_id.clone(),
        service_id: segment.service_id.clone(),
        route_id: segment.route_id.clone(),
        train_type: segment.train_type.clone(),
        train_number: segment.train_number.clone(),
        departure_stop: segment.departure_stop.clone(),
        destination_stop: segment.destination_stop.clone(),
        departure_time: segment.departure_time.clone(),
        arrival_time: segment.arrival_time.clone(),
        departure_minutes: segment.departure_minutes,
        arrival_minutes: segment.arrival_minutes,
        path: segment.path.clone(),
        journey_path: segment.journey_path.clone(),
    }
}

fn transfers_from_legs(legs: &[Leg]) -> Vec<Transfer> {
    legs.windows(2)
        .map(|window| {
            let previous = &window[0];
            let following = &window[1];
            Transfer {
                station: previous.destination_stop.clone(),
                arrival_time: previous.arrival_time.clone(),
                departure_time: following.departure_time.clone(),
                arrival_minutes: previous.arrival_minutes,
                departure_minutes: following.departure_minutes,
                wait_minutes: following.departure_minutes - previous.arrival_minutes,
            }
        })
        .collect()
}

fn itinerary_record(legs: Vec<Leg>, selected_day: &str, direction: &str, max_duration: i32) -> Option<Itinerary> {
    let first = legs.first()?;
    let last = legs.last()?;
    let total_duration = last.arrival_minutes - first.departure_minutes;
    if total_duration < 0 || total_duration > max_duration {
        return None;
    }
    let transfers = transfers_from_legs(&legs);
    let train_type = legs
        .iter()
        .map(|leg| leg.train_type.clone())
        .collect::<Vec<_>>()
        .join(" + ");
    let trip_id = legs
        .iter()
        .map(|leg| leg.trip_id.clone())
        .collect::<Vec<_>>()
        .join("+");
    Some(Itinerary {
        trip_id,
        date: selected_day.to_string(),
        direction: direction.to_string(),
        departure_stop: first.departure_stop.clone(),
        destination_stop: last.destination_stop.clone(),
        departure_time: first.departure_time.clone(),
        arrival_time: last.arrival_time.clone(),
        departure_minutes: first.departure_minutes,
        arrival_minutes: last.arrival_minutes,
        total_duration_minutes: total_duration,
        transfer_wait_minutes: transfers.iter().map(|transfer| transfer.wait_minutes).sum(),
        transfer_count: transfers.len(),
        train_type,
        legs,
        transfers,
    })
}

fn valid_next_segments(
    candidates: &[Segment],
    previous: &Leg,
    min_transfer: i32,
    max_transfer: i32,
) -> Vec<Segment> {
    let min_departure = previous.arrival_minutes + min_transfer;
    let max_departure = previous.arrival_minutes + max_transfer;
    candidates
        .iter()
        .filter(|segment| {
            segment.departure_minutes >= min_departure
                && segment.departure_minutes <= max_departure
                && segment.trip_id != previous.trip_id
        })
        .cloned()
        .collect()
}

fn sort_and_dedupe_itineraries(itineraries: &mut Vec<Itinerary>) {
    itineraries.sort_by(|left, right| {
        (
            left.arrival_minutes,
            left.departure_minutes,
            left.transfer_count,
            left.total_duration_minutes,
            left.departure_stop.as_str(),
            left.destination_stop.as_str(),
            left.train_type.as_str(),
        )
            .cmp(&(
                right.arrival_minutes,
                right.departure_minutes,
                right.transfer_count,
                right.total_duration_minutes,
                right.departure_stop.as_str(),
                right.destination_stop.as_str(),
                right.train_type.as_str(),
            ))
    });
    let mut seen = HashSet::new();
    itineraries.retain(|itinerary| {
        let key = format!(
            "{}|{}|{}|{}|{}|{}",
            itinerary.direction,
            itinerary.trip_id,
            itinerary.departure_stop,
            itinerary.destination_stop,
            itinerary.departure_time,
            itinerary.arrival_time
        );
        seen.insert(key)
    });
}

fn build_itineraries(
    direct_segments: Vec<Segment>,
    first_leg_segments: Vec<Segment>,
    transfer_segments: Vec<Segment>,
    final_leg_segments: Vec<Segment>,
    selected_day: &str,
    direction: &str,
    request: &RouteRequest,
) -> Vec<Itinerary> {
    let min_transfer = request.min_transfer_minutes.max(0);
    let max_transfer = request.max_transfer_minutes.max(min_transfer);
    let max_duration = request.max_journey_duration_minutes.max(0);
    let max_transfers = request.max_transfer_count;
    let mut records = Vec::new();

    for direct in direct_segments {
        if let Some(record) = itinerary_record(vec![segment_to_leg(&direct)], selected_day, direction, max_duration) {
            records.push(record);
        }
    }

    let mut final_by_departure: HashMap<String, Vec<Segment>> = HashMap::new();
    for segment in final_leg_segments {
        final_by_departure
            .entry(segment.departure_stop.clone())
            .or_default()
            .push(segment);
    }
    let mut transfer_by_departure: HashMap<String, Vec<Segment>> = HashMap::new();
    for segment in transfer_segments {
        transfer_by_departure
            .entry(segment.departure_stop.clone())
            .or_default()
            .push(segment);
    }
    for values in final_by_departure.values_mut() {
        values.sort_by_key(|segment| segment.departure_minutes);
    }
    for values in transfer_by_departure.values_mut() {
        values.sort_by_key(|segment| segment.departure_minutes);
    }

    fn extend(
        records: &mut Vec<Itinerary>,
        legs: Vec<Leg>,
        visited: HashSet<String>,
        final_by_departure: &HashMap<String, Vec<Segment>>,
        transfer_by_departure: &HashMap<String, Vec<Segment>>,
        selected_day: &str,
        direction: &str,
        request: &RouteRequest,
        min_transfer: i32,
        max_transfer: i32,
        max_duration: i32,
        max_transfers: usize,
    ) {
        if records.len() >= MAX_ITINERARY_RECORDS {
            return;
        }
        let current = match legs.last() {
            Some(leg) => leg,
            None => return,
        };
        if current.arrival_minutes - legs[0].departure_minutes > max_duration {
            return;
        }
        if let Some(final_candidates) = final_by_departure.get(&current.destination_stop) {
            for final_segment in valid_next_segments(final_candidates, current, min_transfer, max_transfer) {
                let mut next_legs = legs.clone();
                next_legs.push(segment_to_leg(&final_segment));
                if let Some(record) = itinerary_record(next_legs, selected_day, direction, max_duration) {
                    records.push(record);
                    if records.len() >= MAX_ITINERARY_RECORDS {
                        return;
                    }
                }
            }
        }
        if legs.len() >= max_transfers {
            return;
        }
        if let Some(middle_candidates) = transfer_by_departure.get(&current.destination_stop) {
            for middle in valid_next_segments(middle_candidates, current, min_transfer, max_transfer) {
                if middle.departure_stop == middle.destination_stop || visited.contains(&middle.destination_stop) {
                    continue;
                }
                let mut next_visited = visited.clone();
                next_visited.insert(middle.destination_stop.clone());
                let mut next_legs = legs.clone();
                next_legs.push(segment_to_leg(&middle));
                extend(
                    records,
                    next_legs,
                    next_visited,
                    final_by_departure,
                    transfer_by_departure,
                    selected_day,
                    direction,
                    request,
                    min_transfer,
                    max_transfer,
                    max_duration,
                    max_transfers,
                );
                if records.len() >= MAX_ITINERARY_RECORDS {
                    return;
                }
            }
        }
    }

    if max_transfers > 0 {
        let mut sorted_first = first_leg_segments;
        sorted_first.sort_by_key(|segment| (segment.arrival_minutes, segment.departure_minutes));
        for first in sorted_first {
            let first_leg = segment_to_leg(&first);
            let mut visited = HashSet::new();
            visited.insert(first_leg.destination_stop.clone());
            extend(
                &mut records,
                vec![first_leg],
                visited,
                &final_by_departure,
                &transfer_by_departure,
                selected_day,
                direction,
                request,
                min_transfer,
                max_transfer,
                max_duration,
                max_transfers,
            );
            if records.len() >= MAX_ITINERARY_RECORDS {
                break;
            }
        }
    }

    sort_and_dedupe_itineraries(&mut records);
    records
}

fn matching_days(context: &RouteContext) -> Vec<String> {
    let all_services = [
        &context.local_to_connection,
        &context.local_to_side_b,
        &context.connection_to_side_b,
        &context.connection_to_connection,
        &context.side_b_to_local,
        &context.side_b_to_connection,
        &context.connection_to_local,
    ]
    .iter()
    .flat_map(|segments| segments.iter().map(|segment| segment.service_id.clone()))
    .collect::<HashSet<_>>();
    context
        .service_days
        .iter()
        .filter_map(|(day, services)| {
            services
                .iter()
                .any(|service| all_services.contains(service))
                .then_some(day.clone())
        })
        .collect()
}

#[wasm_bindgen]
pub fn build_context(bytes: &[u8], config_value: JsValue) -> Result<JsValue, JsValue> {
    let config: BuildConfig = from_js(config_value)?;

    let stops_rows = read_zip_csv(bytes, "stops.txt").map_err(js_error)?;
    let stop_times_rows = read_zip_csv(bytes, "stop_times.txt").map_err(js_error)?;
    let trips_rows = read_zip_csv(bytes, "trips.txt").map_err(js_error)?;
    let routes_rows = read_zip_csv(bytes, "routes.txt").map_err(js_error)?;
    let calendar_rows = read_zip_csv(bytes, "calendar_dates.txt").map_err(js_error)?;

    require_columns(&stops_rows, "stops.txt", &["stop_id", "stop_name", "stop_lat", "stop_lon"]).map_err(js_error)?;
    require_columns(
        &stop_times_rows,
        "stop_times.txt",
        &["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
    )
    .map_err(js_error)?;
    require_columns(&trips_rows, "trips.txt", &["route_id", "service_id", "trip_id", "trip_headsign"]).map_err(js_error)?;
    require_columns(&routes_rows, "routes.txt", &["route_id", "route_short_name", "route_long_name"]).map_err(js_error)?;
    require_columns(&calendar_rows, "calendar_dates.txt", &["service_id", "date", "exception_type"]).map_err(js_error)?;

    let mut stops = HashMap::new();
    let mut station_names = BTreeSet::new();
    for row in &stops_rows {
        let name = field(row, "stop_name");
        let lat = field(row, "stop_lat").parse::<f64>().unwrap_or(f64::NAN);
        let lon = field(row, "stop_lon").parse::<f64>().unwrap_or(f64::NAN);
        if name.is_empty() || !lat.is_finite() || !lon.is_finite() {
            continue;
        }
        station_names.insert(name.clone());
        stops.insert(field(row, "stop_id"), StopMeta { name, lat, lon });
    }

    let mut route_meta = HashMap::new();
    for row in &routes_rows {
        route_meta.insert(
            field(row, "route_id"),
            vec![
                field(row, "route_desc"),
                field(row, "route_long_name"),
                field(row, "route_short_name"),
                field(row, "route_id"),
            ],
        );
    }

    let mut trips = HashMap::new();
    let mut train_type_set = BTreeSet::new();
    for row in &trips_rows {
        let route_id = field(row, "route_id");
        let headsign = field(row, "trip_headsign");
        let mut parts = route_meta.get(&route_id).cloned().unwrap_or_default();
        parts.push(headsign.clone());
        parts.push(field(row, "trip_id"));
        let train_type = infer_train_type(&parts);
        train_type_set.insert(train_type.clone());
        trips.insert(
            field(row, "trip_id"),
            TripMeta {
                route_id,
                service_id: field(row, "service_id"),
                train_number: train_number(&headsign),
                train_type,
            },
        );
    }

    let mut by_trip: HashMap<String, Vec<EnrichedStop>> = HashMap::new();
    for row in &stop_times_rows {
        let trip_id = field(row, "trip_id");
        let Some(trip) = trips.get(&trip_id) else {
            continue;
        };
        let Some(stop) = stops.get(&field(row, "stop_id")) else {
            continue;
        };
        let arrival_time = field(row, "arrival_time");
        let departure_time = field(row, "departure_time");
        let Some(arrival_minutes) = parse_minutes(&arrival_time) else {
            continue;
        };
        let Some(departure_minutes) = parse_minutes(&departure_time) else {
            continue;
        };
        if !(0..SERVICE_DAY_MINUTES).contains(&arrival_minutes)
            || !(0..SERVICE_DAY_MINUTES).contains(&departure_minutes)
        {
            continue;
        }
        let Ok(stop_sequence) = field(row, "stop_sequence").parse::<i32>() else {
            continue;
        };
        by_trip.entry(trip_id.clone()).or_default().push(EnrichedStop {
            service_id: trip.service_id.clone(),
            route_id: trip.route_id.clone(),
            train_type: trip.train_type.clone(),
            train_number: trip.train_number.clone(),
            stop_name: stop.name.clone(),
            arrival_time,
            departure_time,
            arrival_minutes,
            departure_minutes,
            stop_sequence,
            lat: stop.lat,
            lon: stop.lon,
        });
    }
    by_trip.retain(|_, rows| rows.len() >= 2);
    for rows in by_trip.values_mut() {
        rows.sort_by_key(|row| row.stop_sequence);
    }

    let train_types = selected_train_types(&config);
    let all_station_names = station_names.iter().cloned().collect::<Vec<_>>();
    let connection_stations = if config.connection_stations.is_empty() {
        all_station_names.as_slice()
    } else {
        config.connection_stations.as_slice()
    };
    let mut connection_to_connection =
        find_trip_segments(&by_trip, connection_stations, connection_stations, &train_types);
    connection_to_connection.retain(|segment| segment.departure_stop != segment.destination_stop);

    let service_days = load_service_days(&calendar_rows);
    let mut context = RouteContext {
        coverage: coverage_from_service_days(&service_days),
        available_days: Vec::new(),
        station_names: station_names.into_iter().collect(),
        train_types: train_type_set.into_iter().collect(),
        service_days,
        local_to_connection: find_trip_segments(&by_trip, &config.local_origins, connection_stations, &train_types),
        local_to_side_b: find_trip_segments(&by_trip, &config.local_origins, &config.side_b_destinations, &train_types),
        connection_to_side_b: find_trip_segments(&by_trip, connection_stations, &config.side_b_destinations, &train_types),
        connection_to_connection,
        side_b_to_local: find_trip_segments(&by_trip, &config.side_b_destinations, &config.local_origins, &train_types),
        side_b_to_connection: find_trip_segments(&by_trip, &config.side_b_destinations, connection_stations, &train_types),
        connection_to_local: find_trip_segments(&by_trip, connection_stations, &config.local_origins, &train_types),
    };
    context.available_days = matching_days(&context);
    to_js(&context)
}

#[wasm_bindgen]
pub fn routes_for_day(context_value: JsValue, request_value: JsValue) -> Result<JsValue, JsValue> {
    let context: RouteContext = from_js(context_value)?;
    let request: RouteRequest = from_js(request_value)?;
    let selected_day = request
        .selected_day
        .clone()
        .or_else(|| context.available_days.first().cloned());
    let Some(day) = selected_day.clone() else {
        return to_js(&RouteResult {
            selected_day: None,
            outward: Vec::new(),
            returns: Vec::new(),
        });
    };

    let outward = build_itineraries(
        active_segments(&context.local_to_side_b, &context.service_days, &day),
        active_segments(&context.local_to_connection, &context.service_days, &day),
        active_segments(&context.connection_to_connection, &context.service_days, &day),
        active_segments(&context.connection_to_side_b, &context.service_days, &day),
        &day,
        "outward",
        &request,
    );
    let returns = build_itineraries(
        active_segments(&context.side_b_to_local, &context.service_days, &day),
        active_segments(&context.side_b_to_connection, &context.service_days, &day),
        active_segments(&context.connection_to_connection, &context.service_days, &day),
        active_segments(&context.connection_to_local, &context.service_days, &day),
        &day,
        "return",
        &request,
    );
    to_js(&RouteResult {
        selected_day: Some(day),
        outward,
        returns,
    })
}

#[wasm_bindgen]
pub fn duration_label(minutes: i32) -> String {
    minutes_to_duration(minutes)
}
