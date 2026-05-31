use crate::danmaku::types::{DanmakuComment, DanmakuMode, DanmakuResult};

pub fn parse_danmaku_xml(text: &str, episode_id: String) -> DanmakuResult {
    let mut comments = Vec::new();
    let mut cursor = text;

    while let Some(start) = cursor.find("<d") {
        cursor = &cursor[start + 2..];
        let Some(tag_end) = cursor.find('>') else {
            break;
        };
        let tag = &cursor[..tag_end];
        let body = &cursor[tag_end + 1..];
        let Some(end) = body.find("</d>") else {
            break;
        };
        let raw_text = &body[..end];
        if let Some(p) = attr_value(tag, "p") {
            if let Some(comment) = parse_comment(&p, raw_text) {
                comments.push(comment);
            }
        }
        cursor = &body[end + 4..];
    }

    DanmakuResult {
        provider: "xml".into(),
        episode_id,
        comments,
    }
}

fn attr_value(tag: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=");
    let start = tag.find(&needle)? + needle.len();
    let mut chars = tag[start..].chars();
    let quote = chars.next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let rest = &tag[start + quote.len_utf8()..];
    let end = rest.find(quote)?;
    Some(rest[..end].to_string())
}

fn parse_comment(p: &str, text: &str) -> Option<DanmakuComment> {
    let parts = p.split(',').collect::<Vec<_>>();
    if parts.len() < 3 {
        return None;
    }
    let time = parts[0].parse::<f64>().ok()?;
    let text = decode_xml_entities(text).trim().to_string();
    if text.is_empty() {
        return None;
    }
    let color_part = parts.get(3).copied().or_else(|| parts.get(2).copied())?;
    Some(DanmakuComment {
        time,
        mode: parse_mode(parts[1]),
        color: parse_color(color_part),
        text,
        source: Some("xml".into()),
    })
}

fn parse_mode(value: &str) -> DanmakuMode {
    match value.parse::<i32>().unwrap_or(1) {
        4 => DanmakuMode::Bottom,
        5 => DanmakuMode::Top,
        6 => DanmakuMode::Reverse,
        _ => DanmakuMode::Scroll,
    }
}

fn parse_color(value: &str) -> String {
    let color = value.parse::<i64>().unwrap_or(0x00ff_ffff);
    let r = ((color >> 16) & 0xff) as u8;
    let g = ((color >> 8) & 0xff) as u8;
    let b = (color & 0xff) as u8;
    format!("#{r:02x}{g:02x}{b:02x}")
}

fn decode_xml_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}
