use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

pub(crate) type CsvRow = HashMap<String, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct BuildConfig {
    pub(crate) local_origins: Vec<String>,
    pub(crate) connection_stations: Vec<String>,
    pub(crate) side_b_destinations: Vec<String>,
    pub(crate) train_types: Vec<String>,
    pub(crate) max_transfer_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct RouteRequest {
    pub(crate) selected_day: Option<String>,
    pub(crate) min_transfer_minutes: i32,
    pub(crate) max_transfer_minutes: i32,
    pub(crate) max_transfer_count: usize,
    pub(crate) max_journey_duration_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coverage {
    pub(crate) first_service_date: Option<String>,
    pub(crate) last_service_date: Option<String>,
    pub(crate) service_day_count: usize,
    pub(crate) label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct StopPoint {
    pub(crate) stop_name: String,
    pub(crate) arrival_time: String,
    pub(crate) departure_time: String,
    pub(crate) arrival_minutes: i32,
    pub(crate) departure_minutes: i32,
    pub(crate) lat: f64,
    pub(crate) lon: f64,
    pub(crate) in_segment: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct EnrichedStop {
    pub(crate) service_id: String,
    pub(crate) route_id: String,
    pub(crate) route_name: String,
    pub(crate) train_type: String,
    pub(crate) train_number: String,
    pub(crate) stop_name: String,
    pub(crate) arrival_time: String,
    pub(crate) departure_time: String,
    pub(crate) arrival_minutes: i32,
    pub(crate) departure_minutes: i32,
    pub(crate) stop_sequence: i32,
    pub(crate) lat: f64,
    pub(crate) lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Segment {
    pub(crate) trip_id: String,
    pub(crate) service_id: String,
    pub(crate) route_id: String,
    pub(crate) route_name: String,
    pub(crate) train_type: String,
    pub(crate) train_number: String,
    pub(crate) departure_stop: String,
    pub(crate) destination_stop: String,
    pub(crate) departure_time: String,
    pub(crate) arrival_time: String,
    pub(crate) departure_minutes: i32,
    pub(crate) arrival_minutes: i32,
    pub(crate) path: Vec<StopPoint>,
    pub(crate) journey_path: Vec<StopPoint>,
}

#[derive(Debug, Clone)]
pub(crate) struct TripJourney {
    pub(crate) trip_id: String,
    pub(crate) service_id: String,
    pub(crate) route_id: String,
    pub(crate) route_name: String,
    pub(crate) train_type: String,
    pub(crate) train_number: String,
    pub(crate) stops: Vec<StopPoint>,
}

impl TripJourney {
    pub(crate) fn len(&self) -> usize {
        self.stops.len()
    }

    pub(crate) fn stop_point(&self, index: usize, in_segment: bool) -> StopPoint {
        let mut stop = self.stops[index].clone();
        stop.in_segment = in_segment;
        stop
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Leg {
    pub(crate) trip_id: String,
    pub(crate) service_id: String,
    pub(crate) route_id: String,
    pub(crate) route_name: String,
    pub(crate) train_type: String,
    pub(crate) train_number: String,
    pub(crate) departure_stop: String,
    pub(crate) destination_stop: String,
    pub(crate) departure_time: String,
    pub(crate) arrival_time: String,
    pub(crate) departure_minutes: i32,
    pub(crate) arrival_minutes: i32,
    pub(crate) path: Vec<StopPoint>,
    pub(crate) journey_path: Vec<StopPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Transfer {
    pub(crate) station: String,
    pub(crate) arrival_time: String,
    pub(crate) departure_time: String,
    pub(crate) arrival_minutes: i32,
    pub(crate) departure_minutes: i32,
    pub(crate) wait_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Itinerary {
    pub(crate) trip_id: String,
    pub(crate) date: String,
    pub(crate) direction: String,
    pub(crate) departure_stop: String,
    pub(crate) destination_stop: String,
    pub(crate) departure_time: String,
    pub(crate) arrival_time: String,
    pub(crate) departure_minutes: i32,
    pub(crate) arrival_minutes: i32,
    pub(crate) total_duration_minutes: i32,
    pub(crate) transfer_wait_minutes: i32,
    pub(crate) transfer_count: usize,
    pub(crate) train_type: String,
    pub(crate) legs: Vec<Leg>,
    pub(crate) transfers: Vec<Transfer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct RouteResult {
    pub(crate) selected_day: Option<String>,
    pub(crate) outward: Vec<Itinerary>,
    pub(crate) returns: Vec<Itinerary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct RouteContext {
    pub(crate) coverage: Coverage,
    pub(crate) available_days: Vec<String>,
    pub(crate) station_names: Vec<String>,
    pub(crate) train_types: Vec<String>,
    pub(crate) service_days: BTreeMap<String, Vec<String>>,
    pub(crate) local_to_connection: Vec<Segment>,
    pub(crate) local_to_side_b: Vec<Segment>,
    pub(crate) connection_to_side_b: Vec<Segment>,
    pub(crate) connection_to_connection: Vec<Segment>,
    pub(crate) side_b_to_local: Vec<Segment>,
    pub(crate) side_b_to_connection: Vec<Segment>,
    pub(crate) connection_to_local: Vec<Segment>,
    #[serde(default, with = "serde_bytes")]
    pub(crate) unrestricted_transfer_data: Vec<u8>,
    #[serde(default)]
    pub(crate) unrestricted_origins: Vec<String>,
    #[serde(default)]
    pub(crate) unrestricted_destinations: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct StopMeta {
    pub(crate) name: String,
    pub(crate) lat: f64,
    pub(crate) lon: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct TripMeta {
    pub(crate) route_id: String,
    pub(crate) service_id: String,
    pub(crate) route_name: String,
    pub(crate) train_type: String,
    pub(crate) train_number: String,
}

#[derive(Debug, Clone)]
pub(crate) struct RouteMeta {
    pub(crate) description: String,
    pub(crate) short_name: String,
    pub(crate) long_name: String,
}

