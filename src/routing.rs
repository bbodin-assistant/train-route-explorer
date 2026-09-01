use crate::model::{Itinerary, Leg, RouteContext, RouteRequest, RouteResult, Segment, Transfer};
use crate::unrestricted::{decode_trip_journeys, UnrestrictedTransferIndex};
use std::collections::{BTreeMap, HashMap, HashSet};

const MAX_ITINERARY_RECORDS: usize = 2_000;

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

fn build_itineraries_with_progress(
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
    on_work_unit: &mut dyn FnMut(),
) -> Vec<Itinerary> {
    let min_transfer = request.min_transfer_minutes.max(0);
    let max_transfer = request.max_transfer_minutes.max(min_transfer);
    let max_duration = request.max_journey_duration_minutes.max(0);
    let max_transfers = request.max_transfer_count;
    let mut records = Vec::new();
    let first_leg_segments = if first_leg_segments.is_empty() {
        unrestricted_transfers
            .map(|index| index.starting_segments(unrestricted_origins))
            .unwrap_or_default()
    } else {
        first_leg_segments
    };
    let unrestricted_destination_set = unrestricted_destinations.iter().cloned().collect::<HashSet<_>>();

    for direct in direct_segments {
        if let Some(record) = itinerary_record(vec![segment_to_leg(&direct)], selected_day, direction, max_duration) {
            records.push(record);
        }
        on_work_unit();
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
            on_work_unit();
            if records.len() >= MAX_ITINERARY_RECORDS {
                break;
            }
        }
    }

    sort_and_dedupe_itineraries(&mut records);
    records
}

pub(crate) fn build_itineraries(
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
    let mut noop = || {};
    build_itineraries_with_progress(
        direct_segments,
        first_leg_segments,
        transfer_segments,
        unrestricted_transfers,
        unrestricted_origins,
        unrestricted_destinations,
        final_leg_segments,
        selected_day,
        direction,
        request,
        &mut noop,
    )
}

pub(crate) fn routes_for_day_data_with_progress(
    context: &RouteContext,
    request: &RouteRequest,
    progress: &mut dyn FnMut(usize, usize),
) -> Result<RouteResult, String> {
    let selected_day = request
        .selected_day
        .clone()
        .or_else(|| context.available_days.first().cloned());
    let Some(day) = selected_day.clone() else {
        progress(1, 1);
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

    let outward_direct = active_segments(&context.local_to_side_b, &active_services);
    let outward_first = unrestricted_transfers
        .as_ref()
        .map(|index| index.starting_segments(&context.unrestricted_origins))
        .unwrap_or_else(|| active_segments(&context.local_to_connection, &active_services));
    let outward_transfer = active_segments(&context.connection_to_connection, &active_services);
    let outward_final = active_segments(&context.connection_to_side_b, &active_services);

    let return_direct = active_segments(&context.side_b_to_local, &active_services);
    let return_first = unrestricted_transfers
        .as_ref()
        .map(|index| index.starting_segments(&context.unrestricted_destinations))
        .unwrap_or_else(|| active_segments(&context.side_b_to_connection, &active_services));
    let return_transfer = active_segments(&context.connection_to_connection, &active_services);
    let return_final = active_segments(&context.connection_to_local, &active_services);

    let transfer_units = if request.max_transfer_count > 0 {
        outward_first.len() + return_first.len()
    } else {
        0
    };
    let total_work = (outward_direct.len() + return_direct.len() + transfer_units).max(1);
    let mut completed_work = 0usize;
    progress(0, total_work);

    let mut completed_unit = || {
        completed_work = completed_work.saturating_add(1).min(total_work);
        progress(completed_work, total_work);
    };

    let outward = build_itineraries_with_progress(
        outward_direct,
        outward_first,
        outward_transfer,
        unrestricted_transfers.as_ref(),
        &context.unrestricted_origins,
        &context.unrestricted_destinations,
        outward_final,
        &day,
        "outward",
        request,
        &mut completed_unit,
    );
    let returns = build_itineraries_with_progress(
        return_direct,
        return_first,
        return_transfer,
        unrestricted_transfers.as_ref(),
        &context.unrestricted_destinations,
        &context.unrestricted_origins,
        return_final,
        &day,
        "return",
        request,
        &mut completed_unit,
    );

    drop(completed_unit);
    if completed_work < total_work {
        progress(total_work, total_work);
    }

    Ok(RouteResult {
        selected_day: Some(day),
        outward,
        returns,
    })
}

pub(crate) fn routes_for_day_data(context: &RouteContext, request: &RouteRequest) -> Result<RouteResult, String> {
    let mut noop = |_: usize, _: usize| {};
    routes_for_day_data_with_progress(context, request, &mut noop)
}
