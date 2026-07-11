#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickItem>
#include <QScreen>
#include <QTimer>
#include <QDebug>
#include <utility>
#include <QtQuickControls2/QQuickStyle>
#include <QSGRendererInterface>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QRegularExpression>
#include <QVariant>

#include <algorithm>
#include <clocale>
#include <cstdio>

#ifdef _WIN32
#include <windows.h>
#endif

#include "argv_options.h"
#include "mpv_object.h"
#include "control_channel.h"

#ifdef _WIN32
namespace {
// Crash diagnostics: on an access violation, write the FAULTING MODULE (DLL) + address
// to stderr so the host captures it in playback.log. This tells us which layer crashes
// (nvoglv64/atio6axx = GPU GL driver, d3d11, Qt6Quick, QWindowKit, libmpv-2, ...) — the
// resize 0xC0000005 otherwise leaves only an exit code. Diagnostic only; it logs then
// lets the process crash normally.
LONG WINAPI hillsCrashHandler(EXCEPTION_POINTERS *info) {
    if (info && info->ExceptionRecord &&
        info->ExceptionRecord->ExceptionCode == EXCEPTION_ACCESS_VIOLATION) {
        void *addr = info->ExceptionRecord->ExceptionAddress;
        HMODULE mod = nullptr;
        char name[MAX_PATH] = {0};
        if (GetModuleHandleExA(
                GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                    GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                reinterpret_cast<LPCSTR>(addr), &mod) &&
            mod) {
            GetModuleFileNameA(mod, name, MAX_PATH);
        }
        const uintptr_t base = reinterpret_cast<uintptr_t>(mod);
        const uintptr_t off = reinterpret_cast<uintptr_t>(addr) - base;
        std::fprintf(stderr,
                     "[crash] ACCESS_VIOLATION at %p in module '%s' (base+0x%llx)\n",
                     addr, name[0] ? name : "<unknown>",
                     static_cast<unsigned long long>(off));
        std::fflush(stderr);
    }
    return EXCEPTION_CONTINUE_SEARCH; // let it crash as usual
}
} // namespace
#endif

#ifdef HILLS_HAVE_QWINDOWKIT
#include <QWKQuick/quickwindowagent.h>
#endif

namespace {

// Load a danmaku overlay file (reference parity: HillsLite 在播放器内做弹幕覆层).
// Format: JSON array of {t:<seconds>, text:"", mode:"scroll|top|bottom", color:"#RRGGBB"}.
// The host (T9c) writes this from its dandanplay/XML danmaku data and passes
// `--danmaku-file=<path>`. Returns a position-sorted list for the QML overlay.
QVariantList loadDanmaku(const QString &path) {
    QVariantList out;
    if (path.isEmpty())
        return out;
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        return out;
    const QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
    if (!doc.isArray())
        return out;
    for (const QJsonValue &v : doc.array()) {
        if (!v.isObject())
            continue;
        const QJsonObject o = v.toObject();
        const QString text = o.value(QStringLiteral("text")).toString();
        if (text.isEmpty())
            continue;
        const QString mode = o.value(QStringLiteral("mode")).toString();
        const QString color = o.value(QStringLiteral("color")).toString();
        QVariantMap m;
        m[QStringLiteral("t")] = o.value(QStringLiteral("t")).toDouble();
        m[QStringLiteral("text")] = text;
        m[QStringLiteral("mode")] = mode.isEmpty() ? QStringLiteral("scroll") : mode;
        m[QStringLiteral("color")] = color.isEmpty() ? QStringLiteral("#FFFFFF") : color;
        out.push_back(m);
    }
    std::sort(out.begin(), out.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value(QStringLiteral("t")).toDouble()
             < b.toMap().value(QStringLiteral("t")).toDouble();
    });
    return out;
}

