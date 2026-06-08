#include "mpv_object.h"

#include <QtGui/QOpenGLContext>
#include <QtOpenGL/QOpenGLFramebufferObject>
#include <QtOpenGL/QOpenGLFramebufferObjectFormat>
#include <QtQuick/QQuickWindow>
#include <QtCore/QByteArray>
#include <QtCore/QDateTime>
#include <QtCore/QVector>

#include <clocale>

namespace {

void *getProcAddress(void *ctx, const char *name) {
    Q_UNUSED(ctx);
    QOpenGLContext *glctx = QOpenGLContext::currentContext();
    if (!glctx) {
        return nullptr;
    }
    return reinterpret_cast<void *>(glctx->getProcAddress(QByteArray(name)));
}

const char *endReasonName(int reason) {
    switch (reason) {
    case MPV_END_FILE_REASON_EOF: return "eof";
    case MPV_END_FILE_REASON_STOP: return "stop";
    case MPV_END_FILE_REASON_QUIT: return "quit";
    case MPV_END_FILE_REASON_ERROR: return "error";
    case MPV_END_FILE_REASON_REDIRECT: return "redirect";
    default: return "unknown";
    }
}

double getDouble(mpv_handle *mpv, const char *name) {
    double v = 0.0;
    if (mpv_get_property(mpv, name, MPV_FORMAT_DOUBLE, &v) < 0) {
        return 0.0;
    }
    return v;
}

QString getString(mpv_handle *mpv, const char *name) {
    char *s = nullptr;
    if (mpv_get_property(mpv, name, MPV_FORMAT_STRING, &s) < 0 || !s) {
        return {};
    }
    const QString out = QString::fromUtf8(s);
    mpv_free(s);
    return out;
}

} // namespace

// ── Render thread side ──────────────────────────────────────────────────────
class MpvRenderer : public QQuickFramebufferObject::Renderer {
public:
    explicit MpvRenderer(MpvObject *obj) : m_obj(obj) {}

    ~MpvRenderer() override {
        if (m_mpvGl) {
            mpv_render_context_free(m_mpvGl);
            m_mpvGl = nullptr;
        }
    }

    QOpenGLFramebufferObject *createFramebufferObject(const QSize &size) override {
        if (!m_mpvGl) {
            mpv_opengl_init_params gl_init{getProcAddress, nullptr};
            mpv_render_param params[]{
                {MPV_RENDER_PARAM_API_TYPE,
                 const_cast<char *>(MPV_RENDER_API_TYPE_OPENGL)},
                {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl_init},
                {MPV_RENDER_PARAM_INVALID, nullptr},
            };
            if (mpv_render_context_create(&m_mpvGl, m_obj->m_mpv, params) >= 0) {
                mpv_render_context_set_update_callback(
                    m_mpvGl, &MpvRenderer::onMpvRenderUpdate, m_obj);
            }
        }
        QOpenGLFramebufferObjectFormat fmt;
        fmt.setAttachment(QOpenGLFramebufferObject::CombinedDepthStencil);
        return new QOpenGLFramebufferObject(size, fmt);
    }

    void render() override {
        if (!m_mpvGl) {
            return;
        }
        QOpenGLFramebufferObject *fbo = framebufferObject();
        mpv_opengl_fbo mpfbo{static_cast<int>(fbo->handle()), fbo->width(),
                             fbo->height(), 0};
        int flip_y = 1;
        mpv_render_param params[]{
            {MPV_RENDER_PARAM_OPENGL_FBO, &mpfbo},
            {MPV_RENDER_PARAM_FLIP_Y, &flip_y},
            {MPV_RENDER_PARAM_INVALID, nullptr},
        };
        mpv_render_context_render(m_mpvGl, params);
    }

    static void onMpvRenderUpdate(void *ctx) {
        // Called from libmpv's render thread; bounce to the GUI thread to call
        // QQuickFramebufferObject::update() via the queued onUpdate signal.
        auto *obj = static_cast<MpvObject *>(ctx);
        emit obj->onUpdate();
    }

private:
    MpvObject *m_obj = nullptr;
    mpv_render_context *m_mpvGl = nullptr;
};

