use crate::model::{EnrichedStop, Leg, Segment, StopPoint, TripJourney};
use std::collections::{HashMap, HashSet};

fn write_string(buffer: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    buffer.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buffer.extend_from_slice(bytes);
}

#[cfg(test)]
pub(crate) fn encode_trip_journeys(trips: &[TripJourney]) -> Vec<u8> {
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

pub(crate) fn encode_unrestricted_trip_journeys(
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
    pub(crate) fn new(bytes: &'a [u8]) -> Self {
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

pub(crate) fn decode_trip_journeys(data: &[u8]) -> Result<Vec<TripJourney>, String> {
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

pub(crate) struct UnrestrictedTransferIndex<'a> {
    trips: &'a [TripJourney],
    boardings: HashMap<String, Vec<(usize, usize)>>,
}

impl<'a> UnrestrictedTransferIndex<'a> {
    pub(crate) fn new(trips: &'a [TripJourney], active_services: &HashSet<String>) -> Self {
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

    pub(crate) fn starting_segments(&self, origins: &[String]) -> Vec<Segment> {
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

    pub(crate) fn valid_next_segments(&self, previous: &Leg, min_transfer: i32, max_transfer: i32) -> Vec<Segment> {
        self.valid_segments(previous, min_transfer, max_transfer, None)
    }

    pub(crate) fn valid_final_segments(
        &self,
        previous: &Leg,
        min_transfer: i32,
        max_transfer: i32,
        destinations: &HashSet<String>,
    ) -> Vec<Segment> {
        self.valid_segments(previous, min_transfer, max_transfer, Some(destinations))
    }
}