void applyLaunchOptions(MpvObject *mpv, const ArgvOptions &opt) {
    // mpv options must be set before loadfile.
    if (opt.startSeconds)
        mpv->setOption(QStringLiteral("start"),
                       QString::number(*opt.startSeconds, 'f', 3));
    if (opt.audioId)
        mpv->setOption(QStringLiteral("aid"), QString::number(*opt.audioId));
    if (opt.subId)
        mpv->setOption(QStringLiteral("sid"), QString::number(*opt.subId));
    if (opt.forceMediaTitle)
        mpv->setOption(QStringLiteral("force-media-title"), *opt.forceMediaTitle);
    if (opt.httpProxy)
        mpv->setOption(QStringLiteral("http-proxy"), *opt.httpProxy);
    if (opt.volume)
        mpv->setOption(QStringLiteral("volume"), QString::number(*opt.volume));
    for (const auto &kv : opt.extraMpvOptions)
        mpv->setOption(kv.first, kv.second);
    for (const QString &script : opt.scripts)
        mpv->command({QStringLiteral("load-script"), script});

    if (!opt.url.isEmpty())
        mpv->loadFile(opt.url);
    for (const QString &sub : opt.subFiles)
        mpv->addSubtitle(sub);
    if (!opt.anime4kPreset.isEmpty())
        mpv->setAnime4kPreset(opt.anime4kPreset);
}

void applyWindow(QQuickWindow *win, const ArgvOptions &opt) {
#ifdef HILLS_HAVE_QWINDOWKIT
    auto *agent = new QWK::QuickWindowAgent(win);
    agent->setup(win);
    // The QML top bar is the draggable title region; every interactive control
    // that lives inside it must be marked hit-test-visible, otherwise QWindowKit
    // treats clicks on it as window drags. Besides the min/max/close buttons this
    // also covers the back and pin buttons on the left/right of the title bar.
    if (auto *tb = win->findChild<QQuickItem *>(QStringLiteral("titleBar")))
        agent->setTitleBar(tb);
    // Register the title-bar buttons as hit-test-visible AFTER the event loop starts.
    // min/max/close live in a Repeater whose delegates don't exist yet when
    // applyWindow runs, so findChild returned null and QWK treated clicks on them as
    // title-bar drags (buttons visible but "unclickable" — only btnBack, a direct
    // child, worked). A 0ms timer defers registration until the delegates exist.
    QTimer::singleShot(0, win, [win, agent]() {
        // back/pin are app buttons (hit-test only); min/max/close are real window
        // system buttons — registering them via setSystemButton gives QWK proper
        // native hit-testing (setHitTestVisible alone left them unclickable).
        for (const QString &n : {QStringLiteral("btnBack"), QStringLiteral("btnPin")}) {
            if (auto *b = win->findChild<QQuickItem *>(n))
                agent->setHitTestVisible(b, true);
        }
        const std::pair<const char *, QWK::WindowAgentBase::SystemButton> sys[] = {
            {"btnMin", QWK::WindowAgentBase::Minimize},
            {"btnMax", QWK::WindowAgentBase::Maximize},
            {"btnClose", QWK::WindowAgentBase::Close},
        };
        for (const auto &entry : sys) {
            if (auto *b = win->findChild<QQuickItem *>(QString::fromUtf8(entry.first)))
                agent->setSystemButton(entry.second, b);
        }
    });
#endif
    // Place the window on the target monitor (from --geometry's origin = the host
    // app's monitor) before maximizing/fullscreening, so it lands on the same screen
    // as the host, not the default/primary one (multi-monitor → otherwise the host
    // stayed visible on its own monitor = "two windows").
    auto placeOnTargetScreen = [&]() {
        if (!opt.geometry)
            return;
        static const QRegularExpression geo(
            QStringLiteral("\\+(-?\\d+)\\+(-?\\d+)$"));
        const QRegularExpressionMatch gm = geo.match(*opt.geometry);
        if (gm.hasMatch()) {
            const QPoint pos(gm.captured(1).toInt(), gm.captured(2).toInt());
            if (QScreen *scr = QGuiApplication::screenAt(pos))
                win->setScreen(scr);
            win->setPosition(pos);
        }
    };
    if (opt.fullscreen) {
        placeOnTargetScreen();
        win->showFullScreen();
        return;
    }
    if (opt.maximize) {
        placeOnTargetScreen();
        win->showMaximized();
        return;
    }
    if (opt.geometry) {
        static const QRegularExpression re(
            QStringLiteral("^(\\d+)x(\\d+)(?:\\+(-?\\d+)\\+(-?\\d+))?$"));
        const QRegularExpressionMatch m = re.match(*opt.geometry);
        if (m.hasMatch()) {
            const int w = m.captured(1).toInt();
            const int h = m.captured(2).toInt();
            win->resize(w, h);
            if (!m.captured(3).isEmpty())
                win->setPosition(m.captured(3).toInt(), m.captured(4).toInt());
        }
    }
    win->show();
}

