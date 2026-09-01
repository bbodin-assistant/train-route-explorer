use crate::gtfs::{field, format_gtfs_date, parse_minutes, read_zip_csv, require_columns};
use crate::model::{
    BuildConfig, Coverage, CsvRow, EnrichedStop, RouteContext, RouteMeta, Segment, StopMeta,
    StopPoint, TripMeta,
};
use crate::train_type::{infer_train_type, normalized_route_name, train_number};
use crate::unrestricted::encode_unrestricted_trip_journeys;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

const SERVICE_DAY_MINUTES: i32 = 24 * 60;

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

pub(crate) fn build_context_data(bytes: &[u8], config: BuildConfig) -> Result<RouteContext, String> {
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
