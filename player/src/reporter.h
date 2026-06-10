#pragma once

#include <QString>
#include <QJsonObject>

// Emits newline-delimited `HILLS_MPV_EVENT:{json}` events on stdout.
//
// The wire format is identical to HillsLite's hills_external_reporter.lua and to
// emby-player's Rust parser (crate::mpv::backend::parse_reporter_event):
//   HILLS_MPV_EVENT:{"event":"file-loaded","time_pos":12.5, ...}
// so the existing host bridge (ExternalPlaybackReporter / run_external_reporter)
// consumes this player's output unchanged. Only `event` + the fields below are
// significant to the host; extra fields are ignored by the parser.
class Reporter {
public:
    static constexpr const char *kPrefix = "HILLS_MPV_EVENT:";

    void startFile(qint64 playlistPos = -1);
    void fileLoaded(double timePos, const QString &mediaTitle, const QString &path,
                    qint64 playlistPos = -1);
    void seek(double timePos, qint64 playlistPos = -1);
    void endFile(const QString &reason, double timePos, qint64 playlistPos = -1);
    void timePos(double timePos, qint64 playlistPos = -1);
    void pause(bool paused, qint64 playlistPos = -1);
    void speed(double speed, qint64 playlistPos = -1);
    // UI intents the player window delegates to the host (versions, episodes,
    // danmaku settings, ...). Hosts that don't understand the event ignore it.
    void uiAction(const QString &action);

private:
    void emitEvent(const char *event, QJsonObject body);
};
