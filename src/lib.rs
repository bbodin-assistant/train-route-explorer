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
    route_name: String,
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
    route_name: String,
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

#[derive(Debug, Clone)]
struct TripJourney {
    trip_id: String,
    service_id: String,
    route_id: String,
    route_name: String,
    train_type: String,
    train_number: String,
    stops: Vec<StopPoint>,
}

impl TripJourney {
    fn len(&self) -> usize {
        self.stops.len()
    }

    fn stop_point(&self, index: usize, in_segment: bool) -> StopPoint {
        let mut stop = self.stops[index].clone();
        stop.in_segment = in_segment;
        stop
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Leg {
    trip_id: String,
    service_id: String,
    route_id: String,
    route_name: String,
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
    #[serde(default, with = "serde_bytes")]
    unrestricted_transfer_data: Vec<u8>,
    #[serde(default)]
    unrestricted_origins: Vec<String>,
    #[serde(default)]
    unrestricted_destinations: Vec<String>,
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
    route_name: String,
    train_type: String,
    train_number: String,
}

#[derive(Debug, Clone)]
struct RouteMeta {
    description: String,
    short_name: String,
    long_name: String,
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

fn normalized_route_name(value: &str) -> Option<String> {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let meaningful = compact
        .chars()
        .any(|character| character.is_alphanumeric());
    meaningful.then_some(compact)
}

fn infer_train_type(
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
                    route_name: first.route_name.clone(),
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

fn write_string(buffer: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    buffer.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buffer.extend_from_slice(bytes);
}

#[cfg(test)]
fn encode_trip_journeys(trips: &[TripJourney]) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(&(trips.len() as u32).to_le_bytes());
    for trip in trips {
        write_string(&mut buffer, &trip.trip_id);
        write_string(&mut buffer, &trip.service_id);
        write_string(&mut buffer, &trip.route_id);
        write_string(&mut buffer, &trip.route_name);
        write_string(&mut buffer, &trip.train_type);
        write_string(&mut buffer, &trip.train_number);
        buffer.extend_from_slice(&(trip.stops.len() as u32).to_le_bytes());
        for stop in &trip.stops {
            write_string(&mut buffer, &stop.stop_name);
            write_string(&mut buffer, &stop.arrival_time);
            write_string(&mut buffer, &stop.departure_time);
            buffer.extend_from_slice(&stop.arrival_minutes.to_le_bytes());
            buffer.extend_from_slice(&stop.departure_minutes.to_le_bytes());
            buffer.extend_from_slice(&stop.lat.to_le_bytes());
            buffer.extend_from_slice(&stop.lon.to_le_bytes());
        }
    }
    buffer
}

fn encode_unrestricted_trip_journeys(
    trips: &HashMap<String, Vec<EnrichedStop>>,
    train_types: &Option<HashSet<String>>,
) -> Vec<u8> {
    let mut selected = trips
        .iter()
        .filter(|(_, rows)| {
            rows.first().is_some_and(|first| {
                train_types
                    .as_ref()
                    .is_none_or(|types| types.contains(&first.train_type))
            })
        })
        .collect::<Vec<_>>();
    selected.sort_by(|(left, _), (right, _)| left.cmp(right));

    let mut buffer = Vec::new();
    buffer.extend_from_slice(&(selected.len() as u32).to_le_bytes());
    for (trip_id, rows) in selected {
        let first = &rows[0];
        write_string(&mut buffer, trip_id);
        write_string(&mut buffer, &first.service_id);
        write_string(&mut buffer, &first.route_id);
        write_string(&mut buffer, &first.route_name);
        write_string(&mut buffer, &first.train_type);
        write_string(&mut buffer, &first.train_number);
        buffer.extend_from_slice(&(rows.len() as u32).to_le_bytes());
        for stop in rows {
            write_string(&mut buffer, &stop.stop_name);
            write_string(&mut buffer, &stop.arrival_time);
            write_string(&mut buffer, &stop.departure_time);
            buffer.extend_from_slice(&stop.arrival_minutes.to_le_bytes());
            buffer.extend_from_slice(&stop.departure_minutes.to_le_bytes());
            buffer.extend_from_slice(&stop.lat.to_le_bytes());
            buffer.extend_from_slice(&stop.lon.to_le_bytes());
        }
    }
    buffer
}

struct ByteReader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> ByteReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn read<const N: usize>(&mut self) -> Result<[u8; N], String> {
        let end = self
            .offset
            .checked_add(N)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(|| "Invalid unrestricted transfer data".to_string())?;
        let value = self.bytes[self.offset..end]
            .try_into()
            .map_err(|_| "Invalid unrestricted transfer data".to_string())?;
        self.offset = end;
        Ok(value)
    }

    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.read()?))
    }

    fn i32(&mut self) -> Result<i32, String> {
        Ok(i32::from_le_bytes(self.read()?))
    }

    fn f64(&mut self) -> Result<f64, String> {
        Ok(f64::from_le_bytes(self.read()?))
    }

    fn string(&mut self) -> Result<String, String> {
        let length = self.u32()? as usize;
        let end = self
            .offset
            .checked_add(length)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(|| "Invalid unrestricted transfer data".to_string())?;
        let value = std::str::from_utf8(&self.bytes[self.offset..end])
            .map_err(|_| "Invalid UTF-8 in unrestricted transfer data".to_string())?
            .to_string();
        self.offset = end;
        Ok(value)
    }
}

