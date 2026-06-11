#pragma once

#include <QString>
#include <QStringList>
#include <QVector>
#include <QPair>
#include <optional>

// Parsed command-line contract for hills-player. The Tauri/Electron host (T9c)
// launches the player with mpv-style argv; anything not handled explicitly is
// forwarded verbatim to libmpv as a `key=value` option.
struct ArgvOptions {
    QString url;                                   // positional stream / file URL
    std::optional<double> startSeconds;            // --start=<sec> (resume)
    std::optional<qint64> audioId;                 // --aid
    std::optional<qint64> subId;                   // --sid
    QStringList subFiles;                          // --sub-file (repeatable)
    std::optional<QString> forceMediaTitle;        // --force-media-title
    std::optional<QString> httpProxy;              // --http-proxy
    std::optional<int> volume;                     // --volume (0..200)
    QStringList scripts;                           // --script (repeatable)

    // Window control (handled by the shell/QWindowKit, not libmpv).
    std::optional<QString> geometry;               // --geometry=WxH+X+Y
    bool maximize = false;                         // --maximize
    bool fullscreen = false;                       // --fullscreen
    std::optional<QString> forceWindow;            // --force-window=yes|no|immediate

    QString anime4kPreset;                         // --anime4k=<preset>
    bool stdinControl = false;                      // --stdin-control (opt-in IPC)
    QString danmakuFile;                            // --danmaku-file=<json> (overlay)

    // Any other `--key=value` / `--key value` passthrough to libmpv.
    QVector<QPair<QString, QString>> extraMpvOptions;

    static ArgvOptions parse(const QStringList &args);

    // Parse mpv-style start values: plain seconds or hh:mm:ss / mm:ss.
    static double parseStart(const QString &value);
};