// ── GUI thread side ─────────────────────────────────────────────────────────
namespace {
void wakeup(void *ctx) {
    QMetaObject::invokeMethod(static_cast<MpvObject *>(ctx), "onMpvEvents",
                              Qt::QueuedConnection);
}
} // namespace

MpvObject::MpvObject(QQuickItem *parent)
    : QQuickFramebufferObject(parent), m_anime4k(new Anime4K(this)) {
    initMpv();
    connect(this, &MpvObject::onUpdate, this, &MpvObject::doUpdate,
            Qt::QueuedConnection);
}

MpvObject::~MpvObject() {
    if (m_mpv) {
        mpv_terminate_destroy(m_mpv);
        m_mpv = nullptr;
    }
}

void MpvObject::initMpv() {
    std::setlocale(LC_NUMERIC, "C"); // libmpv requires the C numeric locale.
    m_mpv = mpv_create();
    if (!m_mpv) {
        qFatal("could not create mpv context");
    }

    // Local-decode-only, render-API output, no server transcode.
    mpv_set_option_string(m_mpv, "config", "no");
    mpv_set_option_string(m_mpv, "ytdl", "no");
    mpv_set_option_string(m_mpv, "terminal", "no");
    mpv_set_option_string(m_mpv, "osc", "no");
    mpv_set_option_string(m_mpv, "input-default-bindings", "no");
    mpv_set_option_string(m_mpv, "idle", "yes");
    mpv_set_option_string(m_mpv, "keep-open", "yes");
    mpv_set_option_string(m_mpv, "force-window", "no");
    mpv_set_option_string(m_mpv, "vo", "libmpv");
    mpv_set_option_string(m_mpv, "hwdec", "auto-safe");
    mpv_set_option_string(m_mpv, "gpu-api", "auto");
    mpv_set_option_string(m_mpv, "sub-auto", "fuzzy");
    // HDR passthrough hint (ignored by older libmpv builds).
    mpv_set_option_string(m_mpv, "target-colorspace-hint", "yes");

    if (mpv_initialize(m_mpv) < 0) {
        qFatal("could not initialize mpv");
    }

    mpv_observe_property(m_mpv, 0, "time-pos", MPV_FORMAT_DOUBLE);
    mpv_observe_property(m_mpv, 0, "duration", MPV_FORMAT_DOUBLE);
    mpv_observe_property(m_mpv, 0, "pause", MPV_FORMAT_FLAG);
    mpv_observe_property(m_mpv, 0, "speed", MPV_FORMAT_DOUBLE);

    mpv_set_wakeup_callback(m_mpv, wakeup, this);
}

QQuickFramebufferObject::Renderer *MpvObject::createRenderer() const {
    window()->setPersistentGraphics(true);
    window()->setPersistentSceneGraph(true);
    return new MpvRenderer(const_cast<MpvObject *>(this));
}

void MpvObject::doUpdate() { update(); }

void MpvObject::onMpvEvents() {
    while (m_mpv) {
        mpv_event *event = mpv_wait_event(m_mpv, 0);
        if (event->event_id == MPV_EVENT_NONE) {
            break;
        }
        switch (event->event_id) {
        case MPV_EVENT_START_FILE:
            m_reporter.startFile();
            break;
        case MPV_EVENT_FILE_LOADED:
            m_reporter.fileLoaded(getDouble(m_mpv, "time-pos"),
                                  getString(m_mpv, "media-title"),
                                  getString(m_mpv, "path"));
            emit fileLoaded();
            break;
        case MPV_EVENT_END_FILE: {
            auto *ef = static_cast<mpv_event_end_file *>(event->data);
            const QString reason = QString::fromUtf8(endReasonName(ef->reason));
            m_reporter.endFile(reason, getDouble(m_mpv, "time-pos"));
            emit endFile(reason);
            break;
        }
        case MPV_EVENT_SEEK:
            m_reporter.seek(getDouble(m_mpv, "time-pos"));
            break;
        case MPV_EVENT_PROPERTY_CHANGE:
            handlePropertyChange(static_cast<mpv_event_property *>(event->data));
            break;
        case MPV_EVENT_SHUTDOWN:
            return;
        default:
            break;
        }
    }
}