fn decode_trip_journeys(data: &[u8]) -> Result<Vec<TripJourney>, String> {
    if data.is_empty() {
        return Ok(Vec::new());
    }
    let mut reader = ByteReader::new(data);
    let trip_count = reader.u32()? as usize;
    let mut trips = Vec::with_capacity(trip_count);
    for _ in 0..trip_count {
        let trip_id = reader.string()?;
        let service_id = reader.string()?;
        let route_id = reader.string()?;
        let route_name = reader.string()?;
        let train_type = reader.string()?;
        let train_number = reader.string()?;
        let stop_count = reader.u32()? as usize;
        let mut stops = Vec::with_capacity(stop_count);
        for _ in 0..stop_count {
            stops.push(StopPoint {
                stop_name: reader.string()?,
                arrival_time: reader.string()?,
                departure_time: reader.string()?,
                arrival_minutes: reader.i32()?,
                departure_minutes: reader.i32()?,
                lat: reader.f64()?,
                lon: reader.f64()?,
                in_segment: false,
            });
        }
        trips.push(TripJourney {
            trip_id,
            service_id,
            route_id,
            route_name,
            train_type,
            train_number,
            stops,
        });
    }
    if reader.offset != data.len() {
        return Err("Invalid trailing unrestricted transfer data".to_string());
    }
    Ok(trips)
}

fn segment_from_journey(trip: &TripJourney, start_index: usize, end_index: usize) -> Segment {
    let first = trip.stop_point(start_index, true);
    let last = trip.stop_point(end_index, true);
    let path = (start_index..=end_index)
        .map(|index| trip.stop_point(index, true))
        .collect();
    let journey_path = (0..trip.len())
        .map(|index| trip.stop_point(index, index >= start_index && index <= end_index))
        .collect();
    Segment {
        trip_id: trip.trip_id.clone(),
        service_id: trip.service_id.clone(),
        route_id: trip.route_id.clone(),
        route_name: trip.route_name.clone(),
        train_type: trip.train_type.clone(),
        train_number: trip.train_number.clone(),
        departure_stop: first.stop_name,
        destination_stop: last.stop_name,
        departure_time: first.departure_time,
        arrival_time: last.arrival_time,
        departure_minutes: first.departure_minutes,
        arrival_minutes: last.arrival_minutes,
        path,
        journey_path,
    }
}

struct UnrestrictedTransferIndex<'a> {
    trips: &'a [TripJourney],
    boardings: HashMap<String, Vec<(usize, usize)>>,
}

impl<'a> UnrestrictedTransferIndex<'a> {
    fn new(trips: &'a [TripJourney], active_services: &HashSet<String>) -> Self {
        let mut boardings: HashMap<String, Vec<(usize, usize)>> = HashMap::new();
        for (trip_index, trip) in trips.iter().enumerate() {
            if !active_services.contains(&trip.service_id) {
                continue;
            }
            for (stop_index, stop) in trip
                .stops
                .iter()
                .enumerate()
                .take(trip.len().saturating_sub(1))
            {
                boardings
                    .entry(stop.stop_name.clone())
                    .or_default()
                    .push((trip_index, stop_index));
            }
        }
        for values in boardings.values_mut() {
            values.sort_by(|(left_trip, left_stop), (right_trip, right_stop)| {
                let left = &trips[*left_trip];
                let right = &trips[*right_trip];
                (
                    left.stops[*left_stop].departure_minutes,
                    left.trip_id.as_str(),
                    *left_stop,
                )
                    .cmp(&(
                        right.stops[*right_stop].departure_minutes,
                        right.trip_id.as_str(),
                        *right_stop,
                    ))
            });
        }
        Self { trips, boardings }
    }

