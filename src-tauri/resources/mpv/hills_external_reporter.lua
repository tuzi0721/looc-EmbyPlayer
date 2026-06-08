-- Hills Lite external mpv progress reporter.
--
-- Ported from HillsLite (data/flutter_assets/assets/scripts/hills_external_reporter.lua).
-- mpv loads this via `--script=<path>` when Hills Lite launches an external mpv
-- process. It writes newline-delimited JSON events to stdout, each prefixed with
-- `HILLS_MPV_EVENT:` so the host can distinguish them from mpv's own log output.
-- The Rust/Electron host parses these events and maps them onto Emby session
-- progress / pause / stop reporting (see src-tauri/src/emby/session_controller.rs).

local mp = require "mp"
local utils = require "mp.utils"

local prefix = "HILLS_MPV_EVENT:"

local function emit(event_name, payload)
    local body = payload or {}
    body["event"] = event_name
    local json = utils.format_json(body)
    if json == nil then
        return
    end
    io.stdout:write(prefix .. json .. "\n")
    io.stdout:flush()
end

local function read_playlist_pos()
    local pos = mp.get_property_number("playlist-pos", -1)
    if pos == nil or pos < 0 then
        pos = mp.get_property_number("playlist-playing-pos", -1)
    end
    return pos
end

mp.register_event("start-file", function(event)
    emit("start-file", {
        playlist_entry_id = event.playlist_entry_id,
        playlist_pos = mp.get_property_number("playlist-playing-pos", read_playlist_pos())
    })
end)

mp.register_event("file-loaded", function()
    emit("file-loaded", {
        playlist_pos = read_playlist_pos(),
        time_pos = mp.get_property_number("time-pos", 0),
        media_title = mp.get_property("media-title", ""),
        path = mp.get_property("path", "")
    })
end)

mp.register_event("seek", function()
    emit("seek", {
        playlist_pos = read_playlist_pos(),
        time_pos = mp.get_property_number("time-pos", 0)
    })
end)

mp.register_event("end-file", function(event)
    emit("end-file", {
        playlist_entry_id = event.playlist_entry_id,
        playlist_pos = mp.get_property_number("playlist-playing-pos", read_playlist_pos()),
        reason = event.reason,
        time_pos = mp.get_property_number("time-pos", 0)
    })
end)

mp.observe_property("time-pos", "native", function(_, value)
    if value == nil then
        return
    end
    emit("time-pos", {
        playlist_pos = read_playlist_pos(),
        time_pos = value
    })
end)

mp.observe_property("pause", "bool", function(_, value)
    if value == nil then
        return
    end
    emit("pause", {
        playlist_pos = read_playlist_pos(),
        paused = value
    })
end)

mp.observe_property("speed", "native", function(_, value)
    if value == nil then
        return
    end
    emit("speed", {
        playlist_pos = read_playlist_pos(),
        speed = value
    })
end)
