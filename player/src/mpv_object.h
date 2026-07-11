#pragma once

#include <QtQuick/QQuickFramebufferObject>
#include <QtQml/qqmlregistration.h>
#include <QVariant>
#include <QStringList>
#include <QTimer>

#include <atomic>

#include <mpv/client.h>
#include <mpv/render_gl.h>

#include "reporter.h"
#include "anime4k.h"

// libmpv rendered into a Qt Quick scene-graph FBO via the mpv render API
// (MPV_RENDER_API_TYPE_OPENGL). This is the same integration HillsLite's
// HillsPlayer uses (render API + QML overlay) and the canonical
// mpv-examples/qml pattern. The video is a normal QML item, so HTML/QML
// controls (T9b) overlay it with no native child window, no dead zones, no
// rect/DPI sync, and no pointer swallowing — exactly what the P0 validation
// concluded the WebView2 stack could not do.
//
// Rendering uses vo=libmpv (gpu/gpu-next renderer internally) with hwdec and
// target-colorspace-hint for HDR. Local-decode only; no transcode.
class MpvObject : public QQuickFramebufferObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(double duration READ duration NOTIFY durationChanged)
    Q_PROPERTY(double position READ position NOTIFY positionChanged)
    Q_PROPERTY(bool paused READ paused NOTIFY pausedChanged)
    Q_PROPERTY(double speed READ speed NOTIFY speedChanged)
    Q_PROPERTY(bool muted READ muted NOTIFY mutedChanged)
    Q_PROPERTY(bool buffering READ buffering NOTIFY bufferingChanged)
    Q_PROPERTY(Anime4K *anime4k READ anime4k CONSTANT)

public:
    explicit MpvObject(QQuickItem *parent = nullptr);
    ~MpvObject() override;

    Renderer *createRenderer() const override;

    mpv_handle *handle() const { return m_mpv; }
    Anime4K *anime4k() const { return m_anime4k; }

    double duration() const { return m_duration; }
    double position() const { return m_position; }
    bool paused() const { return m_paused; }
    double speed() const { return m_speed; }
    bool muted() const { return m_muted; }
    bool buffering() const { return m_buffering; }

    // ── Control surface (argv bootstrap, QML UI T9b, and the stdin control
    // channel T9c all drive these) ──────────────────────────────────────────
    Q_INVOKABLE void loadFile(const QString &url);
    Q_INVOKABLE void command(const QStringList &args);
    Q_INVOKABLE void setOption(const QString &name, const QString &value);
    Q_INVOKABLE void setProperty(const QString &name, const QVariant &value);
    // Generic property read for the QML UI (track-list, media-title,
    // cache-speed, ...). mpv node -> QVariant, the canonical mpv-examples/qml
    // pattern; returns an invalid QVariant when unavailable.
    Q_INVOKABLE QVariant getProperty(const QString &name) const;
    // Forward a UI intent the standalone window cannot satisfy itself
    // (versions / episodes / quality / danmaku settings ...) to the host via the
    // stdout reporter as {"event":"ui-action","action":...,"data":{...}}. The
    // optional `data` map carries a structured payload (e.g. a panel selection's
    // kind + key). Unknown events are ignored by the host parser, so this is
    // forward-compatible.
    Q_INVOKABLE void uiAction(const QString &action,
                              const QVariant &data = QVariant());
    // Host → player: render a selection panel (episodes / versions / quality).
    // The host gathers the list (it owns the Emby session) and pushes it over the
    // stdin control channel; dispatchControl forwards it here and QML renders it.
    // `panel` is a map {kind, title, entries:[{key,label,sublabel,checked}]}.
    Q_INVOKABLE void showHostPanel(const QVariant &panel);
    Q_INVOKABLE void play();
    Q_INVOKABLE void pause();
    Q_INVOKABLE void togglePause();
    Q_INVOKABLE void stop();
    Q_INVOKABLE void seekAbsolute(double seconds);
    Q_INVOKABLE void seekRelative(double seconds);
    Q_INVOKABLE void setAudioId(qint64 id);
    Q_INVOKABLE void setSubId(qint64 id);
    Q_INVOKABLE void addSubtitle(const QString &path);
    Q_INVOKABLE void setSpeed(double speed);
    Q_INVOKABLE void setVolume(int volume);
    Q_INVOKABLE void setAnime4kPreset(const QString &preset);

protected:
    // Pause mpv rendering while the window is actively resized. Rendering into
    // the FBO mid-resize faulted (0xC0000005) inside the GPU driver's shader
    // JIT; we flag the resize, let render() skip until the size settles, then
    // resume. Cost: a brief freeze/black while dragging, restored on release.
    void geometryChange(const QRectF &newGeometry,
                        const QRectF &oldGeometry) override;

signals:
    void durationChanged();
    void positionChanged();
    void pausedChanged();
    void speedChanged();
    void mutedChanged();
    void bufferingChanged();
    void fileLoaded();
    void endFile(const QString &reason);
    // Host pushed a selection panel (episodes / versions / quality) for QML to
    // render. `panel` is a QVariantMap (see showHostPanel).
    void hostPanelRequested(const QVariant &panel);
    void onUpdate(); // emitted from the mpv render thread; queued to update()

private slots:
    void doUpdate();      // QQuickFramebufferObject::update() on the GUI thread
    void onMpvEvents();   // drain mpv event queue on the GUI thread

private:
    void initMpv();
    void handlePropertyChange(mpv_event_property *prop);
    void emitTimePosThrottled(double pos);

    mpv_handle *m_mpv = nullptr;
    Reporter m_reporter;
    Anime4K *m_anime4k = nullptr;

    double m_duration = 0.0;
    double m_position = 0.0;
    bool m_paused = false;
    double m_speed = 1.0;
    bool m_muted = false;
    bool m_buffering = false;
    qint64 m_lastTimePosEmitMs = 0;

    // Read on the render thread, written on the GUI thread → atomic.
    std::atomic<bool> m_resizing{false};
    QTimer *m_resizeSettleTimer = nullptr;

    friend class MpvRenderer;
};