    fn starting_segments(&self, origins: &[String]) -> Vec<Segment> {
        let mut segments = Vec::new();
        for origin in origins.iter().collect::<HashSet<_>>() {
            for &(trip_index, start_index) in self
                .boardings
                .get(origin)
                .map(Vec::as_slice)
                .unwrap_or_default()
            {
                let trip = &self.trips[trip_index];
                for end_index in start_index + 1..trip.len() {
                    segments.push(segment_from_journey(trip, start_index, end_index));
                }
            }
        }
        segments.sort_by_key(|segment| (segment.arrival_minutes, segment.departure_minutes));
        segments
    }

    fn valid_segments(
        &self,
        previous: &Leg,
        min_transfer: i32,
        max_transfer: i32,
        destinations: Option<&HashSet<String>>,
    ) -> Vec<Segment> {
        let min_departure = previous.arrival_minutes + min_transfer;
        let max_departure = previous.arrival_minutes + max_transfer;
        let mut segments = Vec::new();
        for &(trip_index, start_index) in self
            .boardings
            .get(&previous.destination_stop)
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            let trip = &self.trips[trip_index];
            let departure = trip.stops[start_index].departure_minutes;
            if departure > max_departure {
                break;
            }
            if departure < min_departure || trip.trip_id == previous.trip_id {
                continue;
            }
            for end_index in start_index + 1..trip.len() {
                if destinations.is_some_and(|values| !values.contains(&trip.stops[end_index].stop_name)) {
                    continue;
                }
                segments.push(segment_from_journey(trip, start_index, end_index));
            }
        }
        segments.sort_by(|left, right| {
            (
                left.departure_minutes,
                left.arrival_minutes,
                left.destination_stop.as_str(),
                left.train_type.as_str(),
                left.trip_id.as_str(),
            )
                .cmp(&(
                    right.departure_minutes,
                    right.arrival_minutes,
                    right.destination_stop.as_str(),
                    right.train_type.as_str(),
                    right.trip_id.as_str(),
                ))
        });
        segments
    }

    fn valid_next_segments(&self, previous: &Leg, min_transfer: i32, max_transfer: i32) -> Vec<Segment> {
        self.valid_segments(previous, min_transfer, max_transfer, None)
    }

    fn valid_final_segments(
        &self,
        previous: &Leg,
        min_transfer: i32,
        max_transfer: i32,
        destinations: &HashSet<String>,
    ) -> Vec<Segment> {
        self.valid_segments(previous, min_transfer, max_transfer, Some(destinations))
    }
}

