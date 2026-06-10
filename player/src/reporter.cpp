#include "reporter.h"

#include <QJsonDocument>
#include <cstdio>

void Reporter::emitEvent(const char *event, QJsonObject body) {
    body.insert(QStringLiteral("event"), QString::fromUtf8(event));
    const QByteArray json =
        QJsonDocument(body).toJson(QJsonDocument::Compact);
    // Write directly to the C stdout and flush so the host sees one line per
    // event immediately (Qt's qInfo/QTextStream would buffer/relocate output).
    std::fputs(kPrefix, stdout);
    std::fwrite(json.constData(), 1, static_cast<size_t>(json.size()), stdout);
    std::fputc('\n', stdout);
    std::fflush(stdout);
}

void Reporter::startFile(qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    emitEvent("start-file", body);
}

void Reporter::fileLoaded(double timePos, const QString &mediaTitle,
                          const QString &path, qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    body.insert(QStringLiteral("time_pos"), timePos);
    body.insert(QStringLiteral("media_title"), mediaTitle);
    body.insert(QStringLiteral("path"), path);
    emitEvent("file-loaded", body);
}

void Reporter::seek(double timePos, qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    body.insert(QStringLiteral("time_pos"), timePos);
    emitEvent("seek", body);
}

void Reporter::endFile(const QString &reason, double timePos, qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    body.insert(QStringLiteral("reason"), reason);
    body.insert(QStringLiteral("time_pos"), timePos);
    emitEvent("end-file", body);
}

void Reporter::timePos(double timePos, qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    body.insert(QStringLiteral("time_pos"), timePos);
    emitEvent("time-pos", body);
}

void Reporter::pause(bool paused, qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    body.insert(QStringLiteral("paused"), paused);
    emitEvent("pause", body);
}

void Reporter::speed(double speed, qint64 playlistPos) {
    QJsonObject body;
    body.insert(QStringLiteral("playlist_pos"), static_cast<double>(playlistPos));
    body.insert(QStringLiteral("speed"), speed);
    emitEvent("speed", body);
}

void Reporter::uiAction(const QString &action) {
    QJsonObject body;
    body.insert(QStringLiteral("action"), action);
    emitEvent("ui-action", body);
}
