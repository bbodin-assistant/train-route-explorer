use crate::model::CsvRow;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use zip::ZipArchive;

pub(crate) fn read_zip_csv(bytes: &[u8], filename: &str) -> Result<Vec<CsvRow>, String> {
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

pub(crate) fn require_columns(rows: &[CsvRow], filename: &str, columns: &[&str]) -> Result<(), String> {
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

pub(crate) fn field(row: &CsvRow, key: &str) -> String {
    row.get(key).cloned().unwrap_or_default()
}

pub(crate) fn parse_minutes(value: &str) -> Option<i32> {
    let parts = value.split(':').collect::<Vec<_>>();
    if parts.len() != 3 {
        return None;
    }
    let hours = parts[0].parse::<i32>().ok()?;
    let minutes = parts[1].parse::<i32>().ok()?;
    let seconds = parts[2].parse::<i32>().ok()?;
    Some(hours * 60 + minutes + if seconds >= 30 { 1 } else { 0 })
}

pub(crate) fn format_gtfs_date(value: &str) -> String {
    if value.len() == 8 && value.chars().all(|char| char.is_ascii_digit()) {
        format!("{}-{}-{}", &value[0..4], &value[4..6], &value[6..8])
    } else {
        value.to_string()
    }
}

pub(crate) fn minutes_to_duration(minutes: i32) -> String {
    let hours = minutes / 60;
    let mins = minutes % 60;
    if hours > 0 {
        format!("{hours}h{mins:02}")
    } else {
        format!("{mins}m")
    }
}


