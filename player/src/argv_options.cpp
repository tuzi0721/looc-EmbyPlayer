#include "argv_options.h"

namespace {

// Split "--key=value" / "--key" into (key, hasInlineValue, value).
struct Flag {
    QString key;
    bool hasValue = false;
    QString value;
};

Flag splitFlag(const QString &arg) {
    Flag f;
    QString body = arg;
    while (body.startsWith('-')) {
        body.remove(0, 1);
    }
    const int eq = body.indexOf('=');
    if (eq >= 0) {
        f.key = body.left(eq);
        f.value = body.mid(eq + 1);
        f.hasValue = true;
    } else {
        f.key = body;
    }
    return f;
}

bool isFlag(const QString &arg) {
    return arg.startsWith("--") || (arg.startsWith('-') && arg.size() > 1 && !arg.at(1).isDigit());
}

} // namespace

ArgvOptions ArgvOptions::parse(const QStringList &args) {
    ArgvOptions out;

    for (int i = 0; i < args.size(); ++i) {
        const QString &arg = args.at(i);
        if (!isFlag(arg)) {
            if (out.url.isEmpty()) {
                out.url = arg; // first positional is the media URL
            }
            continue;
        }

        Flag f = splitFlag(arg);
        // Boolean flags consume no following token.
        if (f.key == "maximize") { out.maximize = true; continue; }
        if (f.key == "fullscreen" || f.key == "fs") { out.fullscreen = true; continue; }
        if (f.key == "stdin-control" || f.key == "ipc-stdin") { out.stdinControl = true; continue; }

        // Resolve the value: inline (--k=v) or the next non-flag token (--k v).
        auto takeValue = [&](bool &ok) -> QString {
            if (f.hasValue) { ok = true; return f.value; }
            if (i + 1 < args.size() && !isFlag(args.at(i + 1))) {
                ok = true;
                return args.at(++i);
            }
            ok = false;
            return {};
        };

        bool ok = false;
        const QString value = takeValue(ok);

        if (f.key == "start") {
            if (ok) out.startSeconds = parseStart(value);
        } else if (f.key == "aid") {
            if (ok) out.audioId = value.toLongLong();
        } else if (f.key == "sid") {
            if (ok) out.subId = value.toLongLong();
        } else if (f.key == "sub-file" || f.key == "sub-files") {
            if (ok) out.subFiles << value;
        } else if (f.key == "force-media-title") {
            if (ok) out.forceMediaTitle = value;
        } else if (f.key == "http-proxy") {
            if (ok) out.httpProxy = value;
        } else if (f.key == "volume") {
            if (ok) out.volume = value.toInt();
        } else if (f.key == "script") {
            if (ok) out.scripts << value;
        } else if (f.key == "geometry") {
            if (ok) out.geometry = value;
        } else if (f.key == "force-window") {
            out.forceWindow = ok ? value : QStringLiteral("yes");
        } else if (f.key == "anime4k" || f.key == "anime4k-preset") {
            if (ok) out.anime4kPreset = value;
        } else if (f.key == "danmaku-file") {
            if (ok) out.danmakuFile = value;
        } else if (!f.key.isEmpty()) {
            // Unknown flag → forward to libmpv as key=value (value may be empty
            // for boolean mpv options, which libmpv treats as "yes").
            out.extraMpvOptions.push_back({f.key, ok ? value : QStringLiteral("yes")});
        }
    }

    return out;
}

double ArgvOptions::parseStart(const QString &value) {
    // Accept plain seconds ("123.4") or mpv's hh:mm:ss / mm:ss form.
    if (!value.contains(':')) {
        return value.toDouble();
    }
    const QStringList parts = value.split(':');
    double seconds = 0.0;
    for (const QString &part : parts) {
        seconds = seconds * 60.0 + part.toDouble();
    }
    return seconds;
}