fn active_service_ids(service_days: &BTreeMap<String, Vec<String>>, day: &str) -> HashSet<String> {
    service_days
        .get(day)
        .map(|services| services.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default()
}

fn active_segments(segments: &[Segment], active_services: &HashSet<String>) -> Vec<Segment> {
    segments
        .iter()
        .filter(|segment| active_services.contains(&segment.service_id))
        .cloned()
        .collect()
}

fn segment_to_leg(segment: &Segment) -> Leg {
    Leg {
        trip_id: segment.trip_id.clone(),
        service_id: segment.service_id.clone(),
        route_id: segment.route_id.clone(),
        route_name: segment.route_name.clone(),
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
    unrestricted_transfers: Option<&UnrestrictedTransferIndex<'_>>,
    unrestricted_origins: &[String],
    unrestricted_destinations: &[String],
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
    let first_leg_segments = unrestricted_transfers
        .map(|index| index.starting_segments(unrestricted_origins))
        .unwrap_or(first_leg_segments);
    let unrestricted_destination_set = unrestricted_destinations.iter().cloned().collect::<HashSet<_>>();

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
        unrestricted_transfers: Option<&UnrestrictedTransferIndex<'_>>,
        unrestricted_destinations: &HashSet<String>,
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
        let final_candidates = if let Some(index) = unrestricted_transfers {
            index.valid_final_segments(current, min_transfer, max_transfer, unrestricted_destinations)
        } else {
            final_by_departure
                .get(&current.destination_stop)
                .map(|candidates| valid_next_segments(candidates, current, min_transfer, max_transfer))
                .unwrap_or_default()
        };
        for final_segment in final_candidates {
            let mut next_legs = legs.clone();
            next_legs.push(segment_to_leg(&final_segment));
            if let Some(record) = itinerary_record(next_legs, selected_day, direction, max_duration) {
                records.push(record);
                if records.len() >= MAX_ITINERARY_RECORDS {
                    return;
                }
            }
        }
        if legs.len() >= max_transfers {
            return;
        }
        let middle_candidates = if let Some(index) = unrestricted_transfers {
            index.valid_next_segments(current, min_transfer, max_transfer)
        } else {
            transfer_by_departure
                .get(&current.destination_stop)
                .map(|candidates| valid_next_segments(candidates, current, min_transfer, max_transfer))
                .unwrap_or_default()
        };
        for middle in middle_candidates {
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
                unrestricted_transfers,
                unrestricted_destinations,
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
                unrestricted_transfers,
                &unrestricted_destination_set,
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

fn matching_service_days(
    service_days: &BTreeMap<String, Vec<String>>,
    matching_services: &HashSet<String>,
) -> Vec<String> {
    service_days
        .iter()
        .filter_map(|(day, services)| {
            services
                .iter()
                .any(|service| matching_services.contains(service))
                .then_some(day.clone())
        })
        .collect()
}

fn matching_days(context: &RouteContext) -> Vec<String> {
    let matching_services = [
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
    matching_service_days(&context.service_days, &matching_services)
}

fn build_context_data(bytes: &[u8], config: BuildConfig) -> Result<RouteContext, String> {
    let stops_rows = read_zip_csv(bytes, "stops.txt")?;
    let stop_times_rows = read_zip_csv(bytes, "stop_times.txt")?;
    let trips_rows = read_zip_csv(bytes, "trips.txt")?;
    let routes_rows = read_zip_csv(bytes, "routes.txt")?;
    let calendar_rows = read_zip_csv(bytes, "calendar_dates.txt")?;

    require_columns(&stops_rows, "stops.txt", &["stop_id", "stop_name", "stop_lat", "stop_lon"])?;
    require_columns(
        &stop_times_rows,
        "stop_times.txt",
        &["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
    )
    ?;
    require_columns(&trips_rows, "trips.txt", &["route_id", "service_id", "trip_id", "trip_headsign"])?;
    require_columns(&routes_rows, "routes.txt", &["route_id", "route_short_name", "route_long_name"])?;
    require_columns(&calendar_rows, "calendar_dates.txt", &["service_id", "date", "exception_type"])?;

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
            RouteMeta {
                description: field(row, "route_desc"),
                short_name: field(row, "route_short_name"),
                long_name: field(row, "route_long_name"),
            },
        );
    }

    let mut trips = HashMap::new();
    let mut train_type_set = BTreeSet::new();
    for row in &trips_rows {
        let route_id = field(row, "route_id");
        let headsign = field(row, "trip_headsign");
        let trip_id = field(row, "trip_id");
        let route = route_meta.get(&route_id);
        let route_name = route
            .and_then(|metadata| normalized_route_name(&metadata.long_name))
            .unwrap_or_default();
        let train_type = route.map_or_else(
            || "Unknown".to_string(),
            |metadata| {
                infer_train_type(
                    &metadata.description,
                    &metadata.short_name,
                    &metadata.long_name,
                    &trip_id,
                )
            },
        );
        train_type_set.insert(train_type.clone());
        trips.insert(
            trip_id,
            TripMeta {
                route_id,
                service_id: field(row, "service_id"),
                route_name,
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
            route_name: trip.route_name.clone(),
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
    let unrestricted_connections = config.connection_stations.is_empty();
    let connection_stations = if unrestricted_connections {
        all_station_names.as_slice()
    } else {
        config.connection_stations.as_slice()
    };
    let mut connection_to_connection = if unrestricted_connections {
        Vec::new()
    } else {
        find_trip_segments(&by_trip, connection_stations, connection_stations, &train_types)
    };
    connection_to_connection.retain(|segment| segment.departure_stop != segment.destination_stop);
    let unrestricted_transfer_data = if unrestricted_connections {
        encode_unrestricted_trip_journeys(&by_trip, &train_types)
    } else {
        Vec::new()
    };
    let unrestricted_endpoints = config
        .local_origins
        .iter()
        .chain(&config.side_b_destinations)
        .cloned()
        .collect::<HashSet<_>>();
    let unrestricted_services = if unrestricted_connections {
        by_trip
            .values()
            .filter_map(|rows| {
                let first = rows.first()?;
                if train_types
                    .as_ref()
                    .is_some_and(|types| !types.contains(&first.train_type))
                    || !rows
                        .iter()
                        .any(|stop| unrestricted_endpoints.contains(&stop.stop_name))
                {
                    return None;
                }
                Some(first.service_id.clone())
            })
            .collect::<HashSet<_>>()
    } else {
        HashSet::new()
    };

    let service_days = load_service_days(&calendar_rows);
    let mut context = RouteContext {
        coverage: coverage_from_service_days(&service_days),
        available_days: Vec::new(),
        station_names: station_names.into_iter().collect(),
        train_types: train_type_set.into_iter().collect(),
        service_days,
        local_to_connection: if unrestricted_connections {
            Vec::new()
        } else {
            find_trip_segments(&by_trip, &config.local_origins, connection_stations, &train_types)
        },
        local_to_side_b: find_trip_segments(&by_trip, &config.local_origins, &config.side_b_destinations, &train_types),
        connection_to_side_b: if unrestricted_connections {
            Vec::new()
        } else {
            find_trip_segments(&by_trip, connection_stations, &config.side_b_destinations, &train_types)
        },
        connection_to_connection,
        side_b_to_local: find_trip_segments(&by_trip, &config.side_b_destinations, &config.local_origins, &train_types),
        side_b_to_connection: if unrestricted_connections {
            Vec::new()
        } else {
            find_trip_segments(&by_trip, &config.side_b_destinations, connection_stations, &train_types)
        },
        connection_to_local: if unrestricted_connections {
            Vec::new()
        } else {
            find_trip_segments(&by_trip, connection_stations, &config.local_origins, &train_types)
        },
        unrestricted_transfer_data,
        unrestricted_origins: unrestricted_connections
            .then(|| config.local_origins.clone())
            .unwrap_or_default(),
        unrestricted_destinations: unrestricted_connections
            .then(|| config.side_b_destinations.clone())
            .unwrap_or_default(),
    };
    context.available_days = if unrestricted_connections {
        matching_service_days(&context.service_days, &unrestricted_services)
    } else {
        matching_days(&context)
    };
    Ok(context)
}

#[wasm_bindgen]
pub fn build_context(bytes: &[u8], config_value: JsValue) -> Result<JsValue, JsValue> {
    let config: BuildConfig = from_js(config_value)?;
    let context = build_context_data(bytes, config).map_err(js_error)?;
    to_js(&context)
}

fn routes_for_day_data(context: &RouteContext, request: &RouteRequest) -> Result<RouteResult, String> {
    let selected_day = request
        .selected_day
        .clone()
        .or_else(|| context.available_days.first().cloned());
    let Some(day) = selected_day.clone() else {
        return Ok(RouteResult {
            selected_day: None,
            outward: Vec::new(),
            returns: Vec::new(),
        });
    };
    let active_services = active_service_ids(&context.service_days, &day);
    let unrestricted_transfer_trips = decode_trip_journeys(&context.unrestricted_transfer_data)?;
    let unrestricted_transfers = (!unrestricted_transfer_trips.is_empty())
        .then(|| UnrestrictedTransferIndex::new(&unrestricted_transfer_trips, &active_services));

    let outward = build_itineraries(
        active_segments(&context.local_to_side_b, &active_services),
        active_segments(&context.local_to_connection, &active_services),
        active_segments(&context.connection_to_connection, &active_services),
        unrestricted_transfers.as_ref(),
        &context.unrestricted_origins,
        &context.unrestricted_destinations,
        active_segments(&context.connection_to_side_b, &active_services),
        &day,
        "outward",
        request,
    );
    let returns = build_itineraries(
        active_segments(&context.side_b_to_local, &active_services),
        active_segments(&context.side_b_to_connection, &active_services),
        active_segments(&context.connection_to_connection, &active_services),
        unrestricted_transfers.as_ref(),
        &context.unrestricted_destinations,
        &context.unrestricted_origins,
        active_segments(&context.connection_to_local, &active_services),
        &day,
        "return",
        request,
    );
    Ok(RouteResult {
        selected_day: Some(day),
        outward,
        returns,
    })
}

#[wasm_bindgen]
pub fn routes_for_day(context_value: JsValue, request_value: JsValue) -> Result<JsValue, JsValue> {
    let context: RouteContext = from_js(context_value)?;
    let request: RouteRequest = from_js(request_value)?;
    let result = routes_for_day_data(&context, &request).map_err(js_error)?;
    to_js(&result)
}

#[wasm_bindgen]
pub fn duration_label(minutes: i32) -> String {
    minutes_to_duration(minutes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn test_stop(name: &str, minutes: i32) -> StopPoint {
        StopPoint {
            stop_name: name.to_string(),
            arrival_time: format!("{:02}:{:02}:00", minutes / 60, minutes % 60),
            departure_time: format!("{:02}:{:02}:00", minutes / 60, minutes % 60),
            arrival_minutes: minutes,
            departure_minutes: minutes,
            lat: 0.0,
            lon: 0.0,
            in_segment: false,
        }
    }

    fn test_trip(id: &str, stops: &[(&str, i32)]) -> TripJourney {
        TripJourney {
            trip_id: id.to_string(),
            service_id: "service".to_string(),
            route_id: id.to_string(),
            route_name: "Test corridor".to_string(),
            train_type: "Unknown".to_string(),
            train_number: id.to_string(),
            stops: stops
                .iter()
                .map(|(name, minutes)| test_stop(name, *minutes))
                .collect(),
        }
    }

    fn test_request() -> RouteRequest {
        RouteRequest {
            selected_day: Some("20260831".to_string()),
            min_transfer_minutes: 10,
            max_transfer_minutes: 60,
            max_transfer_count: 2,
            max_journey_duration_minutes: 240,
        }
    }

    #[test]
    fn unrestricted_transfers_find_an_unlisted_intermediate_route() {
        let first_trip = test_trip("first", &[("A", 480), ("X", 500)]);
        let middle_trip = test_trip("middle", &[("X", 515), ("Y", 540)]);
        let final_trip = test_trip("final", &[("Y", 550), ("B", 600)]);
        let encoded_trips = encode_trip_journeys(&[first_trip, middle_trip, final_trip]);
        let trips = decode_trip_journeys(&encoded_trips).expect("trip data should round trip");
        let active_services = HashSet::from(["service".to_string()]);
        let index = UnrestrictedTransferIndex::new(&trips, &active_services);

        let itineraries = build_itineraries(
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Some(&index),
            &["A".to_string()],
            &["B".to_string()],
            Vec::new(),
            "20260831",
            "outward",
            &test_request(),
        );

        assert_eq!(itineraries.len(), 1);
        assert_eq!(itineraries[0].transfer_count, 2);
        assert_eq!(itineraries[0].legs[1].trip_id, "middle");
        assert_eq!(itineraries[0].legs[1].route_name, "Test corridor");
        assert_eq!(itineraries[0].destination_stop, "B");
    }

    fn default_build_config(connection_stations: Vec<String>) -> BuildConfig {
        BuildConfig {
            local_origins: vec!["Saujon".to_string(), "Saintes".to_string()],
            connection_stations,
            side_b_destinations: vec![
                "Paris Montparnasse Hall 1 - 2".to_string(),
                "Massy TGV".to_string(),
                "Paris Est".to_string(),
                "Paris Gare du Nord".to_string(),
                "Paris Saint-Lazare".to_string(),
                "Paris Montparnasse Vaugirard".to_string(),
                "Paris Austerlitz".to_string(),
                "Paris Gare de Lyon Hall 1 - 2".to_string(),
            ],
            train_types: Vec::new(),
            max_transfer_count: 2,
        }
    }

    #[test]
    fn explicit_trip_codes_map_to_commercial_services() {
        for (trip_code, expected) in [
            ("OUI", "TGV INOUI"),
            ("OGO", "OUIGO Grande Vitesse"),
            ("IC", "INTERCITÉS"),
            ("ICN", "INTERCITÉS de nuit"),
            ("LYR", "TGV Lyria"),
            ("ICE", "ICE / DB–SNCF"),
            ("TER", "TER"),
            ("CTE", "TER"),
            ("TT", "Tram-train"),
            ("NAV", "Shuttle"),
        ] {
            let trip_id = format!("OCESN123F1187_F:{trip_code}:route:origin:destination");
            assert_eq!(
                infer_train_type("", "421I", "Paris - La Rochelle TGV", &trip_id),
                expected
            );
        }
    }

    #[test]
    fn corridor_names_are_details_not_guessed_service_types() {
        assert_eq!(
            infer_train_type(
                "",
                "361A",
                "Paris - Bruxelles",
                "OCESN50F1187_F:TRN:route"
            ),
            "OUIGO Train Classique"
        );
        assert_eq!(
            infer_train_type(
                "",
                "N01",
                "Navettes TGV HPI",
                "OCESN123F1187_F:CRE:route"
            ),
            "Shuttle"
        );
        assert_eq!(
            infer_train_type(
                "",
                "421I",
                "Paris - Poitiers - La Rochelle TGV",
                "OCESN123F1187_F:CRE:route"
            ),
            "Unknown"
        );
        assert_eq!(
            infer_train_type(
                "",
                "INCONNU",
                " -",
                "OCESN123F1187_F:CRE:route"
            ),
            "Unknown"
        );
    }

    #[test]
    #[ignore = "inventory audit requiring www/data/gtfs.zip"]
    fn audit_current_fixture_service_inventory() {
        let bytes = std::fs::read("www/data/gtfs.zip").expect("www/data/gtfs.zip is required");
        let routes_rows = read_zip_csv(&bytes, "routes.txt").expect("routes.txt should parse");
        let trips_rows = read_zip_csv(&bytes, "trips.txt").expect("trips.txt should parse");
        let route_meta = routes_rows
            .iter()
            .map(|row| {
                (
                    field(row, "route_id"),
                    RouteMeta {
                        description: field(row, "route_desc"),
                        short_name: field(row, "route_short_name"),
                        long_name: field(row, "route_long_name"),
                    },
                )
            })
            .collect::<HashMap<_, _>>();
        let mut counts = BTreeMap::new();
        for row in &trips_rows {
            let route_id = field(row, "route_id");
            let label = route_meta.get(&route_id).map_or_else(
                || "Unknown".to_string(),
                |route| {
                    infer_train_type(
                        &route.description,
                        &route.short_name,
                        &route.long_name,
                        &field(row, "trip_id"),
                    )
                },
            );
            *counts.entry(label).or_insert(0usize) += 1;
        }

        assert_eq!(
            counts,
            BTreeMap::from([
                ("ICE / DB–SNCF".to_string(), 254),
                ("INTERCITÉS".to_string(), 785),
                ("INTERCITÉS de nuit".to_string(), 234),
                ("OUIGO Grande Vitesse".to_string(), 591),
                ("OUIGO Train Classique".to_string(), 106),
                ("Shuttle".to_string(), 355),
                ("TER".to_string(), 37_490),
                ("TGV INOUI".to_string(), 8_326),
                ("TGV Lyria".to_string(), 351),
                ("Tram-train".to_string(), 452),
                ("Unknown".to_string(), 98),
            ])
        );
    }

    #[test]
    #[ignore = "performance probe requiring www/data/gtfs.zip"]
    fn benchmark_filtered_and_unrestricted_transfers() {
        let bytes = std::fs::read("www/data/gtfs.zip").expect("www/data/gtfs.zip is required");
        let request = test_request();

        for (label, stations) in [
            (
                "filtered",
                vec![
                    "Bordeaux Saint-Jean".to_string(),
                    "Poitiers".to_string(),
                    "Angoulême".to_string(),
                ],
            ),
            ("unrestricted", Vec::new()),
        ] {
            let build_started = Instant::now();
            let context = build_context_data(&bytes, default_build_config(stations)).expect("context should build");
            let build_elapsed = build_started.elapsed();
            let route_started = Instant::now();
            let routes = routes_for_day_data(&context, &request).expect("routes should build");
            let route_elapsed = route_started.elapsed();
            eprintln!(
                "{label}: build={build_elapsed:?}, routes={route_elapsed:?}, outward={}, returns={}, first_segments={}, final_segments={}, transfer_data_bytes={}",
                routes.outward.len(),
                routes.returns.len(),
                context.local_to_connection.len() + context.side_b_to_connection.len(),
                context.connection_to_side_b.len() + context.connection_to_local.len(),
                context.unrestricted_transfer_data.len(),
            );
            if label == "unrestricted" {
                assert!(context.connection_to_connection.is_empty());
                assert!(!context.unrestricted_transfer_data.is_empty());
            }
        }
    }
}
