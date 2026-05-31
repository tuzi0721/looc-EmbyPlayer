use serde::{Deserialize, Serialize};
use serde_json::Value;

fn null_to_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

fn string_from_value(value: Value) -> Option<String> {
    match value {
        Value::String(value) => {
            if value.is_empty() {
                None
            } else {
                Some(value)
            }
        }
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Object(value) => ["Name", "Title", "Value", "DisplayName", "Id"]
            .iter()
            .find_map(|key| value.get(*key).cloned().and_then(string_from_value)),
        Value::Array(_) | Value::Null => None,
    }
}

fn string_or_default<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?
        .and_then(string_from_value)
        .unwrap_or_default())
}

fn optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?.and_then(string_from_value))
}

fn strings_from_value(value: Value) -> Vec<String> {
    match value {
        Value::Array(values) => values.into_iter().filter_map(string_from_value).collect(),
        value => string_from_value(value).into_iter().collect(),
    }
}

fn string_vec_or_default<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?
        .map(strings_from_value)
        .unwrap_or_default())
}

fn optional_string_vec<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let values = Option::<Value>::deserialize(deserializer)?
        .map(strings_from_value)
        .unwrap_or_default();
    if values.is_empty() {
        Ok(None)
    } else {
        Ok(Some(values))
    }
}

fn i64_from_value(value: Value) -> Option<i64> {
    match value {
        Value::Number(value) => value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|value| i64::try_from(value).ok()))
            .or_else(|| value.as_f64().map(|value| value as i64)),
        Value::String(value) => value.trim().parse::<i64>().ok(),
        Value::Bool(value) => Some(if value { 1 } else { 0 }),
        Value::Array(_) | Value::Object(_) | Value::Null => None,
    }
}

fn i32_from_value(value: Value) -> Option<i32> {
    i64_from_value(value).and_then(|value| i32::try_from(value).ok())
}

fn f32_from_value(value: Value) -> Option<f32> {
    match value {
        Value::Number(value) => value.as_f64().map(|value| value as f32),
        Value::String(value) => value.trim().parse::<f32>().ok(),
        Value::Bool(value) => Some(if value { 1.0 } else { 0.0 }),
        Value::Array(_) | Value::Object(_) | Value::Null => None,
    }
}

fn bool_from_value(value: Value) -> Option<bool> {
    match value {
        Value::Bool(value) => Some(value),
        Value::Number(value) => value
            .as_i64()
            .map(|value| value != 0)
            .or_else(|| value.as_u64().map(|value| value != 0))
            .or_else(|| value.as_f64().map(|value| value != 0.0)),
        Value::String(value) => match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" | "y" | "on" => Some(true),
            "false" | "0" | "no" | "n" | "off" => Some(false),
            _ => None,
        },
        Value::Array(_) | Value::Object(_) | Value::Null => None,
    }
}

fn optional_i32<'de, D>(deserializer: D) -> Result<Option<i32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?.and_then(i32_from_value))
}

fn optional_i64<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?.and_then(i64_from_value))
}

fn optional_f32<'de, D>(deserializer: D) -> Result<Option<f32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?.and_then(f32_from_value))
}

fn optional_bool<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?.and_then(bool_from_value))
}

fn i32_or_default<'de, D>(deserializer: D) -> Result<i32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?
        .and_then(i32_from_value)
        .unwrap_or_default())
}

fn i64_or_default<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?
        .and_then(i64_from_value)
        .unwrap_or_default())
}