void dispatchControl(MpvObject *mpv, QGuiApplication *app, const QString &line) {
    const QJsonDocument doc = QJsonDocument::fromJson(line.toUtf8());
    if (!doc.isObject())
        return;
    const QJsonObject o = doc.object();
    const QString action = o.value(QStringLiteral("action")).toString();

    if (action == QLatin1String("loadfile") || action == QLatin1String("load")) {
        mpv->loadFile(o.value(QStringLiteral("url")).toString());
    } else if (action == QLatin1String("play")) {
        mpv->play();
    } else if (action == QLatin1String("pause")) {
        mpv->pause();
    } else if (action == QLatin1String("toggle-pause")) {
        mpv->togglePause();
    } else if (action == QLatin1String("stop")) {
        mpv->stop();
    } else if (action == QLatin1String("seek")) {
        const double v = o.value(QStringLiteral("value")).toDouble();
        if (o.value(QStringLiteral("mode")).toString() == QLatin1String("relative"))
            mpv->seekRelative(v);
        else
            mpv->seekAbsolute(v);
    } else if (action == QLatin1String("set-audio")) {
        mpv->setAudioId(static_cast<qint64>(o.value(QStringLiteral("id")).toDouble()));
    } else if (action == QLatin1String("set-sub")) {
        mpv->setSubId(static_cast<qint64>(o.value(QStringLiteral("id")).toDouble()));
    } else if (action == QLatin1String("add-sub")) {
        mpv->addSubtitle(o.value(QStringLiteral("path")).toString());
    } else if (action == QLatin1String("set-property")) {
        mpv->setProperty(o.value(QStringLiteral("name")).toString(),
                         o.value(QStringLiteral("value")).toVariant());
    } else if (action == QLatin1String("set-speed")) {
        mpv->setSpeed(o.value(QStringLiteral("value")).toDouble());
    } else if (action == QLatin1String("set-volume")) {
        mpv->setVolume(o.value(QStringLiteral("value")).toInt());
    } else if (action == QLatin1String("anime4k")) {
        mpv->setAnime4kPreset(o.value(QStringLiteral("preset")).toString());
    } else if (action == QLatin1String("command")) {
        QStringList args;
        for (const QJsonValue &v : o.value(QStringLiteral("args")).toArray())
            args << v.toString();
        if (!args.isEmpty())
            mpv->command(args);
    } else if (action == QLatin1String("show-panel")) {
        // Host pushed a selection panel (episodes / versions / quality). Forward
        // the whole panel object to QML via MpvObject's hostPanelRequested signal.
        mpv->showHostPanel(o.value(QStringLiteral("panel")).toObject().toVariantMap());
    } else if (action == QLatin1String("quit")) {
        app->quit();
    }
}

} // namespace

int main(int argc, char *argv[]) {
    std::setlocale(LC_NUMERIC, "C");
#ifdef _WIN32
    AddVectoredExceptionHandler(1, hillsCrashHandler);
#endif
    // mpv render API integration uses a Qt Quick FBO → force the OpenGL RHI.
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);

    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName(QStringLiteral("hills-player"));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    const ArgvOptions opt = ArgvOptions::parse(app.arguments().mid(1));

    QQmlApplicationEngine engine;
    // Danmaku overlay data (reference parity). Must be set before the module
    // loads so Main.qml sees it at construction.
    const QVariantList danmaku = loadDanmaku(opt.danmakuFile);
    engine.rootContext()->setContextProperty("hillsDanmaku", danmaku);
    engine.rootContext()->setContextProperty("hillsDanmakuEnabled", !danmaku.isEmpty());
    engine.loadFromModule("HillsPlayer", "Main");
    if (engine.rootObjects().isEmpty()) {
        return -1;
    }

    auto *win = qobject_cast<QQuickWindow *>(engine.rootObjects().constFirst());
    MpvObject *mpv = win ? win->findChild<MpvObject *>() : nullptr;
    if (!mpv) {
        qWarning("hills-player: MpvObject not found in QML root");
        return -2;
    }

    applyLaunchOptions(mpv, opt);
    if (win) {
        applyWindow(win, opt);
    }

    ControlChannel control;
    if (opt.stdinControl) {
        QObject::connect(&control, &ControlChannel::lineReceived, &app,
                         [mpv, &app](const QString &line) {
                             dispatchControl(mpv, &app, line);
                         });
        QObject::connect(&control, &ControlChannel::eof, &app,
                         [&app]() { app.quit(); });
        control.start();
    }

    return app.exec();
}
