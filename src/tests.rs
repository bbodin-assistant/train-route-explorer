use crate::context::build_context_data;
use crate::gtfs::{field, read_zip_csv};
use crate::model::{BuildConfig, RouteMeta, RouteRequest, StopPoint, TripJourney};
use crate::routing::{build_itineraries, routes_for_day_data};
use crate::train_type::infer_train_type;
use crate::unrestricted::{
    decode_trip_journeys, encode_trip_journeys, UnrestrictedTransferIndex,
};
use std::collections::{BTreeMap, HashMap, HashSet};
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