fn bool_or_default<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Value>::deserialize(deserializer)?
        .and_then(bool_from_value)
        .unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AuthenticateRequest {
    pub username: String,
    pub pw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AuthenticationResult {
    pub user: EmbyUser,
    #[serde(default, deserialize_with = "string_or_default")]
    pub access_token: String,
    #[serde(default, deserialize_with = "string_or_default")]
    pub server_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EmbyUser {
    #[serde(default, deserialize_with = "string_or_default")]
    pub id: String,
    #[serde(default, deserialize_with = "string_or_default")]
    pub name: String,
    #[serde(default, deserialize_with = "optional_string")]
    pub primary_image_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SystemInfoPublic {
    #[serde(default, deserialize_with = "string_or_default")]
    pub server_name: String,
    #[serde(default, deserialize_with = "string_or_default")]
    pub version: String,
    #[serde(default, deserialize_with = "string_or_default")]
    pub id: String,
    #[serde(default, deserialize_with = "optional_string")]
    pub product_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ViewsResponse {
    #[serde(default, deserialize_with = "null_to_default")]
    pub items: Vec<MediaItem>,
    #[serde(default, deserialize_with = "i64_or_default")]
    pub total_record_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ItemsResponse {
    #[serde(default, deserialize_with = "null_to_default")]
    pub items: Vec<MediaItem>,
    #[serde(default, deserialize_with = "i64_or_default")]
    pub total_record_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MediaItem {
    #[serde(default, deserialize_with = "string_or_default")]
    pub id: String,
    #[serde(default, deserialize_with = "string_or_default")]
    pub name: String,
    #[serde(default, deserialize_with = "optional_string", rename = "Type")]
    pub item_type: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub overview: Option<String>,
    #[serde(default, deserialize_with = "optional_i32")]
    pub production_year: Option<i32>,
    #[serde(default, deserialize_with = "optional_f32")]
    pub community_rating: Option<f32>,
    #[serde(default, deserialize_with = "optional_string")]
    pub official_rating: Option<String>,
    #[serde(default, deserialize_with = "optional_f32")]
    pub primary_image_aspect_ratio: Option<f32>,
    #[serde(default, deserialize_with = "string_vec_or_default")]
    pub genres: Vec<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub genre_items: Vec<NameIdPair>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub studios: Vec<NameIdPair>,
    #[serde(default, deserialize_with = "optional_i64")]
    pub run_time_ticks: Option<i64>,
    #[serde(default, deserialize_with = "optional_string")]
    pub series_name: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub series_id: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub season_id: Option<String>,
    #[serde(default, deserialize_with = "optional_i32")]
    pub index_number: Option<i32>,
    #[serde(default, deserialize_with = "optional_i32")]
    pub parent_index_number: Option<i32>,
    #[serde(default)]
    pub image_tags: Option<Value>,
    #[serde(default, deserialize_with = "optional_string_vec")]
    pub backdrop_image_tags: Option<Vec<String>>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub user_data: Option<UserData>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub people: Vec<MediaPerson>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub media_sources: Vec<MediaSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct NameIdPair {
    #[serde(default, deserialize_with = "string_or_default")]
    pub name: String,
    #[serde(default, deserialize_with = "optional_string")]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MediaPerson {
    #[serde(default, deserialize_with = "string_or_default")]
    pub name: String,
    #[serde(default, deserialize_with = "optional_string")]
    pub id: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub role: Option<String>,
    #[serde(default, deserialize_with = "optional_string", rename = "Type")]
    pub person_type: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub primary_image_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "PascalCase")]
pub struct UserData {
    #[serde(default, deserialize_with = "optional_f32")]
    pub played_percentage: Option<f32>,
    #[serde(default, deserialize_with = "optional_i64")]
    pub playback_position_ticks: Option<i64>,
    #[serde(default, deserialize_with = "optional_string")]
    pub last_played_date: Option<String>,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub played: bool,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub is_favorite: bool,
    #[serde(default, deserialize_with = "i32_or_default")]
    pub play_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackInfoRequest {
    pub user_id: String,
    #[serde(default)]
    pub max_streaming_bitrate: Option<i64>,
    #[serde(default)]
    pub start_time_ticks: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackInfo {
    #[serde(default, deserialize_with = "null_to_default")]
    pub media_sources: Vec<MediaSource>,
    #[serde(default, deserialize_with = "string_or_default")]
    pub play_session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MediaSource {
    #[serde(default, deserialize_with = "string_or_default")]
    pub id: String,
    #[serde(default, deserialize_with = "optional_string")]
    pub container: Option<String>,
    #[serde(default, deserialize_with = "optional_i64")]
    pub size: Option<i64>,
    #[serde(default, deserialize_with = "optional_i64")]
    pub bitrate: Option<i64>,
    #[serde(default, deserialize_with = "optional_bool")]
    pub supports_direct_play: Option<bool>,
    #[serde(default, deserialize_with = "optional_bool")]
    pub supports_direct_stream: Option<bool>,
    #[serde(default, deserialize_with = "optional_bool")]
    pub supports_transcoding: Option<bool>,
    #[serde(default, deserialize_with = "optional_string")]
    pub path: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub media_streams: Vec<MediaStream>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MediaStream {
    #[serde(default, deserialize_with = "i32_or_default")]
    pub index: i32,
    #[serde(default, deserialize_with = "optional_string")]
    pub codec: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub language: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub display_title: Option<String>,
    #[serde(default, deserialize_with = "optional_string", rename = "Type")]
    pub stream_type: Option<String>,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub is_default: bool,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub is_external: bool,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub is_forced: bool,
    #[serde(default, deserialize_with = "optional_string")]
    pub delivery_url: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub delivery_method: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub path: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub title: Option<String>,
    #[serde(default, deserialize_with = "optional_i32")]
    pub width: Option<i32>,
    #[serde(default, deserialize_with = "optional_i32")]
    pub height: Option<i32>,
    #[serde(default, deserialize_with = "optional_i64")]
    pub bit_rate: Option<i64>,
    #[serde(default, deserialize_with = "optional_i32")]
    pub channels: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct RemoteSession {
    #[serde(default, deserialize_with = "string_or_default")]
    pub id: String,
    #[serde(default, deserialize_with = "optional_string")]
    pub user_id: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub user_name: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub device_id: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub device_name: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub client: Option<String>,
    #[serde(default, deserialize_with = "optional_string")]
    pub application_version: Option<String>,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub supports_media_control: bool,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub supports_remote_control: bool,
    #[serde(default)]
    pub now_playing_item: Option<MediaItem>,
    #[serde(default)]
    pub play_state: Option<RemotePlayState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "PascalCase")]
pub struct RemotePlayState {
    #[serde(default, deserialize_with = "optional_i64")]
    pub position_ticks: Option<i64>,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub is_paused: bool,
    #[serde(default, deserialize_with = "bool_or_default")]
    pub is_muted: bool,
    #[serde(default, deserialize_with = "optional_i32")]
    pub volume_level: Option<i32>,
    #[serde(default, deserialize_with = "optional_string")]
    pub play_method: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct PlaybackProgress {
    pub item_id: String,
    pub play_session_id: String,
    pub position_ticks: i64,
    pub is_paused: bool,
    pub play_method: String,
    pub volume_level: i32,
}
