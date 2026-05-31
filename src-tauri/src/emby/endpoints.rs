use url::Url;

use crate::error::{AppError, AppResult};

pub fn join(base: &str, path: &str) -> AppResult<Url> {
    let mut url = Url::parse(base)?;
    if !url.path().ends_with('/') {
        let p = format!("{}/", url.path());
        url.set_path(&p);
    }
    url.join(path.trim_start_matches('/'))
        .map_err(AppError::from)
}

pub fn authenticate_by_name() -> &'static str {
    "Users/AuthenticateByName"
}

pub fn system_info_public() -> &'static str {
    "System/Info/Public"
}

pub fn user_views(user_id: &str) -> String {
    format!("Users/{user_id}/Views")
}

pub fn user_items(user_id: &str) -> String {
    format!("Users/{user_id}/Items")
}

pub fn user_item(user_id: &str, item_id: &str) -> String {
    format!("Users/{user_id}/Items/{item_id}")
}

pub fn user_favorite_item(user_id: &str, item_id: &str) -> String {
    format!("Users/{user_id}/FavoriteItems/{item_id}")
}

pub fn user_played_item(user_id: &str, item_id: &str) -> String {
    format!("Users/{user_id}/PlayedItems/{item_id}")
}

pub fn resume_items(user_id: &str) -> String {
    format!("Users/{user_id}/Items/Resume")
}

pub fn playback_info(item_id: &str) -> String {
    format!("Items/{item_id}/PlaybackInfo")
}

pub fn playing_progress() -> &'static str {
    "Sessions/Playing/Progress"
}

pub fn playing_stopped() -> &'static str {
    "Sessions/Playing/Stopped"
}

pub fn sessions_self() -> &'static str {
    "Sessions"
}

#[allow(dead_code)]
pub fn image(item_id: &str, image_type: &str) -> String {
    format!("Items/{item_id}/Images/{image_type}")
}

pub fn show_seasons(series_id: &str) -> String {
    format!("Shows/{series_id}/Seasons")
}

pub fn show_episodes(series_id: &str) -> String {
    format!("Shows/{series_id}/Episodes")
}

#[allow(dead_code)]
pub fn next_up() -> &'static str {
    "Shows/NextUp"
}

#[allow(dead_code)]
pub fn latest(user_id: &str) -> String {
    format!("Users/{user_id}/Items/Latest")
}

#[allow(dead_code)]
pub fn similar_items(item_id: &str) -> String {
    format!("Items/{item_id}/Similar")
}

pub fn special_features(user_id: &str, item_id: &str) -> String {
    format!("Users/{user_id}/Items/{item_id}/SpecialFeatures")
}

/// Direct subtitle stream URL (Emby/Jellyfin):
/// `Videos/{itemId}/{mediaSourceId}/Subtitles/{streamIndex}/Stream.{fmt}`
pub fn subtitle_stream(item_id: &str, media_source_id: &str, index: i32, fmt: &str) -> String {
    format!("Videos/{item_id}/{media_source_id}/Subtitles/{index}/Stream.{fmt}")
}
