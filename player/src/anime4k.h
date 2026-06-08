#pragma once

#include <QObject>
#include <QtQml/qqmlregistration.h>
#include <QString>
#include <QStringList>
#include <QMap>

// Anime4K v4 preset → GLSL shader-chain resolver.
//
// Maps the official Anime4K v4 "Mode" presets to their ordered glsl-shaders
// file lists, resolved against the shader directory shipped next to the exe
// (player/shaders/anime4k/, install → bin/shaders/anime4k/). The actual shader
// application (mpv `change-list glsl-shaders ...`) is performed by MpvObject;
// this class only owns the preset taxonomy + file resolution so the T9b UI can
// drive it via a stable interface.
//
// Hard constraint: Anime4K is pure-GPU post-processing and does not affect the
// local-decode-only / no-transcode guarantee.
class Anime4K : public QObject {
    Q_OBJECT
    QML_ANONYMOUS
    Q_PROPERTY(QStringList presets READ presets CONSTANT)
    Q_PROPERTY(QString preset READ preset NOTIFY presetChanged)

public:
    explicit Anime4K(QObject *parent = nullptr);

    void setShaderDir(const QString &dir);

    QStringList presets() const;            // selectable preset names (incl. "Off")
    QString preset() const { return m_preset; }

    // Ordered absolute shader paths for a preset ("Off" → empty). Missing files
    // are skipped (and logged) so a partial shader drop degrades gracefully.
    QStringList shadersForPreset(const QString &preset) const;

    // Record the active preset (MpvObject calls this after applying the chain).
    void setActivePreset(const QString &preset);

signals:
    void presetChanged(const QString &preset);

private:
    QString m_shaderDir;
    QString m_preset = QStringLiteral("Off");

    // preset name → ordered list of shader file names (official Anime4K v4).
    static const QMap<QString, QStringList> &chains();
};
