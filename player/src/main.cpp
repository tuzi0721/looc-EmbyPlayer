#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QQuickItem>
#include <QtQuickControls2/QQuickStyle>
#include <QSGRendererInterface>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QRegularExpression>

#include <clocale>

#include "argv_options.h"
#include "mpv_object.h"
#include "control_channel.h"

#ifdef HILLS_HAVE_QWINDOWKIT
#include <QWKQuick/quickwindowagent.h>
#endif

namespace {

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
    // The QML top bar is the draggable title region; window-control buttons are
    // marked hit-test-visible so clicks reach them instead of dragging the window.
    if (auto *tb = win->findChild<QQuickItem *>(QStringLiteral("titleBar")))
        agent->setTitleBar(tb);
    for (const QString &n : {QStringLiteral("btnMin"), QStringLiteral("btnMax"),
                             QStringLiteral("btnClose")}) {
        if (auto *b = win->findChild<QQuickItem *>(n))
            agent->setHitTestVisible(b, true);
    }
#endif
    if (opt.fullscreen) {
        win->showFullScreen();
        return;
    }
    if (opt.maximize) {
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
    } else if (action == QLatin1String("quit")) {
        app->quit();
    }
}

} // namespace

int main(int argc, char *argv[]) {
    std::setlocale(LC_NUMERIC, "C");
    // mpv render API integration uses a Qt Quick FBO → force the OpenGL RHI.
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);

    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName(QStringLiteral("hills-player"));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    const ArgvOptions opt = ArgvOptions::parse(app.arguments().mid(1));

    QQmlApplicationEngine engine;
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
