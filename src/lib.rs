mod context;
mod gtfs;
mod model;
mod routing;
mod train_type;
mod unrestricted;

use context::build_context_data;
use gtfs::minutes_to_duration;
use model::{BuildConfig, RouteContext, RouteRequest};
use routing::{routes_for_day_data, routes_for_day_data_with_progress};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

pub use model::Coverage;

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|error| js_error(error.to_string()))
}

fn from_js<T: for<'de> Deserialize<'de>>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|error| js_error(error.to_string()))
}

#[wasm_bindgen]
pub fn build_context(bytes: &[u8], config_value: JsValue) -> Result<JsValue, JsValue> {
    let config: BuildConfig = from_js(config_value)?;
    let context = build_context_data(bytes, config).map_err(js_error)?;
    to_js(&context)
}

#[wasm_bindgen]
pub fn routes_for_day(context_value: JsValue, request_value: JsValue) -> Result<JsValue, JsValue> {
    let context: RouteContext = from_js(context_value)?;
    let request: RouteRequest = from_js(request_value)?;
    let result = routes_for_day_data(&context, &request).map_err(js_error)?;
    to_js(&result)
}

#[wasm_bindgen]
pub fn routes_for_day_with_progress(
    context_value: JsValue,
    request_value: JsValue,
    progress_callback: js_sys::Function,
) -> Result<JsValue, JsValue> {
    let context: RouteContext = from_js(context_value)?;
    let request: RouteRequest = from_js(request_value)?;
    let mut report = |completed: usize, total: usize| {
        let _ = progress_callback.call2(
            &JsValue::NULL,
            &JsValue::from_f64(completed as f64),
            &JsValue::from_f64(total as f64),
        );
    };
    let result = routes_for_day_data_with_progress(&context, &request, &mut report).map_err(js_error)?;
    to_js(&result)
}

#[wasm_bindgen]
pub fn duration_label(minutes: i32) -> String {
    minutes_to_duration(minutes)
}

#[cfg(test)]
mod tests;