void MpvObject::handlePropertyChange(mpv_event_property *prop) {
    const QString name = QString::fromUtf8(prop->name);
    if (name == QLatin1String("time-pos") && prop->format == MPV_FORMAT_DOUBLE) {
        m_position = *static_cast<double *>(prop->data);
        emit positionChanged();
        emitTimePosThrottled(m_position);
    } else if (name == QLatin1String("duration") &&
               prop->format == MPV_FORMAT_DOUBLE) {
        m_duration = *static_cast<double *>(prop->data);
        emit durationChanged();
    } else if (name == QLatin1String("pause") && prop->format == MPV_FORMAT_FLAG) {
        m_paused = *static_cast<int *>(prop->data) != 0;
        emit pausedChanged();
        m_reporter.pause(m_paused);
    } else if (name == QLatin1String("speed") &&
               prop->format == MPV_FORMAT_DOUBLE) {
        m_speed = *static_cast<double *>(prop->data);
        emit speedChanged();
        m_reporter.speed(m_speed);
    }
}

void MpvObject::emitTimePosThrottled(double pos) {
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (now - m_lastTimePosEmitMs < 1000) {
        return; // host throttles further; ~1/s is plenty for resume tracking.
    }
    m_lastTimePosEmitMs = now;
    m_reporter.timePos(pos);
}

void MpvObject::command(const QStringList &args) {
    if (!m_mpv) {
        return;
    }
    QVector<QByteArray> owned;
    owned.reserve(args.size());
    for (const QString &a : args) {
        owned.push_back(a.toUtf8());
    }
    QVector<const char *> argv;
    argv.reserve(owned.size() + 1);
    for (const QByteArray &a : owned) {
        argv.push_back(a.constData());
    }
    argv.push_back(nullptr);
    mpv_command(m_mpv, argv.data());
}

void MpvObject::setOption(const QString &name, const QString &value) {
    if (m_mpv) {
        mpv_set_option_string(m_mpv, name.toUtf8().constData(),
                              value.toUtf8().constData());
    }
}

void MpvObject::setProperty(const QString &name, const QVariant &value) {
    if (m_mpv) {
        mpv_set_property_string(m_mpv, name.toUtf8().constData(),
                                value.toString().toUtf8().constData());
    }
}

void MpvObject::loadFile(const QString &url) {
    command({QStringLiteral("loadfile"), url, QStringLiteral("replace")});
}

void MpvObject::play() { setProperty(QStringLiteral("pause"), false); }
void MpvObject::pause() { setProperty(QStringLiteral("pause"), true); }
void MpvObject::togglePause() { command({QStringLiteral("cycle"), QStringLiteral("pause")}); }
void MpvObject::stop() { command({QStringLiteral("stop")}); }

void MpvObject::seekAbsolute(double seconds) {
    command({QStringLiteral("seek"), QString::number(seconds),
             QStringLiteral("absolute")});
}

void MpvObject::seekRelative(double seconds) {
    command({QStringLiteral("seek"), QString::number(seconds),
             QStringLiteral("relative")});
}

void MpvObject::setAudioId(qint64 id) {
    setProperty(QStringLiteral("aid"), QString::number(id));
}

void MpvObject::setSubId(qint64 id) {
    setProperty(QStringLiteral("sid"), QString::number(id));
}

void MpvObject::addSubtitle(const QString &path) {
    command({QStringLiteral("sub-add"), path, QStringLiteral("select")});
}

void MpvObject::setSpeed(double speed) {
    setProperty(QStringLiteral("speed"), QString::number(speed));
}

void MpvObject::setVolume(int volume) {
    setProperty(QStringLiteral("volume"), QString::number(volume));
}

void MpvObject::setAnime4kPreset(const QString &preset) {
    const QStringList shaders = m_anime4k->shadersForPreset(preset);
    // Clear then append so the chain order is exactly the preset definition.
    setProperty(QStringLiteral("glsl-shaders"), QString());
    for (const QString &shader : shaders) {
        command({QStringLiteral("change-list"), QStringLiteral("glsl-shaders"),
                 QStringLiteral("append"), shader});
    }
    m_anime4k->setActivePreset(preset);
}
